import { getEventHash, type NostrEvent, verifyEvent } from 'nostr-tools/pure'
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { nip44, nip59 } from 'nostr-tools'

export const GIFT_WRAP_KIND = 1059
export const RUMOR_KIND = 14
const MAX_WRAP_BYTES = 128 * 1024
const MAX_MESSAGE_BYTES = 8 * 1024
const TWO_DAYS_SECONDS = 2 * 24 * 60 * 60

export const payloadTypes = [
  'chat.message',
  'chat.system',
  'chat.reaction',
  'message.request',
  'message.request.accept',
  'resource.share',
  'counselor.referral',
  'circle.invite',
  'circle.invite.accept',
  'circle.member.remove',
  'group.message',
  'group.membership.changed',
  'conversation.clear.request',
  'verification.attestation',
  'verification.revocation',
  'support.request.receipt',
] as const

export type PayloadType = (typeof payloadTypes)[number]
export type ResiliencePayload = {
  v: 1
  type: PayloadType
  conversation_id: string
  client_message_id: string
  body: Record<string, unknown>
}

export type OpenedMessage = {
  wrapperId: string
  senderPublicKey: string
  createdAt: number
  payload: ResiliencePayload
}

const isHexKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

const randomPastTimestamp = () => {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
  return Math.floor(Date.now() / 1000 - random * TWO_DAYS_SECONDS)
}

export const validatePayload = (value: unknown): ResiliencePayload => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid payload')
  const payload = value as Record<string, unknown>
  if (payload.v !== 1) throw new Error('Unsupported payload version')
  if (!payloadTypes.includes(payload.type as PayloadType)) throw new Error('Unsupported payload type')
  if (typeof payload.conversation_id !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(payload.conversation_id)) {
    throw new Error('Invalid conversation ID')
  }
  if (typeof payload.client_message_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.client_message_id)) {
    throw new Error('Invalid client message ID')
  }
  if (!payload.body || typeof payload.body !== 'object' || Array.isArray(payload.body)) {
    throw new Error('Invalid payload body')
  }
  const encoded = new TextEncoder().encode(JSON.stringify(payload))
  if (encoded.byteLength > MAX_MESSAGE_BYTES) throw new Error('Message payload is too large')
  if ((payload.type === 'chat.message' || payload.type === 'group.message') &&
      (typeof (payload.body as Record<string, unknown>).text !== 'string' ||
        !(payload.body as Record<string, unknown>).text)) {
    throw new Error('Message text is required')
  }
  return payload as ResiliencePayload
}

const createWrap = (
  seal: NostrEvent,
  recipientPublicKey: string,
  expiresAt: number,
): NostrEvent => {
  const wrapperKey = generateSecretKey()
  try {
    const conversationKey = nip44.v2.utils.getConversationKey(wrapperKey, recipientPublicKey)
    return finalizeEvent(
      {
        kind: GIFT_WRAP_KIND,
        content: nip44.v2.encrypt(JSON.stringify(seal), conversationKey),
        created_at: randomPastTimestamp(),
        tags: [
          ['p', recipientPublicKey],
          ['expiration', String(expiresAt)],
        ],
      },
      wrapperKey,
    )
  } finally {
    wrapperKey.fill(0)
  }
}

export const createGiftWraps = (
  senderPrivateKey: Uint8Array,
  recipients: string[],
  payload: ResiliencePayload,
  expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
): NostrEvent[] => {
  validatePayload(payload)
  const senderPublicKey = getPublicKey(senderPrivateKey)
  const uniqueRecipients = [...new Set([...recipients, senderPublicKey])]
  if (!uniqueRecipients.length || uniqueRecipients.some((key) => !isHexKey(key))) {
    throw new Error('Every recipient must be a lowercase hexadecimal public key')
  }
  if (expiresAt <= Date.now() / 1000) throw new Error('Message expiration must be in the future')
  const rumor = nip59.createRumor(
    {
      kind: RUMOR_KIND,
      tags: uniqueRecipients.map((publicKey) => ['p', publicKey]),
      content: JSON.stringify(payload),
      created_at: Math.floor(Date.now() / 1000),
    },
    senderPrivateKey,
  )
  return uniqueRecipients.map((recipient) => {
    const seal = nip59.createSeal(rumor, senderPrivateKey, recipient)
    return createWrap(seal, recipient, expiresAt)
  })
}

export const openGiftWrap = (
  wrapper: NostrEvent,
  recipientPrivateKey: Uint8Array,
  expectedParticipants?: ReadonlySet<string>,
): OpenedMessage => {
  if (new TextEncoder().encode(JSON.stringify(wrapper)).byteLength > MAX_WRAP_BYTES) {
    throw new Error('Gift wrap is too large')
  }
  // Rebuild the wire representation so nostr-tools cannot reuse a prior cached verification
  // marker after an object has been mutated by application code.
  const wireWrapper: NostrEvent = {
    id: wrapper.id,
    pubkey: wrapper.pubkey,
    created_at: wrapper.created_at,
    kind: wrapper.kind,
    tags: wrapper.tags.map((tag) => [...tag]),
    content: wrapper.content,
    sig: wrapper.sig,
  }
  if (wireWrapper.kind !== GIFT_WRAP_KIND || !verifyEvent(wireWrapper)) {
    throw new Error('Invalid gift wrap')
  }
  const now = Math.floor(Date.now() / 1000)
  if (wireWrapper.created_at > now + 10 * 60 || wireWrapper.created_at < now - 3 * 24 * 60 * 60) {
    throw new Error('Gift wrap timestamp is outside the accepted window')
  }
  const recipientPublicKey = getPublicKey(recipientPrivateKey)
  const recipientTags = wireWrapper.tags.filter(([name]) => name === 'p').map(([, value]) => value)
  if (recipientTags.length !== 1 || recipientTags[0] !== recipientPublicKey) {
    throw new Error('Gift wrap is not addressed to this identity')
  }
  const expiration = wireWrapper.tags.find(([name]) => name === 'expiration')?.[1]
  if (!expiration || !/^\d+$/.test(expiration) || Number(expiration) <= Date.now() / 1000) {
    throw new Error('Gift wrap is expired or has no valid expiration')
  }
  const rumor = nip59.unwrapEvent(wireWrapper, recipientPrivateKey)
  if (rumor.kind !== RUMOR_KIND || getEventHash(rumor) !== rumor.id) throw new Error('Invalid rumor')
  if (rumor.created_at > now + 10 * 60) throw new Error('Rumor is dated in the future')
  if (!rumor.tags.some(([name, value]) => name === 'p' && value === recipientPublicKey)) {
    throw new Error('Rumor does not include this recipient')
  }
  if (expectedParticipants && !expectedParticipants.has(rumor.pubkey)) {
    throw new Error('Unexpected message sender')
  }
  const payload = validatePayload(JSON.parse(rumor.content))
  return {
    wrapperId: wireWrapper.id,
    senderPublicKey: rumor.pubkey,
    createdAt: rumor.created_at,
    payload,
  }
}
