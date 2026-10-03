import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { bytesToBase64 } from '../security/encoding'

const AUTH_KIND = 27235
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH'])

export type PrivateKeyProvider = <T>(operation: (privateKey: Uint8Array) => T) => T

export type AuthorizationInput = {
  url: string
  method: string
  body?: string
  scope?: string
  challenge?: string
}

const sha256 = async (value: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')

export class NostrHttpSigner {
  constructor(private readonly withPrivateKey: PrivateKeyProvider) {}

  publicKey(): string {
    return this.withPrivateKey((privateKey) => getPublicKey(privateKey))
  }

  async authorization({ url, method, body, scope, challenge }: AuthorizationInput) {
    const normalizedMethod = method.toUpperCase()
    const tags: string[][] = [
      ['u', url],
      ['method', normalizedMethod],
    ]
    if (BODY_METHODS.has(normalizedMethod)) tags.push(['payload', await sha256(body ?? '')])
    if (scope) tags.push(['scope', scope])
    if (challenge) tags.push(['challenge', challenge])
    if (scope || challenge) tags.push(['client_nonce', crypto.randomUUID()])

    const event = this.withPrivateKey((privateKey) =>
      finalizeEvent(
        {
          kind: AUTH_KIND,
          created_at: Math.floor(Date.now() / 1000),
          content: '',
          tags,
        },
        privateKey,
      ),
    )
    return `Nostr ${bytesToBase64(new TextEncoder().encode(JSON.stringify(event)))}`
  }
}

