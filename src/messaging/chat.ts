// Private one-to-one chat between a survivor and a counselor, on top of the NIP-17 client.
//
// Messages are kept on the phone so a conversation survives a page load. For an account they are
// stored encrypted to her own key (NIP-44), so they can only be read after she enters her PIN.
// For a guest they live in memory and disappear with the guest key when she leaves.
import { nip44 } from 'nostr-tools'
import { sha256 } from '@noble/hashes/sha2.js'
import { requirePlatformPublicKey } from '../config/runtime'
import { API_BASE } from '../support/directory'
import { bytesToHex } from '../security/encoding'
import { privateDatabase } from '../security/privateDatabase'
import { accountVault, GuestIdentity } from '../security/vault'
import type { OpenedMessage, PayloadType, ResiliencePayload } from './envelope'
import type { RelayMessagingClient } from './relayClient'
import { createMessagingClient } from './service'

export type Role = 'survivor' | 'counselor'

export type ChatIdentity = {
  publicKey: string
  nickname: string
  guest: boolean
  withPrivateKey: <T>(operation: (privateKey: Uint8Array) => T) => T
}

export type ChatMessage = {
  id: string
  conversationId: string
  peer: string
  /** Survivor side: the name from the verified directory. Counselor side: the nickname she gave. */
  peerName: string
  /** Survivor side only: the organisation that verified the counselor. */
  orgId?: string
  peerIsGuest?: boolean
  fromMe: boolean
  text: string
  createdAt: number
  status: 'sending' | 'sent' | 'received'
}

export type SecureEvent = {
  id: string
  type: Exclude<PayloadType, 'chat.message'>
  conversationId: string
  sender: string
  fromMe: boolean
  body: Record<string, unknown>
  createdAt: number
}

export const MAX_TEXT = 2000
const MAX_NAME = 40
const HEX64 = /^[0-9a-f]{64}$/

/** The same ID on both phones: a hash of the two public keys, not the keys themselves. */
export const conversationIdFor = (a: string, b: string) =>
  bytesToHex(sha256(new TextEncoder().encode([a, b].sort().join(':')))).slice(0, 32)

const cleanName = (value: unknown) => {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : ''
  return name || 'Someone'
}

// ---- identity -------------------------------------------------------------------------------

let guest: GuestIdentity | undefined

/** A throwaway key for this page only. Leaving or reloading the page drops it. */
export function guestIdentity(): ChatIdentity {
  guest ??= new GuestIdentity()
  const current = guest
  // A short tag so a counselor can tell two guests apart. It names a throwaway key, not a person.
  const nickname = `Guest ${current.publicKey.slice(-4).toUpperCase()}`
  return { publicKey: current.publicKey, nickname, guest: true, withPrivateKey: (op) => current.withPrivateKey(op) }
}

/** The unlocked account, or null when there is no account or it is locked. */
export async function accountIdentity(): Promise<ChatIdentity | null> {
  const summary = await accountVault.summary()
  if (!summary || !accountVault.isUnlocked()) return null
  return {
    publicKey: summary.publicKey,
    nickname: summary.nickname,
    guest: false,
    withPrivateKey: (op) => accountVault.withPrivateKey(op),
  }
}

// ---- storage --------------------------------------------------------------------------------

export interface MessageStore {
  all(): Promise<ChatMessage[]>
  put(message: ChatMessage): Promise<void>
  removeConversation(conversationId: string): Promise<void>
}

export interface SecureEventStore {
  all(): Promise<SecureEvent[]>
  put(event: SecureEvent): Promise<void>
}

export class MemoryStore implements MessageStore {
  private items = new Map<string, ChatMessage>()
  async all() { return [...this.items.values()].sort((a, b) => a.createdAt - b.createdAt) }
  async put(message: ChatMessage) { this.items.set(message.id, message) }
  async removeConversation(conversationId: string) {
    for (const [id, message] of this.items) if (message.conversationId === conversationId) this.items.delete(id)
  }
}

export class MemoryEventStore implements SecureEventStore {
  private items = new Map<string, SecureEvent>()
  async all() { return [...this.items.values()].sort((a, b) => a.createdAt - b.createdAt) }
  async put(event: SecureEvent) { this.items.set(event.id, event) }
}

export class EncryptedStore implements MessageStore {
  constructor(private readonly identity: ChatIdentity) {}

  private key() {
    return this.identity.withPrivateKey((privateKey) =>
      nip44.v2.utils.getConversationKey(privateKey, this.identity.publicKey))
  }

