import { argon2idAsync } from '@noble/hashes/argon2.js'
import { accountFromSeedWords, generateSeedWords, validateWords } from 'nostr-tools/nip06'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { deleteDB } from 'idb'
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  hexToBytes,
  randomBytes,
} from './encoding'
import {
  closePrivateDatabase,
  privateDatabase,
  type VaultMetadata,
} from './privateDatabase'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const DEVICE_KEY_ID = 'device-bound-v1'
const ACCOUNT_ID = 'account'

export type KdfParameters = { memoryKiB: number; iterations: number; parallelism: number }
export const DEFAULT_KDF: KdfParameters = {
  memoryKiB: 19 * 1024,
  iterations: 2,
  parallelism: 1,
}

type SecretPayload = { privateKey: string; backupWords?: string }
export type AccountSummary = { publicKey: string; nickname: string; backupConfirmed: boolean }

const aad = (publicKey: string, purpose: string) =>
  encoder.encode(`resilience:v1:${publicKey}:${purpose}`)

const buffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer

const assertPin = (pin: string) => {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must contain exactly four digits')
}

const derivePinKey = async (pin: string, salt: Uint8Array, parameters: KdfParameters) => {
  const raw = await argon2idAsync(encoder.encode(pin), salt, {
    t: parameters.iterations,
    m: parameters.memoryKiB,
    p: parameters.parallelism,
    dkLen: 32,
    asyncTick: 8,
    maxmem: parameters.memoryKiB * 1024 + 1024 * 1024,
  })
  try {
    return await crypto.subtle.importKey('raw', buffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
  } finally {
    raw.fill(0)
  }
}

const encrypt = async (key: CryptoKey, plaintext: Uint8Array, iv: Uint8Array, data: Uint8Array) =>
  new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buffer(iv), additionalData: buffer(data) }, key, buffer(plaintext)))

const decrypt = async (key: CryptoKey, ciphertext: Uint8Array, iv: Uint8Array, data: Uint8Array) =>
  new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buffer(iv), additionalData: buffer(data) }, key, buffer(ciphertext)))

const importVdek = (raw: Uint8Array) =>
  crypto.subtle.importKey('raw', buffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])

export class AccountVault {
  private privateKey?: Uint8Array
  private unlockFailures = 0

  constructor(private readonly kdf = DEFAULT_KDF) {}

