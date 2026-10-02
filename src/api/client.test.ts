import { describe, expect, it } from 'vitest'
import { generateSecretKey, verifyEvent, type NostrEvent } from 'nostr-tools/pure'
import { ResilienceApi } from './client'
import { NostrHttpSigner } from './nip98'

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const authEvent = (request: RequestInit) => {
  const header = new Headers(request.headers).get('Authorization')!
  return JSON.parse(atob(header.slice(6))) as NostrEvent
}

const tag = (event: NostrEvent, name: string) =>
  event.tags.find(([tagName]) => tagName === name)?.[1]

describe('Resilience API client', () => {
  it('performs challenge-bound sensitive operations', async () => {
    const calls: Array<{ url: string; request: RequestInit }> = []
    const fetcher: typeof fetch = async (input, request = {}) => {
      const url = String(input)
      calls.push({ url, request })
      if (url.endsWith('/v1/auth/challenges')) {
        return json({
          challenge: 'challenge-from-server',
          scope: 'group:create:org-id',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        }, 201)
      }
      return json({ id: 'group-id', org_id: 'org-id', active: true }, 201)
    }
    const secret = generateSecretKey()
    const api = new ResilienceApi({
      apiBase: 'http://localhost:8000',
      signer: new NostrHttpSigner((operation) => operation(secret)),
      fetcher,
    })

    await expect(api.createSupportGroup('org-id')).resolves.toEqual({
      id: 'group-id',
      org_id: 'org-id',
      active: true,
    })
    expect(calls.map(({ url }) => url)).toEqual([
      'http://localhost:8000/v1/auth/challenges',
      'http://localhost:8000/v1/orgs/org-id/support-groups',
    ])
    const challengeAuth = authEvent(calls[0].request)
    const operationAuth = authEvent(calls[1].request)
    expect(verifyEvent(challengeAuth)).toBe(true)
    expect(verifyEvent(operationAuth)).toBe(true)
    expect(tag(operationAuth, 'scope')).toBe('group:create:org-id')
    expect(tag(operationAuth, 'challenge')).toBe('challenge-from-server')
  })

  it('preserves the idempotency key and hashes the exact disbursement body', async () => {
    const calls: Array<{ url: string; request: RequestInit }> = []
    const fetcher: typeof fetch = async (input, request = {}) => {
      const url = String(input)
      calls.push({ url, request })
      if (url.endsWith('/v1/auth/challenges')) {
        return json({ challenge: 'fresh', scope: 'disbursement:create:org', expires_at: '' }, 201)
      }
      return json({ id: 'payment' }, 201)
    }
    const secret = generateSecretKey()
    const api = new ResilienceApi({
      signer: new NostrHttpSigner((operation) => operation(secret)),
      fetcher,
    })
    const body = {
      amount_sat: 10_000,
      amount_kes: 1_700,
      rate_source: 'test rate',
      reason_code: 'transport' as const,
    }

    await api.createDisbursement('org', body, 'stable-request-key')
    const operation = calls[1].request
    expect(new Headers(operation.headers).get('Idempotency-Key')).toBe('stable-request-key')
    const digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(operation.body as string)),
      ),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('')
    expect(tag(authEvent(operation), 'payload')).toBe(digest)
  })

  it('surfaces FastAPI details without leaking cookies or referrers', async () => {
    let request: RequestInit | undefined
    const api = new ResilienceApi({
      fetcher: async (_input, init) => {
        request = init
        return json({ detail: 'organisation not found' }, 404)
      },
    })

    await expect(api.listCounselors('missing')).rejects.toMatchObject({
      status: 404,
      detail: 'organisation not found',
    })
    expect(request?.credentials).toBe('omit')
    expect(request?.referrerPolicy).toBe('no-referrer')
  })
})

