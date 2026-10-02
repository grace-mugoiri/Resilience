import { finalizeEvent, getPublicKey, type EventTemplate, type NostrEvent } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import { normalizeURL } from 'nostr-tools/utils'
import type { SubCloser } from 'nostr-tools/abstract-pool'
import { createGiftWraps, openGiftWrap, type OpenedMessage, type ResiliencePayload } from './envelope'
import { MessagingRepository } from './repository'

type PrivateKeyProvider = <T>(operation: (privateKey: Uint8Array) => T) => T
type MessageHandler = (message: OpenedMessage) => void | Promise<void>
type InvalidHandler = (event: unknown, error: unknown) => void

export class RelayMessagingClient {
  private readonly pool: SimplePool
  private readonly repository: MessagingRepository
  private subscription?: SubCloser
  private retryTimer?: number
  private onlineListener = () => void this.flushOutbox()
  // Bumped on every start/stop so a slow login can't open a subscription after stop().
  private generation = 0
  // Called when a relay has sent its NIP-42 challenge and we have signed the answer.
  private readonly challenged = new Map<string, () => void>()
  private readonly signAuth = async (template: EventTemplate) =>
    this.withPrivateKey((privateKey) => finalizeEvent(template, privateKey))

  constructor(
    private readonly relays: string[],
    private readonly withPrivateKey: PrivateKeyProvider,
    repository = new MessagingRepository(),
  ) {
    if (new Set(relays).size < 2) throw new Error('At least two distinct relays are required')
    this.repository = repository
    // Our relays (nostr-rs-relay with nip42_dms) only serve gift wraps to a logged-in recipient,
    // and they never ask twice: they send one AUTH challenge on connect and then silently leave
    // gift wraps out of every answer. So answer the challenge as soon as it arrives, on every
    // connection and reconnection, instead of waiting for an "auth-required" that never comes.
    this.pool = new SimplePool({ enableReconnect: true })
    // SimplePool's constructor type doesn't list this option, but the pool reads the property.
    this.pool.automaticallyAuth = (url: string) => async (template: EventTemplate) => {
      const signed = await this.signAuth(template)
      this.challenged.get(url)?.()
      return signed
    }
  }

  /** Connects to each relay and waits until it has accepted our login, or gives up after a few seconds. */
  private async authenticate() {
    await Promise.allSettled(
      this.relays.map(async (relayUrl) => {
        const url = normalizeURL(relayUrl)
        const challenged = new Promise<boolean>((resolve) => {
          this.challenged.set(url, () => resolve(true))
          window.setTimeout(() => resolve(false), 3000)
        })
        try {
          const relay = await this.pool.ensureRelay(url, { connectionTimeout: 5000 })
          // auth() returns the login already in flight, and resolves when the relay says OK.
          if (await challenged) await relay.auth(this.signAuth)
        } finally {
          this.challenged.delete(url)
        }
      }),
    )
  }

  private publicKey() {
    return this.withPrivateKey((privateKey) => getPublicKey(privateKey))
  }

  async send(recipients: string[], payload: ResiliencePayload) {
    const wrappers = this.withPrivateKey((privateKey) =>
      createGiftWraps(privateKey, recipients, payload),
    )
    await Promise.all(wrappers.map((wrapper) => this.repository.enqueue(wrapper, this.relays)))
    await this.flushOutbox()
    return payload.client_message_id
  }

  async flushOutbox() {
    if (!navigator.onLine) return
    const records = await this.repository.pending()
    await Promise.all(
      records.flatMap((record) =>
        Object.entries(record.relays)
          .filter(([, delivery]) => delivery.status === 'pending' && delivery.nextAttemptAt <= Date.now())
          .map(async ([relay]) => {
            try {
              const [result] = this.pool.publish([relay], record.event, {
                onauth: async (template) =>
                  this.withPrivateKey((privateKey) => finalizeEvent(template, privateKey)),
                maxWait: 5000,
              })
              await result
              await this.repository.deliveryResult(record.id, relay)
            } catch (error) {
              await this.repository.deliveryResult(record.id, relay, error)
            }
          }),
      ),
    )
  }

  start(onMessage: MessageHandler, onInvalid?: InvalidHandler) {
    this.stop()
    const generation = this.generation
    const publicKey = this.publicKey()
    const seenInSession = new Set<string>()
    // Subscribe only after logging in. A relay answers a subscription once, with what this
    // connection may see at that moment, so subscribing first would miss stored messages.
    void this.authenticate().then(() => {
      if (generation !== this.generation) return
      this.subscribe(publicKey, seenInSession, onMessage, onInvalid)
    })
    window.addEventListener('online', this.onlineListener)
    this.retryTimer = window.setInterval(() => void this.flushOutbox(), 15_000)
    void this.repository.purgeSeen()
    void this.flushOutbox()
  }

  private subscribe(
    publicKey: string,
    seenInSession: Set<string>,
    onMessage: MessageHandler,
    onInvalid?: InvalidHandler,
  ) {
    this.subscription = this.pool.subscribeMany(
      this.relays,
      { kinds: [1059], '#p': [publicKey], since: Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60 },
      {
        onauth: async (template) =>
          this.withPrivateKey((privateKey) => finalizeEvent(template, privateKey)),
        alreadyHaveEvent: (id) => seenInSession.has(id),
        onevent: async (event: NostrEvent) => {
          if (seenInSession.has(event.id) || (await this.repository.hasSeen(event.id))) return
          try {
            const message = this.withPrivateKey((privateKey) => openGiftWrap(event, privateKey))
            await onMessage(message)
            seenInSession.add(event.id)
            await this.repository.markSeen(event.id)
          } catch (error) {
            onInvalid?.(event, error)
          }
        },
        oninvalidevent: (event) => onInvalid?.(event, new Error('Invalid Nostr signature')),
      },
    )
  }

  stop() {
    this.generation += 1
    this.subscription?.close('client stopped')
    this.subscription = undefined
    window.removeEventListener('online', this.onlineListener)
    if (this.retryTimer) window.clearInterval(this.retryTimer)
    this.retryTimer = undefined
  }

  destroy() {
    this.stop()
    this.pool.destroy()
  }
}
