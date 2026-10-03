import 'fake-indexeddb/auto'
import { nip44 } from 'nostr-tools'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { afterEach, describe, expect, it } from 'vitest'
import { base64ToBytes } from '../security/encoding'
import { accountVault } from '../security/vault'
import { encryptCredential, signProfile } from './enrollment'

const buffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer

describe('counselor enrollment cryptography', () => {
  afterEach(async () => {
    await accountVault.clear()
  })

  it('signs the public profile with the locally protected counselor key', async () => {
    const account = await accountVault.create('1234', 'Counselor Grace')
    const event = signProfile({
      name: 'Counselor Grace',
      specialties: ['Trauma support'],
      languages: ['English'],
    })

    expect(event.kind).toBe(0)
    expect(event.pubkey).toBe(account.publicKey)
    expect(JSON.parse(event.content)).toMatchObject({ display_name: 'Counselor Grace' })
  })

  it('encrypts a credential with AES-GCM and wraps only its key using NIP-44', async () => {
    const account = await accountVault.create('1234', 'Counselor Grace')
    const reviewerSecret = generateSecretKey()
    const plaintext = new TextEncoder().encode('private credential bytes')
    const document = await encryptCredential(
      new Blob([plaintext], { type: 'application/pdf' }),
      getPublicKey(reviewerSecret),
    )

    const conversationKey = nip44.v2.utils.getConversationKey(reviewerSecret, account.publicKey)
    const rawKey = base64ToBytes(nip44.v2.decrypt(document.wrapped_key, conversationKey))
    const key = await crypto.subtle.importKey('raw', buffer(rawKey), 'AES-GCM', false, ['decrypt'])
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buffer(base64ToBytes(document.iv)) },
      key,
      buffer(base64ToBytes(document.ciphertext)),
    )

    expect(new Uint8Array(decrypted)).toEqual(plaintext)
    expect(document.algorithm).toBe('aes-256-gcm+nip44-v2')
    expect(document).not.toHaveProperty('filename')
    rawKey.fill(0)
  })
})

