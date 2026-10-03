import { argon2idAsync } from '@noble/hashes/argon2.js'
import { accountFromSeedWords, generateSeedWords } from 'nostr-tools/nip06'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Organization } from '../api/types'
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  hexToBytes,
  randomBytes,
} from '../security/encoding'
import { DEFAULT_KDF, type KdfParameters } from '../security/vault'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const DATABASE_NAME = 'resilience-organization'
const DEVICE_KEY_ID = 'organization-device-v1'
const VAULT_ID = 'organization'

const buffer = (value: Uint8Array): ArrayBuffer => value.slice().buffer as ArrayBuffer

type OrganizationSecrets = {
  rootPrivateKey?: string
  rootWords?: string
  operationalPrivateKey: string
  reviewPrivateKey: string
}

export type OrganizationVaultMetadata = {
  id: 'organization'
  version: 1
  name: string
  domain: string
  organization?: Organization
  rootPublicKey: string
  operationalPublicKey: string
  reviewPublicKey: string
  pinSalt: string
  pinIv: string
  deviceIv: string
  wrappedVdek: string
  secretIv: string
  encryptedSecret: string
  createdAt: number
  backupConfirmedAt?: number
}

export type OrganizationVaultSummary = Pick<
  OrganizationVaultMetadata,
  | 'name'
  | 'domain'
  | 'organization'
  | 'rootPublicKey'
  | 'operationalPublicKey'
  | 'reviewPublicKey'
> & { backupConfirmed: boolean }

interface OrganizationDatabase extends DBSchema {
  vault: { key: string; value: OrganizationVaultMetadata }
  keys: { key: string; value: CryptoKey }
}

let databasePromise: Promise<IDBPDatabase<OrganizationDatabase>> | undefined

const database = () => {
  databasePromise ??= openDB<OrganizationDatabase>(DATABASE_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('vault', { keyPath: 'id' })
      db.createObjectStore('keys')
    },
  })
  return databasePromise
}

const closeDatabase = async () => {
  if (!databasePromise) return
  ;(await databasePromise).close()
  databasePromise = undefined
}

const aad = (rootPublicKey: string, purpose: string) =>
  encoder.encode(`resilience:organization:v1:${rootPublicKey}:${purpose}`)

const assertPin = (pin: string) => {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must contain exactly four digits')
}

const derivePinKey = async (pin: string, salt: Uint8Array, kdf: KdfParameters) => {
  const raw = await argon2idAsync(encoder.encode(pin), salt, {
    t: kdf.iterations,
    m: kdf.memoryKiB,
    p: kdf.parallelism,
    dkLen: 32,
    asyncTick: 8,
    maxmem: kdf.memoryKiB * 1024 + 1024 * 1024,
  })
  try {
    return await crypto.subtle.importKey('raw', buffer(raw), 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ])
  } finally {
    raw.fill(0)
  }
}

const encrypt = async (
  key: CryptoKey,
  plaintext: Uint8Array,
  iv: Uint8Array,
  additionalData: Uint8Array,
) =>
  new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: buffer(iv), additionalData: buffer(additionalData) },
      key,
      buffer(plaintext),
    ),
  )

const decrypt = async (
  key: CryptoKey,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  additionalData: Uint8Array,
) =>
  new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buffer(iv), additionalData: buffer(additionalData) },
      key,
      buffer(ciphertext),
    ),
  )

const importVdek = (raw: Uint8Array) =>
  crypto.subtle.importKey('raw', buffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])

const summaryOf = (metadata: OrganizationVaultMetadata): OrganizationVaultSummary => ({
  name: metadata.name,
  domain: metadata.domain,
  organization: metadata.organization,
  rootPublicKey: metadata.rootPublicKey,
  operationalPublicKey: metadata.operationalPublicKey,
  reviewPublicKey: metadata.reviewPublicKey,
  backupConfirmed: Boolean(metadata.backupConfirmedAt),
})

export class OrganizationVault {
  private secrets?: OrganizationSecrets
  private vdek?: CryptoKey
  private failures = 0

  constructor(private readonly kdf = DEFAULT_KDF) {}

