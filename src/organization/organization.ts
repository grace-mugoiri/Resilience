import { nip44 } from 'nostr-tools'
import { finalizeEvent, type NostrEvent } from 'nostr-tools/pure'
import { createAuthenticatedApi } from '../api/client'
import type { CounselorEnrollment, EncryptedCredential } from '../api/types'
import { base64ToBytes } from '../security/encoding'
import { organizationVault } from './organizationVault'

const arrayBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer

export const rootOrganizationApi = () =>
  createAuthenticatedApi((operation) => organizationVault.withRootKey(operation))

export const organizationApi = () =>
  createAuthenticatedApi((operation) => organizationVault.withOperationalKey(operation))

export const signOperationalAuthorization = (
  operationalPublicKey: string,
  now = Math.floor(Date.now() / 1000),
): NostrEvent =>
  organizationVault.withRootKey((privateKey) =>
    finalizeEvent(
      {
        kind: 30382,
        created_at: now,
        content: '',
        tags: [
          ['d', `resilience:org-operations:${operationalPublicKey}`],
          ['p', operationalPublicKey],
          ['valid_from', String(now)],
          ['expiration', String(now + 365 * 24 * 60 * 60)],
          ['scope', 'roster'],
          ['scope', 'verification'],
        ],
      },
      privateKey,
    ),
  )

export const signRoster = (
  members: string[],
  now = Math.floor(Date.now() / 1000),
): NostrEvent =>
  organizationVault.withOperationalKey((privateKey) =>
    finalizeEvent(
      {
        kind: 30000,
        created_at: now,
        content: '',
        tags: [
          ['d', 'verified-counsellors'],
          ['expiration', String(now + 30 * 24 * 60 * 60)],
          ...Array.from(new Set(members)).map((pubkey) => ['p', pubkey]),
        ],
      },
      privateKey,
    ),
  )

export const nip05Document = (rootPublicKey: string) =>
  JSON.stringify({ names: { _: rootPublicKey } }, null, 2)

export type DecryptedCredential = {
  name: string
  mediaType: EncryptedCredential['media_type']
  bytes: Uint8Array
}

export const decryptCredential = async (
  enrollment: Pick<CounselorEnrollment, 'counsellor_pubkey'>,
  document: EncryptedCredential,
  index: number,
): Promise<DecryptedCredential> => {
  const rawKey = organizationVault.withReviewKey((privateKey) => {
    const conversationKey = nip44.v2.utils.getConversationKey(
      privateKey,
      enrollment.counsellor_pubkey,
    )
    return base64ToBytes(nip44.v2.decrypt(document.wrapped_key, conversationKey))
  })
  try {
    const key = await crypto.subtle.importKey('raw', arrayBuffer(rawKey), 'AES-GCM', false, [
      'decrypt',
    ])
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: arrayBuffer(base64ToBytes(document.iv)) },
        key,
        arrayBuffer(base64ToBytes(document.ciphertext)),
      ),
    )
    const extension =
      document.media_type === 'application/pdf'
        ? 'pdf'
        : document.media_type === 'image/png'
          ? 'png'
          : 'jpg'
    return { name: `credential-${index + 1}.${extension}`, mediaType: document.media_type, bytes: plaintext }
  } finally {
    rawKey.fill(0)
  }
}