  async all() {
    const key = this.key()
    const records = await (await privateDatabase()).getAllFromIndex('messages', 'by-created')
    const messages: ChatMessage[] = []
    for (const record of records) {
      try {
        messages.push(JSON.parse(nip44.v2.decrypt(record.ciphertext, key)) as ChatMessage)
      } catch {
        // Written by another account on this phone, or damaged. Skip it.
      }
    }
    return messages.sort((a, b) => a.createdAt - b.createdAt)
  }

  async put(message: ChatMessage) {
    const ciphertext = nip44.v2.encrypt(JSON.stringify(message), this.key())
    await (await privateDatabase()).put('messages', { id: message.id, createdAt: message.createdAt, ciphertext })
  }

  async removeConversation(conversationId: string) {
    const database = await privateDatabase()
    for (const message of await this.all()) {
      if (message.conversationId === conversationId) await database.delete('messages', message.id)
    }
  }
}

export class EncryptedEventStore implements SecureEventStore {
  constructor(private readonly identity: ChatIdentity) {}

  private key() {
    return this.identity.withPrivateKey((privateKey) =>
      nip44.v2.utils.getConversationKey(privateKey, this.identity.publicKey))
  }

  async all() {
    const key = this.key()
    const records = await (await privateDatabase()).getAllFromIndex('events', 'by-created')
    const events: SecureEvent[] = []
    for (const record of records) {
      try { events.push(JSON.parse(nip44.v2.decrypt(record.ciphertext, key)) as SecureEvent) }
      catch { /* Belongs to another restored identity or is damaged. */ }
    }
    return events.sort((a, b) => a.createdAt - b.createdAt)
  }

  async put(event: SecureEvent) {
    const ciphertext = nip44.v2.encrypt(JSON.stringify(event), this.key())
    await (await privateDatabase()).put('events', { id: event.id, createdAt: event.createdAt, ciphertext })
  }
}

export const storeFor = (identity: ChatIdentity): MessageStore =>
  identity.guest ? new MemoryStore() : new EncryptedStore(identity)
export const eventStoreFor = (identity: ChatIdentity): SecureEventStore =>
  identity.guest ? new MemoryEventStore() : new EncryptedEventStore(identity)

// ---- incoming messages ----------------------------------------------------------------------

/**
 * Decide what an opened gift wrap means for this phone. Returns the message to save, or null to
 * ignore it. Pure, so the rules can be tested without relays.
 *
 * - A copy of her own message coming back from a relay confirms that it was sent.
 * - A survivor only accepts messages from counselors she started a conversation with. The name
 *   shown is the one from the verified directory, never the name inside the message.
 * - A counselor accepts new conversations. The survivor's nickname comes from the message.
 */
export function interpretIncoming(
  opened: OpenedMessage,
  me: string,
  role: Role,
  known: ChatMessage[],
): ChatMessage | null {
  const { payload } = opened
  if (payload.type !== 'chat.message') return null
  const text = payload.body.text
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return null
  const existing = known.find((message) => message.id === payload.client_message_id)

  if (opened.senderPublicKey === me) {
    if (existing?.fromMe) return existing.status === 'sending' ? { ...existing, status: 'sent' } : null
    // Sent from another phone with the same account: only keep it if we know the conversation.
    const conversation = known.find((message) => message.conversationId === payload.conversation_id)
    if (!conversation || existing) return null
    return { ...conversation, id: payload.client_message_id, fromMe: true, text, createdAt: opened.createdAt, status: 'sent' }
  }

  if (existing) return null
  const conversationId = conversationIdFor(me, opened.senderPublicKey)
  if (payload.conversation_id !== conversationId) return null
  const conversation = known.find((message) => message.peer === opened.senderPublicKey)
  if (role === 'survivor' && !conversation) return null
  return {
    id: payload.client_message_id,
    conversationId,
    peer: opened.senderPublicKey,
    peerName: role === 'survivor' ? conversation!.peerName : cleanName(payload.body.from_name),
    orgId: conversation?.orgId,
    peerIsGuest: role === 'counselor' ? payload.body.guest === true : undefined,
    fromMe: false,
    text,
    createdAt: opened.createdAt,
    status: 'received',
  }
}

export type Conversation = { conversationId: string; peer: string; peerName: string; orgId?: string; peerIsGuest?: boolean; last: ChatMessage; repliedByMe: boolean }

/** Newest conversation first, each with its latest message. */
export function conversationsOf(messages: ChatMessage[]): Conversation[] {
  const byId = new Map<string, Conversation>()
  for (const message of [...messages].sort((a, b) => a.createdAt - b.createdAt)) {
    const current = byId.get(message.conversationId)
    byId.set(message.conversationId, {
      conversationId: message.conversationId,
      peer: message.peer,
      peerName: message.fromMe ? current?.peerName ?? message.peerName : message.peerName,
      orgId: message.orgId ?? current?.orgId,
      peerIsGuest: message.peerIsGuest ?? current?.peerIsGuest,
      last: message,
      repliedByMe: Boolean(current?.repliedByMe || message.fromMe),
    })
  }
  return [...byId.values()].sort((a, b) => b.last.createdAt - a.last.createdAt)
}