  private async deviceKey(): Promise<CryptoKey> {
    const database = await privateDatabase()
    const existing = await database.get('keys', DEVICE_KEY_ID)
    if (existing) return existing
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ])
    await database.put('keys', key, DEVICE_KEY_ID)
    return key
  }

  private async save(
    privateKey: Uint8Array,
    pin: string,
    nickname: string,
    backupWords?: string,
  ): Promise<AccountSummary> {
    assertPin(pin)
    const publicKey = getPublicKey(privateKey)
    const vdekRaw = randomBytes(32)
    const pinSalt = randomBytes(16)
    const pinIv = randomBytes(12)
    const deviceIv = randomBytes(12)
    const secretIv = randomBytes(12)
    const pinKey = await derivePinKey(pin, pinSalt, this.kdf)
    const vdek = await importVdek(vdekRaw)
    const pinWrapped = await encrypt(pinKey, vdekRaw, pinIv, aad(publicKey, 'pin-wrap'))
    const deviceWrapped = await encrypt(
      await this.deviceKey(),
      pinWrapped,
      deviceIv,
      aad(publicKey, 'device-wrap'),
    )
    const secret = encoder.encode(JSON.stringify({ privateKey: bytesToHex(privateKey), backupWords }))
    const encryptedSecret = await encrypt(vdek, secret, secretIv, aad(publicKey, 'account-secret'))
    vdekRaw.fill(0)
    secret.fill(0)

    const metadata: VaultMetadata = {
      id: ACCOUNT_ID,
      version: 1,
      publicKey,
      nickname: nickname.trim(),
      pinSalt: bytesToBase64(pinSalt),
      pinIv: bytesToBase64(pinIv),
      deviceIv: bytesToBase64(deviceIv),
      wrappedVdek: bytesToBase64(deviceWrapped),
      secretIv: bytesToBase64(secretIv),
      encryptedSecret: bytesToBase64(encryptedSecret),
      createdAt: Date.now(),
    }
    await (await privateDatabase()).put('vault', metadata)
    this.setUnlocked(privateKey)
    return { publicKey, nickname: metadata.nickname, backupConfirmed: false }
  }

  async create(pin: string, nickname: string) {
    const words = generateSeedWords()
    const account = accountFromSeedWords(words)
    const summary = await this.save(account.privateKey, pin, nickname, words)
    account.privateKey.fill(0)
    return { ...summary, backupWords: words }
  }

  async restore(words: string, pin: string, nickname: string) {
    const normalized = words.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!validateWords(normalized)) throw new Error('Backup words are not valid')
    const account = accountFromSeedWords(normalized)
    const summary = await this.save(account.privateKey, pin, nickname)
    account.privateKey.fill(0)
    return summary
  }

  async summary(): Promise<AccountSummary | null> {
    const metadata = await (await privateDatabase()).get('vault', ACCOUNT_ID)
    return metadata
      ? {
          publicKey: metadata.publicKey,
          nickname: metadata.nickname,
          backupConfirmed: Boolean(metadata.backupConfirmedAt),
        }
      : null
  }

  private async decryptSecret(pin: string, metadata: VaultMetadata): Promise<SecretPayload> {
    const pinWrapped = await decrypt(
      await this.deviceKey(),
      base64ToBytes(metadata.wrappedVdek),
      base64ToBytes(metadata.deviceIv),
      aad(metadata.publicKey, 'device-wrap'),
    )
    const pinKey = await derivePinKey(pin, base64ToBytes(metadata.pinSalt), this.kdf)
    const vdekRaw = await decrypt(
      pinKey,
      pinWrapped,
      base64ToBytes(metadata.pinIv),
      aad(metadata.publicKey, 'pin-wrap'),
    )
    const vdek = await importVdek(vdekRaw)
    vdekRaw.fill(0)
    const plaintext = await decrypt(
      vdek,
      base64ToBytes(metadata.encryptedSecret),
      base64ToBytes(metadata.secretIv),
      aad(metadata.publicKey, 'account-secret'),
    )
    try {
      return JSON.parse(decoder.decode(plaintext)) as SecretPayload
    } finally {
      plaintext.fill(0)
    }
  }

  async unlock(pin: string): Promise<AccountSummary> {
    assertPin(pin)
    if (this.unlockFailures) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 250 * 2 ** this.unlockFailures)))
    }
    const database = await privateDatabase()
    const metadata = await database.get('vault', ACCOUNT_ID)
    if (!metadata) throw new Error('No account exists on this device')
    try {
      const secret = await this.decryptSecret(pin, metadata)
      this.setUnlocked(hexToBytes(secret.privateKey))
      this.unlockFailures = 0
      return {
        publicKey: metadata.publicKey,
        nickname: metadata.nickname,
        backupConfirmed: Boolean(metadata.backupConfirmedAt),
      }
    } catch {
      this.unlockFailures += 1
      throw new Error('Unable to unlock this account')
    }
  }

  async revealBackupWords(pin: string) {
    assertPin(pin)
    const metadata = await (await privateDatabase()).get('vault', ACCOUNT_ID)
    if (!metadata) throw new Error('No account exists on this device')
    try {
      const secret = await this.decryptSecret(pin, metadata)
      if (!secret.backupWords) {
        throw new Error('This restored account does not keep a second copy of its backup words')
      }
      return secret.backupWords
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('This restored')) throw error
      throw new Error('Unable to unlock backup words', { cause: error })
    }
  }

  async changePin(currentPin: string, newPin: string) {
    assertPin(currentPin)
    assertPin(newPin)
    const database = await privateDatabase()
    const metadata = await database.get('vault', ACCOUNT_ID)
    if (!metadata) throw new Error('No account exists on this device')
    try {
      const deviceKey = await this.deviceKey()
      const oldPinWrapped = await decrypt(
        deviceKey,
        base64ToBytes(metadata.wrappedVdek),
        base64ToBytes(metadata.deviceIv),
        aad(metadata.publicKey, 'device-wrap'),
      )
      const currentPinKey = await derivePinKey(
        currentPin,
        base64ToBytes(metadata.pinSalt),
        this.kdf,
      )
      const vdekRaw = await decrypt(
        currentPinKey,
        oldPinWrapped,
        base64ToBytes(metadata.pinIv),
        aad(metadata.publicKey, 'pin-wrap'),
      )
      const newSalt = randomBytes(16)
      const newPinIv = randomBytes(12)
      const newDeviceIv = randomBytes(12)
      const newPinKey = await derivePinKey(newPin, newSalt, this.kdf)
      const newPinWrapped = await encrypt(
        newPinKey,
        vdekRaw,
        newPinIv,
        aad(metadata.publicKey, 'pin-wrap'),
      )
      vdekRaw.fill(0)
      const newDeviceWrapped = await encrypt(
        deviceKey,
        newPinWrapped,
        newDeviceIv,
        aad(metadata.publicKey, 'device-wrap'),
      )
      metadata.pinSalt = bytesToBase64(newSalt)
      metadata.pinIv = bytesToBase64(newPinIv)
      metadata.deviceIv = bytesToBase64(newDeviceIv)
      metadata.wrappedVdek = bytesToBase64(newDeviceWrapped)
      await database.put('vault', metadata)
    } catch (error) {
      throw new Error('Unable to change the PIN', { cause: error })
    }
  }

  async confirmBackup() {
    const database = await privateDatabase()
    const metadata = await database.get('vault', ACCOUNT_ID)
    if (!metadata) throw new Error('No account exists on this device')
    metadata.backupConfirmedAt = Date.now()
    await database.put('vault', metadata)
  }

  private setUnlocked(key: Uint8Array) {
    this.lock()
    this.privateKey = key.slice()
  }

  isUnlocked() {
    return Boolean(this.privateKey)
  }

  withPrivateKey<T>(operation: (privateKey: Uint8Array) => T): T {
    if (!this.privateKey) throw new Error('Account is locked')
    return operation(this.privateKey)
  }

  lock() {
    this.privateKey?.fill(0)
    this.privateKey = undefined
  }

  async clear() {
    this.lock()
    await closePrivateDatabase()
    await deleteDB('resilience-private')
  }
}

export class GuestIdentity {
  private privateKey?: Uint8Array
  readonly publicKey: string

  constructor() {
    this.privateKey = generateSecretKey()
    this.publicKey = getPublicKey(this.privateKey)
  }

  withPrivateKey<T>(operation: (privateKey: Uint8Array) => T): T {
    if (!this.privateKey) throw new Error('Guest identity has been cleared')
    return operation(this.privateKey)
  }

  clear() {
    this.privateKey?.fill(0)
    this.privateKey = undefined
  }
}

export const accountVault = new AccountVault()
