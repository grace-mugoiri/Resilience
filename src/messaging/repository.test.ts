import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { generateSecretKey, finalizeEvent } from 'nostr-tools/pure'
import { deleteDB } from 'idb'
import { closePrivateDatabase } from '../security/privateDatabase'
import { MessagingRepository } from './repository'

const event = () =>
  finalizeEvent(
    { kind: 1059, created_at: Math.floor(Date.now() / 1000), tags: [], content: 'ciphertext' },
    generateSecretKey(),
  )

describe('durable dual-relay outbox and replay tracking', () => {
  afterEach(async () => {
    await closePrivateDatabase()
    await deleteDB('resilience-private')
  })

  it('keeps an event until every relay acknowledges it', async () => {
    const repository = new MessagingRepository()
    const wrapped = event()
    await repository.enqueue(wrapped, ['ws://one.test', 'ws://two.test'])
    await repository.deliveryResult(wrapped.id, 'ws://one.test')
    expect(await repository.pending()).toHaveLength(1)
    await repository.deliveryResult(wrapped.id, 'ws://two.test')
    expect(await repository.pending()).toHaveLength(0)
  })

  it('records replay IDs only after processing', async () => {
    const repository = new MessagingRepository()
    expect(await repository.hasSeen('event-id')).toBe(false)
    await repository.markSeen('event-id')
    expect(await repository.hasSeen('event-id')).toBe(true)
  })
})