  private async deviceKey() {
    const db = await database()
    const existing = await db.get('keys', DEVICE_KEY_ID)
    if (existing) return existing
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ])
    await db.put('keys', key, DEVICE_KEY_ID)
    return key
  }

  async create(pin: string, name: string, domain: string) {
    assertPin(pin)
    if (!name.trim()) throw new Error('Enter the organization name')
    if (!domain.trim()) throw new Error('Enter the organization domain')

    const rootWords = generateSeedWords()
    const root = accountFromSeedWords(rootWords)
    const operational = generateSecretKey()
    const review = generateSecretKey()
    const secrets: OrganizationSecrets = {
      rootPrivateKey: bytesToHex(root.privateKey),
      rootWords,
      operationalPrivateKey: bytesToHex(operational),
      reviewPrivateKey: bytesToHex(review),
    }
    const rootPublicKey = getPublicKey(root.privateKey)
    const vdekRaw = randomBytes(32)
    const pinSalt = randomBytes(16)
    const pinIv = randomBytes(12)
    const deviceIv = randomBytes(12)
    const secretIv = randomBytes(12)
    try {
      const pinKey = await derivePinKey(pin, pinSalt, this.kdf)
      const vdek = await importVdek(vdekRaw)
      const pinWrapped = await encrypt(pinKey, vdekRaw, pinIv, aad(rootPublicKey, 'pin-wrap'))
      const wrappedVdek = await encrypt(
        await this.deviceKey(),
        pinWrapped,
        deviceIv,
        aad(rootPublicKey, 'device-wrap'),
      )
      const plaintext = encoder.encode(JSON.stringify(secrets))
      const encryptedSecret = await encrypt(
        vdek,
        plaintext,
        secretIv,
        aad(rootPublicKey, 'secrets'),
      )
      plaintext.fill(0)
      const metadata: OrganizationVaultMetadata = {
        id: VAULT_ID,
        version: 1,
        name: name.trim(),
        domain: domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''),
        rootPublicKey,
        operationalPublicKey: getPublicKey(operational),
        reviewPublicKey: getPublicKey(review),
        pinSalt: bytesToBase64(pinSalt),
        pinIv: bytesToBase64(pinIv),
        deviceIv: bytesToBase64(deviceIv),
        wrappedVdek: bytesToBase64(wrappedVdek),
        secretIv: bytesToBase64(secretIv),
        encryptedSecret: bytesToBase64(encryptedSecret),
        createdAt: Date.now(),
      }
      await (await database()).put('vault', metadata)
      this.secrets = secrets
      this.vdek = vdek
      return { ...summaryOf(metadata), rootWords }
    } finally {
      root.privateKey.fill(0)
      operational.fill(0)
      review.fill(0)
      vdekRaw.fill(0)
    }
  }

  async summary() {
    const metadata = await (await database()).get('vault', VAULT_ID)
    return metadata ? summaryOf(metadata) : null
  }

  async unlock(pin: string) {
    assertPin(pin)
    if (this.failures) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(8000, 250 * 2 ** this.failures)),
      )
    }
    const metadata = await (await database()).get('vault', VAULT_ID)
    if (!metadata) throw new Error('No organization exists on this device')
    try {
      const pinWrapped = await decrypt(
        await this.deviceKey(),
        base64ToBytes(metadata.wrappedVdek),
        base64ToBytes(metadata.deviceIv),
        aad(metadata.rootPublicKey, 'device-wrap'),
      )
      const pinKey = await derivePinKey(pin, base64ToBytes(metadata.pinSalt), this.kdf)
      const vdekRaw = await decrypt(
        pinKey,
        pinWrapped,
        base64ToBytes(metadata.pinIv),
        aad(metadata.rootPublicKey, 'pin-wrap'),
      )
      const vdek = await importVdek(vdekRaw)
      vdekRaw.fill(0)
      const plaintext = await decrypt(
        vdek,
        base64ToBytes(metadata.encryptedSecret),
        base64ToBytes(metadata.secretIv),
        aad(metadata.rootPublicKey, 'secrets'),
      )
      this.secrets = JSON.parse(decoder.decode(plaintext)) as OrganizationSecrets
      plaintext.fill(0)
      this.vdek = vdek
      this.failures = 0
      return summaryOf(metadata)
    } catch {
      this.failures += 1
      throw new Error('Unable to unlock this organization')
    }
  }

  async setOrganization(organization: Organization) {
    const db = await database()
    const metadata = await db.get('vault', VAULT_ID)
    if (!metadata) throw new Error('No organization exists on this device')
    metadata.organization = organization
    await db.put('vault', metadata)
  }

  revealRootWords() {
    if (!this.secrets) throw new Error('Organization is locked')
    if (!this.secrets.rootWords) throw new Error('The root-key backup was already confirmed')
    return this.secrets.rootWords
  }

  async confirmBackupAndPurgeRoot() {
    if (!this.secrets || !this.vdek) throw new Error('Organization is locked')
    const db = await database()
    const metadata = await db.get('vault', VAULT_ID)
    if (!metadata) throw new Error('No organization exists on this device')
    const next: OrganizationSecrets = {
      operationalPrivateKey: this.secrets.operationalPrivateKey,
      reviewPrivateKey: this.secrets.reviewPrivateKey,
    }
    const secretIv = randomBytes(12)
    const plaintext = encoder.encode(JSON.stringify(next))
    try {
      metadata.secretIv = bytesToBase64(secretIv)
      metadata.encryptedSecret = bytesToBase64(
        await encrypt(this.vdek, plaintext, secretIv, aad(metadata.rootPublicKey, 'secrets')),
      )
      metadata.backupConfirmedAt = Date.now()
      await db.put('vault', metadata)
      this.secrets = next
    } finally {
      plaintext.fill(0)
    }
  }

  private withKey<T>(value: string | undefined, operation: (privateKey: Uint8Array) => T): T {
    if (!value) throw new Error('This key is not available on this device')
    const key = hexToBytes(value)
    try {
      return operation(key)
    } finally {
      key.fill(0)
    }
  }

  withRootKey<T>(operation: (privateKey: Uint8Array) => T) {
    if (!this.secrets) throw new Error('Organization is locked')
    return this.withKey(this.secrets.rootPrivateKey, operation)
  }

  withOperationalKey<T>(operation: (privateKey: Uint8Array) => T) {
    if (!this.secrets) throw new Error('Organization is locked')
    return this.withKey(this.secrets.operationalPrivateKey, operation)
  }

  withReviewKey<T>(operation: (privateKey: Uint8Array) => T) {
    if (!this.secrets) throw new Error('Organization is locked')
    return this.withKey(this.secrets.reviewPrivateKey, operation)
  }

  hasRootKey() {
    return Boolean(this.secrets?.rootPrivateKey)
  }

  isUnlocked() {
    return Boolean(this.secrets && this.vdek)
  }

  lock() {
    this.secrets = undefined
    this.vdek = undefined
  }

  async clear() {
    this.lock()
    await closeDatabase()
    await deleteDB(DATABASE_NAME)
  }
}

export const organizationVault = new OrganizationVault()
