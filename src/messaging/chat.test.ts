import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { conversationIdFor, conversationsOf, EncryptedStore, interpretIncoming, type ChatIdentity, type ChatMessage } from './chat'
import { createGiftWraps, openGiftWrap, type ResiliencePayload } from './envelope'
import { privateDatabase } from '../security/privateDatabase'

const person = (nickname: string, guest = false) => {
  const secret = generateSecretKey()
  const identity: ChatIdentity = { publicKey: getPublicKey(secret), nickname, guest, withPrivateKey: (op) => op(secret) }
  return { secret, identity, pub: identity.publicKey }
}

const payload = (from: string, to: string, text: string, body: Record<string, unknown> = {}): ResiliencePayload => ({
  v: 1,
  type: 'chat.message',
  conversation_id: conversationIdFor(from, to),
  client_message_id: crypto.randomUUID(),
  body: { text, ...body },
})

/** Wraps a message from `sender` and opens the copy addressed to `reader`. */
const deliver = (sender: ReturnType<typeof person>, reader: ReturnType<typeof person>, recipient: string, message: ResiliencePayload) => {
  const wraps = createGiftWraps(sender.secret, [recipient], message)
  const mine = wraps.find((wrap) => wrap.tags.some(([name, value]) => name === 'p' && value === reader.pub))!
  return openGiftWrap(mine, reader.secret)
}

const survivorSent = (survivor: string, counselor: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: crypto.randomUUID(),
  conversationId: conversationIdFor(survivor, counselor),
  peer: counselor,
  peerName: 'Counsellor Grace',
  orgId: '066cbffe-1f9a-4374-865e-c201bb202cc7',
  fromMe: true,
  text: 'Hello',
  createdAt: 100,
  status: 'sending',
  ...overrides,
})

describe('conversation IDs', () => {
  it('are the same from both sides and reveal neither key', () => {
    const a = person('A').pub, b = person('B').pub
    expect(conversationIdFor(a, b)).toBe(conversationIdFor(b, a))
    expect(conversationIdFor(a, b)).toMatch(/^[0-9a-f]{32}$/)
    expect(conversationIdFor(a, b)).not.toContain(a.slice(0, 16))
  })
})

describe('a survivor talking to a counselor', () => {
  it('the counselor receives a new request with the survivor nickname', () => {
    const survivor = person('Quiet River'), counselor = person('Grace')
    const message = payload(survivor.pub, counselor.pub, 'I need someone to talk to', { from_name: 'Quiet River', guest: true })
    const opened = deliver(survivor, counselor, counselor.pub, message)
    const result = interpretIncoming(opened, counselor.pub, 'counselor', [])
    expect(result).toMatchObject({ peer: survivor.pub, peerName: 'Quiet River', peerIsGuest: true, fromMe: false, text: 'I need someone to talk to', status: 'received' })
  })

  it('the survivor receives the reply under the directory name, not the name in the message', () => {
    const survivor = person('Quiet River'), counselor = person('Grace')
    const known = [survivorSent(survivor.pub, counselor.pub)]
    const reply = payload(counselor.pub, survivor.pub, 'I am here.', { from_name: 'Totally the Police' })
    const result = interpretIncoming(deliver(counselor, survivor, survivor.pub, reply), survivor.pub, 'survivor', known)
    expect(result).toMatchObject({ peerName: 'Counsellor Grace', orgId: known[0].orgId, text: 'I am here.', fromMe: false })
  })

  it('a survivor ignores messages from anyone she has not contacted', () => {
    const survivor = person('Quiet River'), stranger = person('Stranger')
    const message = payload(stranger.pub, survivor.pub, 'Hi, I am a counselor')
    expect(interpretIncoming(deliver(stranger, survivor, survivor.pub, message), survivor.pub, 'survivor', [])).toBeNull()
  })

  it('her own copy coming back from the relay marks the message sent', () => {
    const survivor = person('Quiet River'), counselor = person('Grace')
    const sent = survivorSent(survivor.pub, counselor.pub)
    const message = { ...payload(survivor.pub, counselor.pub, 'Hello'), client_message_id: sent.id }
    const result = interpretIncoming(deliver(survivor, survivor, counselor.pub, message), survivor.pub, 'survivor', [sent])
    expect(result).toMatchObject({ id: sent.id, status: 'sent' })
    expect(interpretIncoming(deliver(survivor, survivor, counselor.pub, message), survivor.pub, 'survivor', [{ ...sent, status: 'sent' }])).toBeNull()
  })

  it('refuses a message whose conversation ID does not belong to the two people', () => {
    const survivor = person('Quiet River'), counselor = person('Grace')
    const message = { ...payload(survivor.pub, counselor.pub, 'Hello'), conversation_id: 'x'.repeat(32) }
    expect(interpretIncoming(deliver(survivor, counselor, counselor.pub, message), counselor.pub, 'counselor', [])).toBeNull()
  })

  it('ignores a message it has already saved', () => {
    const survivor = person('Quiet River'), counselor = person('Grace')
    const message = payload(survivor.pub, counselor.pub, 'Hello', { from_name: 'Quiet River' })
    const opened = deliver(survivor, counselor, counselor.pub, message)
    const first = interpretIncoming(opened, counselor.pub, 'counselor', [])!
    expect(interpretIncoming(opened, counselor.pub, 'counselor', [first])).toBeNull()
  })

  it('falls back to "Someone" for a missing or oversized nickname', () => {
    const survivor = person('x'), counselor = person('Grace')
    const message = payload(survivor.pub, counselor.pub, 'Hello', { from_name: '   ' })
    expect(interpretIncoming(deliver(survivor, counselor, counselor.pub, message), counselor.pub, 'counselor', [])?.peerName).toBe('Someone')
  })
})

describe('the conversation list', () => {
  it('groups messages, newest conversation first, and tracks whether she replied', () => {
    const me = person('Grace').pub, a = person('A').pub, b = person('B').pub
    const incoming = (peer: string, at: number, name: string): ChatMessage => ({ id: crypto.randomUUID(), conversationId: conversationIdFor(me, peer), peer, peerName: name, fromMe: false, text: `from ${name}`, createdAt: at, status: 'received' })
    const list = conversationsOf([
      incoming(a, 1, 'A'),
      incoming(b, 2, 'B'),
      { ...incoming(a, 3, 'A'), fromMe: true, text: 'reply', peerName: 'A', status: 'sent' },
    ])
    expect(list.map((item) => [item.peerName, item.repliedByMe, item.last.text])).toEqual([['A', true, 'reply'], ['B', false, 'from B']])
  })
})

describe('messages saved on the phone', () => {
  it('are encrypted, and only her key reads them', async () => {
    const survivor = person('Quiet River'), other = person('Other')
    const store = new EncryptedStore(survivor.identity)
    const message = survivorSent(survivor.pub, person('Grace').pub, { text: 'I need a safe place tonight' })
    await store.put(message)
    const raw = JSON.stringify(await (await privateDatabase()).getAll('messages'))
    expect(raw).not.toContain('safe place')
    expect(raw).not.toContain(message.peer)
    expect(await store.all()).toEqual([message])
    expect(await new EncryptedStore(other.identity).all()).toEqual([])
    await store.removeConversation(message.conversationId)
    expect(await store.all()).toEqual([])
  })
})
