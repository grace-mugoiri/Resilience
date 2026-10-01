import { describe, expect, it } from 'vitest'
import { generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure'
import { createGiftWraps, openGiftWrap, type ResiliencePayload } from './envelope'

const payload = (): ResiliencePayload => ({
  v: 1,
  type: 'chat.message',
  conversation_id: 'opaque_room_123456789',
  client_message_id: crypto.randomUUID(),
  body: { text: 'private test message' },
})

describe('NIP-17/44/59 envelope', () => {
  it('creates a fresh valid wrapper for the recipient and sender archive', () => {
    const sender = generateSecretKey()
    const recipient = generateSecretKey()
    const message = payload()
    const wrappers = createGiftWraps(sender, [getPublicKey(recipient)], message)

    expect(wrappers).toHaveLength(2)
    expect(new Set(wrappers.map(({ pubkey }) => pubkey)).size).toBe(2)
    expect(wrappers.every(verifyEvent)).toBe(true)
    expect(JSON.stringify(wrappers)).not.toContain('private test message')

    const recipientWrapper = wrappers.find((event) =>
      event.tags.some(([name, value]) => name === 'p' && value === getPublicKey(recipient)),
    )!
    const opened = openGiftWrap(recipientWrapper, recipient)
    expect(opened.senderPublicKey).toBe(getPublicKey(sender))
    expect(opened.payload).toEqual(message)
  })

  it('rejects tampering and unexpected senders', () => {
    const sender = generateSecretKey()
    const recipient = generateSecretKey()
    const wrapper = createGiftWraps(sender, [getPublicKey(recipient)], payload())[0]
    const tampered = { ...wrapper, content: `${wrapper.content}x` }

    expect(() => openGiftWrap(tampered, recipient)).toThrow('Invalid gift wrap')
    expect(() => openGiftWrap(wrapper, recipient, new Set(['00'.repeat(32)]))).toThrow(
      'Unexpected message sender',
    )
  })

  it('rejects duplicate, invalid and expired recipient inputs', () => {
    const sender = generateSecretKey()
    expect(() => createGiftWraps(sender, ['not-a-key'], payload())).toThrow()
    expect(() =>
      createGiftWraps(sender, [getPublicKey(generateSecretKey())], payload(), 1),
    ).toThrow('expiration')
  })
})

