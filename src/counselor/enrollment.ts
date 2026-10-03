import { nip44 } from 'nostr-tools'
import { finalizeEvent, type NostrEvent } from 'nostr-tools/pure'
import { createAuthenticatedApi } from '../api/client'
import type { CounselorEnrollment, CounselorProfile, EncryptedCredential } from '../api/types'
import { accountVault } from '../security/vault'
import { bytesToBase64, randomBytes } from '../security/encoding'

const ENROLLMENT_KEY = 'resilience-counselor-enrollment'
const PROFILE_KEY = 'resilience-counselor-profile'
export type CounselorProfileDraft = Pick<
  CounselorProfile,
  'name' | 'specialties' | 'languages'
> & { about?: string }

const arrayBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer

export const counselorApi = () => createAuthenticatedApi((operation) => accountVault.withPrivateKey(operation))

export const saveProfileDraft = (profile: CounselorProfileDraft) =>
  sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile))

export const readProfileDraft = (): CounselorProfileDraft | null => {
  try {
    const value = sessionStorage.getItem(PROFILE_KEY)
    return value ? (JSON.parse(value) as CounselorProfileDraft) : null
  } catch {
    return null
  }
}

export const saveEnrollment = (enrollment: CounselorEnrollment) => {
  sessionStorage.setItem(ENROLLMENT_KEY, JSON.stringify(enrollment))
  sessionStorage.setItem('counselor-name', enrollment.profile.name)
}

export const readEnrollment = (): CounselorEnrollment | null => {
  try {
    const value = sessionStorage.getItem(ENROLLMENT_KEY)
    return value ? (JSON.parse(value) as CounselorEnrollment) : null
  } catch {
    return null
  }
}

export const recoverEnrollment = async () => {
  const current = readEnrollment()
  const enrollment = current
    ? await counselorApi().getCounselorEnrollment(current.id)
    : (await counselorApi().listMyCounselorEnrollments())[0] ?? null
  if (enrollment) saveEnrollment(enrollment)
  return enrollment
}

export const signProfile = (
  profile: CounselorProfileDraft,
  createdAt = Math.floor(Date.now() / 1000),
): NostrEvent =>
  accountVault.withPrivateKey((privateKey) =>
    finalizeEvent(
      {
        kind: 0,
        created_at: createdAt,
        tags: [],
        content: JSON.stringify({
          display_name: profile.name.trim(),
          about: profile.about?.trim() || undefined,
          specialties: profile.specialties,
          languages: profile.languages,
        }),
      },
      privateKey,
    ),
  )

const supportedType = (
  value: string,
): value is EncryptedCredential['media_type'] =>
  value === 'application/pdf' || value === 'image/jpeg' || value === 'image/png'

export const encryptCredential = async (
  file: Pick<File, 'type' | 'arrayBuffer'>,
  recipientPublicKey: string,
): Promise<EncryptedCredential> => {
  if (!supportedType(file.type)) throw new Error('Use a PDF, JPEG, or PNG file')

  const rawKey = randomBytes(32)
  const iv = randomBytes(12)
  try {
    const documentKey = await crypto.subtle.importKey(
      'raw',
      arrayBuffer(rawKey),
      'AES-GCM',
      false,
      ['encrypt'],
    )
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: arrayBuffer(iv) },
        documentKey,
        await file.arrayBuffer(),
      ),
    )
    const wrappedKey = accountVault.withPrivateKey((privateKey) => {
      const conversationKey = nip44.v2.utils.getConversationKey(privateKey, recipientPublicKey)
      return nip44.v2.encrypt(bytesToBase64(rawKey), conversationKey)
    })
    return {
      v: 1,
      algorithm: 'aes-256-gcm+nip44-v2',
      recipient_pubkey: recipientPublicKey,
      wrapped_key: wrappedKey,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
      media_type: file.type,
    }
  } finally {
    rawKey.fill(0)
  }
}
