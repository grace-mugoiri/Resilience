import type { NostrEvent } from 'nostr-tools/core'
import { privateDatabase, type OutboxRecord } from '../security/privateDatabase'

const SEEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export class MessagingRepository {
  async enqueue(event: NostrEvent, relays: string[]) {
    const record: OutboxRecord = {
      id: event.id,
      event,
      createdAt: Date.now(),
      relays: Object.fromEntries(
        relays.map((relay) => [relay, { status: 'pending', attempts: 0, nextAttemptAt: 0 }]),
      ),
    }
    await (await privateDatabase()).put('outbox', record)
  }

  async pending(now = Date.now()) {
    const records = await (await privateDatabase()).getAllFromIndex('outbox', 'by-created')
    return records.filter((record) =>
      Object.values(record.relays).some(
        (delivery) => delivery.status === 'pending' && delivery.nextAttemptAt <= now,
      ),
    )
  }

  async deliveryResult(id: string, relay: string, error?: unknown) {
    const database = await privateDatabase()
    const record = await database.get('outbox', id)
    if (!record || !record.relays[relay]) return
    const delivery = record.relays[relay]
    if (!error) {
      delivery.status = 'delivered'
      delete delivery.lastError
    } else {
      delivery.attempts += 1
      delivery.lastError = error instanceof Error ? error.message : String(error)
      const backoff = Math.min(5 * 60_000, 1000 * 2 ** Math.min(delivery.attempts, 8))
      delivery.nextAttemptAt = Date.now() + backoff + Math.floor(Math.random() * 500)
    }
    if (Object.values(record.relays).every(({ status }) => status === 'delivered')) {
      await database.delete('outbox', id)
    } else {
      await database.put('outbox', record)
    }
  }

  async hasSeen(id: string) {
    return Boolean(await (await privateDatabase()).get('seen', id))
  }

  async markSeen(id: string) {
    await (await privateDatabase()).put('seen', { id, seenAt: Date.now() })
  }

  async purgeSeen(now = Date.now()) {
    const database = await privateDatabase()
    const transaction = database.transaction('seen', 'readwrite')
    let cursor = await transaction.store.index('by-seen').openCursor(
      IDBKeyRange.upperBound(now - SEEN_RETENTION_MS),
    )
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
    await transaction.done
  }
}

