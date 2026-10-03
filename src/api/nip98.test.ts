import { describe, expect, it } from 'vitest'
import { generateSecretKey, getPublicKey, verifyEvent, type NostrEvent } from 'nostr-tools/pure'
import { NostrHttpSigner } from './nip98'

const decode = (header: string) =>
  JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0)))) as NostrEvent

const tag = (event: NostrEvent, name: string) =>
  event.tags.find(([tagName]) => tagName === name)?.[1]

describe('NIP-98 HTTP signer', () => {
  it('signs the exact URL, method, and transmitted body', async () => {
    const privateKey = generateSecretKey()
    const signer = new NostrHttpSigner((operation) => operation(privateKey))
    const body = JSON.stringify({ name: 'Partner A' })
    const event = decode(
      await signer.authorization({
        url: 'http://localhost:8000/v1/orgs',
        method: 'post',
        body,
      }),
    )

    expect(verifyEvent(event)).toBe(true)
    expect(event.kind).toBe(27235)
    expect(event.pubkey).toBe(getPublicKey(privateKey))
    expect(tag(event, 'u')).toBe('http://localhost:8000/v1/orgs')
    expect(tag(event, 'method')).toBe('POST')
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('')
    expect(tag(event, 'payload')).toBe(digest)
  })

  it('binds a sensitive request to its scope, challenge, and client nonce', async () => {
    const privateKey = generateSecretKey()
    const signer = new NostrHttpSigner((operation) => operation(privateKey))
    const event = decode(
      await signer.authorization({
        url: 'http://localhost:8000/v1/admin/orgs/id/approve',
        method: 'POST',
        scope: 'admin:org:approve:id',
        challenge: 'one-use-server-challenge',
      }),
    )

    expect(tag(event, 'scope')).toBe('admin:org:approve:id')
    expect(tag(event, 'challenge')).toBe('one-use-server-challenge')
    expect(tag(event, 'client_nonce')).toMatch(/^[0-9a-f-]{36}$/)
  })
})

