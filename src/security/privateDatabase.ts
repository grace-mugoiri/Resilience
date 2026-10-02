import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { NostrEvent } from 'nostr-tools/core'

export type VaultMetadata = {
  id: 'account'
  version: 1
  publicKey: string
  nickname: string
  pinSalt: string
  pinIv: string
  deviceIv: string
  wrappedVdek: string
  secretIv: string
  encryptedSecret: string
  createdAt: number
  backupConfirmedAt?: number
}

export type RelayDelivery = {
  status: 'pending' | 'delivered'
  attempts: number
  nextAttemptAt: number
  lastError?: string
}

/** One chat message, encrypted to the account's own key (NIP-44), so it is unreadable while locked. */
export type StoredMessage = { id: string; createdAt: number; ciphertext: string }

export type OutboxRecord = {
  id: string
  event: NostrEvent
  relays: Record<string, RelayDelivery>
  createdAt: number
}

interface ResiliencePrivateDatabase extends DBSchema {
  vault: { key: string; value: VaultMetadata }
  keys: { key: string; value: CryptoKey }
  outbox: { key: string; value: OutboxRecord; indexes: { 'by-created': number } }
  seen: { key: string; value: { id: string; seenAt: number }; indexes: { 'by-seen': number } }
  messages: { key: string; value: StoredMessage; indexes: { 'by-created': number } }
}

let databasePromise: Promise<IDBPDatabase<ResiliencePrivateDatabase>> | undefined

export const privateDatabase = () => {
  databasePromise ??= openDB<ResiliencePrivateDatabase>('resilience-private', 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('vault', { keyPath: 'id' })
        database.createObjectStore('keys')
        const outbox = database.createObjectStore('outbox', { keyPath: 'id' })
        outbox.createIndex('by-created', 'createdAt')
        const seen = database.createObjectStore('seen', { keyPath: 'id' })
        seen.createIndex('by-seen', 'seenAt')
      }
      if (oldVersion < 2) {
        const messages = database.createObjectStore('messages', { keyPath: 'id' })
        messages.createIndex('by-created', 'createdAt')
      }
    },
  })
  return databasePromise
}

export const closePrivateDatabase = async () => {
  if (!databasePromise) return
  const database = await databasePromise
  database.close()
  databasePromise = undefined
}

