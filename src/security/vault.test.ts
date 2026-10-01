import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountVault, GuestIdentity } from './vault'

const fastKdf = { memoryKiB: 32, iterations: 1, parallelism: 1 }

describe('encrypted account vault', () => {
  const vault = new AccountVault(fastKdf)

  afterEach(async () => {
    await vault.clear()
  })

  it('creates, locks and unlocks the same Nostr identity', async () => {
    const created = await vault.create('1234', 'Calm River')
    expect(created.backupWords.split(' ')).toHaveLength(12)
    const originalKey = created.publicKey
    vault.lock()
    expect(() => vault.withPrivateKey(() => undefined)).toThrow('locked')
    const unlocked = await vault.unlock('1234')
    expect(unlocked.publicKey).toBe(originalKey)
  })

  it('fails closed for a wrong PIN and restores from standard backup words', async () => {
    const created = await vault.create('1234', 'Calm River')
    vault.lock()
    await expect(vault.unlock('9999')).rejects.toThrow('Unable to unlock')
    await vault.clear()
    const restored = await vault.restore(created.backupWords, '5678', 'Quiet Sky')
    expect(restored.publicKey).toBe(created.publicKey)
  })

  it('re-wraps the vault when the PIN changes without changing the identity', async () => {
    const created = await vault.create('1234', 'Calm River')
    await vault.changePin('1234', '5678')
    vault.lock()
    await expect(vault.unlock('1234')).rejects.toThrow('Unable to unlock')
    const unlocked = await vault.unlock('5678')
    expect(unlocked.publicKey).toBe(created.publicKey)
  })

  it('deletes guest key material irreversibly', () => {
    const guest = new GuestIdentity()
    expect(guest.publicKey).toHaveLength(64)
    guest.clear()
    expect(() => guest.withPrivateKey(() => undefined)).toThrow('cleared')
  })
})