// ---- the live connection --------------------------------------------------------------------

export class ChatSetupError extends Error {}

/** Connects to the relays named in the signed client configuration and keeps the store up to date. */
export class Messenger {
  private constructor(
    private readonly identity: ChatIdentity,
    private readonly role: Role,
    private readonly store: MessageStore,
    private readonly eventStore: SecureEventStore,
    private readonly client: RelayMessagingClient,
    private readonly onChange: (messages: ChatMessage[]) => void,
    private readonly onEvents: (events: SecureEvent[]) => void,
  ) {}

  static async connect(
    identity: ChatIdentity,
    role: Role,
    onChange: (messages: ChatMessage[]) => void,
    onEvents: (events: SecureEvent[]) => void = () => undefined,
  ) {
    let platformPublicKey: string
    try {
      platformPublicKey = requirePlatformPublicKey()
    } catch (error) {
      throw new ChatSetupError(error instanceof Error ? error.message : 'The platform public key is invalid.')
    }
    const store = storeFor(identity)
    const eventStore = eventStoreFor(identity)
    const client = await createMessagingClient({
      apiBase: API_BASE,
      platformPublicKey,
      withPrivateKey: identity.withPrivateKey,
    })
    const messenger = new Messenger(identity, role, store, eventStore, client, onChange, onEvents)
    onChange(await store.all())
    onEvents(await eventStore.all())
    client.start((opened) => messenger.receive(opened))
    return messenger
  }

  // Messages are handled one at a time so two arriving together can't overwrite each other.
  private queue = Promise.resolve()

  private receive(opened: OpenedMessage) {
    this.queue = this.queue.then(async () => {
      if (opened.payload.type !== 'chat.message') {
        const known = await this.eventStore.all()
        if (known.some((event) => event.id === opened.payload.client_message_id)) return
        await this.eventStore.put({
          id: opened.payload.client_message_id,
          type: opened.payload.type,
          conversationId: opened.payload.conversation_id,
          sender: opened.senderPublicKey,
          fromMe: opened.senderPublicKey === this.identity.publicKey,
          body: opened.payload.body,
          createdAt: opened.createdAt,
        })
        this.onEvents(await this.eventStore.all())
        return
      }
      const message = interpretIncoming(opened, this.identity.publicKey, this.role, await this.store.all())
      if (!message) return
      await this.store.put(message)
      this.onChange(await this.store.all())
    })
    return this.queue
  }

  async send(peer: string, peerName: string, text: string, orgId?: string) {
    const body = text.trim()
    if (!HEX64.test(peer)) throw new Error('Unknown recipient')
    if (!body || body.length > MAX_TEXT) throw new Error(`Messages can be up to ${MAX_TEXT} characters`)
    const conversationId = conversationIdFor(this.identity.publicKey, peer)
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId,
      peer,
      peerName,
      orgId,
      fromMe: true,
      text: body,
      createdAt: Math.floor(Date.now() / 1000),
      status: 'sending',
    }
    await this.store.put(message)
    this.onChange(await this.store.all())
    const payload: ResiliencePayload = {
      v: 1,
      type: 'chat.message',
      conversation_id: conversationId,
      client_message_id: message.id,
      // Only a survivor's nickname travels with the message. A counselor's name comes from the directory.
      body: this.role === 'survivor'
        ? { text: body, from_name: this.identity.nickname, guest: this.identity.guest }
        : { text: body },
    }
    await this.client.send([peer], payload)
  }

  async sendEvent(
    recipients: string[],
    type: Exclude<PayloadType, 'chat.message'>,
    conversationId: string,
    body: Record<string, unknown>,
  ) {
    if (!recipients.length || recipients.some((peer) => !HEX64.test(peer))) {
      throw new Error('Unknown recipient')
    }
    const id = crypto.randomUUID()
    const event: SecureEvent = {
      id,
      type,
      conversationId,
      sender: this.identity.publicKey,
      fromMe: true,
      body,
      createdAt: Math.floor(Date.now() / 1000),
    }
    await this.eventStore.put(event)
    this.onEvents(await this.eventStore.all())
    await this.client.send(recipients, {
      v: 1,
      type,
      conversation_id: conversationId,
      client_message_id: id,
      body,
    })
    return id
  }

  async clearConversation(conversationId: string) {
    await this.store.removeConversation(conversationId)
    this.onChange(await this.store.all())
  }

  stop() {
    this.client.destroy()
  }
}
