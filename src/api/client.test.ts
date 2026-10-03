import { afterEach, describe, expect, it, vi } from 'vitest'
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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('binds the browser fetch implementation when no test fetcher is supplied', async () => {
    const nativeLikeFetch = vi.fn(function (this: typeof globalThis) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(json({ status: 'ok' }))
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', nativeLikeFetch)

    const api = new ResilienceApi({ apiBase: 'http://localhost:8000' })

    await expect(api.health()).resolves.toEqual({ status: 'ok' })
    expect(nativeLikeFetch).toHaveBeenCalledOnce()
  })

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

  it('challenge-binds encrypted counselor credential submissions to the application', async () => {
    const calls: Array<{ url: string; request: RequestInit }> = []
    const fetcher: typeof fetch = async (input, request = {}) => {
      const url = String(input)
      calls.push({ url, request })
      if (url.endsWith('/v1/auth/challenges')) {
        return json({ challenge: 'credential-challenge', scope: 'counselor:credentials:enrollment-id', expires_at: '' }, 201)
      }
      return json({ id: 'enrollment-id', status: 'under_review' })
    }
    const secret = generateSecretKey()
    const api = new ResilienceApi({
      apiBase: 'http://localhost:8000',
      signer: new NostrHttpSigner((operation) => operation(secret)),
      fetcher,
    })
    const documents = [{
      v: 1 as const,
      algorithm: 'aes-256-gcm+nip44-v2' as const,
      recipient_pubkey: 'ab'.repeat(32),
      wrapped_key: 'wrapped',
      iv: 'iv',
      ciphertext: 'ciphertext',
      media_type: 'application/pdf' as const,
    }]

    await api.submitCounselorCredentials('enrollment-id', documents)

    expect(calls.map(({ url }) => url)).toEqual([
      'http://localhost:8000/v1/auth/challenges',
      'http://localhost:8000/v1/counselor-enrollments/enrollment-id/credentials',
    ])
    expect(tag(authEvent(calls[1].request), 'scope')).toBe('counselor:credentials:enrollment-id')
    expect(JSON.parse(calls[1].request.body as string)).toEqual({ documents })
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

  it('reads organization portal state with the operational identity', async () => {
    const calls: string[] = []
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/dashboard')) return json({ active_invites: 2 })
      if (url.endsWith('/counselor-invites')) return json([])
      return json({ organization: { id: 'org-id' }, actor: 'operational', operational_key: {} })
    }
    const secret = generateSecretKey()
    const api = new ResilienceApi({
      apiBase: 'http://localhost:8000',
      signer: new NostrHttpSigner((operation) => operation(secret)),
      fetcher,
    })

    await api.myOrganization()
    await api.organizationDashboard('org-id')
    await api.listCounselorInvites('org-id')

    expect(calls).toEqual([
      'http://localhost:8000/v1/orgs/me',
      'http://localhost:8000/v1/orgs/org-id/dashboard',
      'http://localhost:8000/v1/orgs/org-id/counselor-invites',
    ])
  })

  it('signs private-room routing and support-request reads without caching', async () => {
    const calls: Array<{ url: string; request: RequestInit }> = []
    const fetcher: typeof fetch = async (input, request = {}) => {
      calls.push({ url: String(input), request })
      return json({ room_id: 'room-id', membership_revision: 2, recipients: [] })
    }
    const secret = generateSecretKey()
    const api = new ResilienceApi({
      apiBase: 'http://localhost:8000',
      signer: new NostrHttpSigner((operation) => operation(secret)),
      fetcher,
    })

    await api.supportGroupRecipients('group/id')
    await api.circleRecipients()
    await api.listDisbursements('org id', 'CREATED')

    expect(calls.map(({ url }) => url)).toEqual([
      'http://localhost:8000/v1/support-groups/group%2Fid/recipients',
      'http://localhost:8000/v1/circle/recipients',
      'http://localhost:8000/v1/orgs/org%20id/disbursements?state=CREATED',
    ])
    for (const call of calls) {
      expect(call.request.cache).toBe('no-store')
      expect(verifyEvent(authEvent(call.request))).toBe(true)
      expect(tag(authEvent(call.request), 'u')).toBe(call.url)
    }
  })

  it('sends support-group creation metadata in the challenge-bound body', async () => {
    const calls: Array<{ url: string; request: RequestInit }> = []
    const fetcher: typeof fetch = async (input, request = {}) => {
      calls.push({ url: String(input), request })
      if (String(input).endsWith('/v1/auth/challenges')) {
        return json({ challenge: 'fresh', scope: 'group:create:org', expires_at: '' }, 201)
      }
      return json({ id: 'group', org_id: 'org', active: true }, 201)
    }
    const secret = generateSecretKey()
    const api = new ResilienceApi({
      signer: new NostrHttpSigner((operation) => operation(secret)),
      fetcher,
    })
    await api.createSupportGroup('org', {
      title: 'Healing after abuse',
      access: 'request',
    })
    expect(JSON.parse(calls[1].request.body as string)).toEqual({
      title: 'Healing after abuse',
      access: 'request',
    })
  })
})
