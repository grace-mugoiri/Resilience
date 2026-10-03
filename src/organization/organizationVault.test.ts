import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { OrganizationVault } from './organizationVault'

const fastKdf = { memoryKiB: 32, iterations: 1, parallelism: 1 }

describe('organization key vault', () => {
  const vault = new OrganizationVault(fastKdf)

  afterEach(async () => {
    await vault.clear()
  })

  it('creates separate root, operational and credential-review identities', async () => {
    const created = await vault.create('1234', 'Wangu Support', 'wangu.org')

    expect(created.rootWords.split(' ')).toHaveLength(12)
    expect(new Set([
      created.rootPublicKey,
      created.operationalPublicKey,
      created.reviewPublicKey,
    ]).size).toBe(3)
    expect(vault.withRootKey((key) => key.length)).toBe(32)
    expect(vault.withOperationalKey((key) => key.length)).toBe(32)
    expect(vault.withReviewKey((key) => key.length)).toBe(32)
  })

  it('encrypts the keys at rest and unlocks them only with the PIN', async () => {
    const created = await vault.create('1234', 'Wangu Support', 'wangu.org')
    vault.lock()

    expect(() => vault.withOperationalKey(() => undefined)).toThrow('locked')
    await expect(vault.unlock('9999')).rejects.toThrow('Unable to unlock')
    const unlocked = await vault.unlock('1234')
    expect(unlocked.operationalPublicKey).toBe(created.operationalPublicKey)
  })

  it('removes the root key from the online vault after backup confirmation', async () => {
    await vault.create('1234', 'Wangu Support', 'wangu.org')
    expect(vault.revealRootWords().split(' ')).toHaveLength(12)

    await vault.confirmBackupAndPurgeRoot()
    expect(() => vault.withRootKey(() => undefined)).toThrow('not available')
    expect(vault.withOperationalKey((key) => key.length)).toBe(32)
    vault.lock()

    const summary = await vault.unlock('1234')
    expect(summary.backupConfirmed).toBe(true)
    expect(() => vault.revealRootWords()).toThrow('already confirmed')
  })
})
