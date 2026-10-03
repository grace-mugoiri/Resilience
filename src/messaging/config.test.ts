import { describe, expect, it } from 'vitest'
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { readClientConfiguration } from './config'

const NOW = 1_800_000_000

const signedConfig = (
  overrides: Partial<{ schema_version: number; relays: string[]; approved_orgs_list: string | null }> = {},
  expiration = NOW + 3600,
) => {
  const secret = generateSecretKey()
  const content = {
    schema_version: 1,
    relays: ['ws://localhost:7777', 'ws://localhost:7778'],
    approved_orgs_list: null,
    ...overrides,
  }
  return {
    secret,
    event: finalizeEvent(
      {
        kind: 30078,
        created_at: NOW,
        tags: [
          ['d', 'resilience/client-config'],
          ['expiration', String(expiration)],
        ],
        content: JSON.stringify(content),
      },
      secret,
    ),
  }
}

describe('signed client configuration', () => {
  it('accepts a current signed development configuration', () => {
    const { event, secret } = signedConfig()
    expect(readClientConfiguration(event, getPublicKey(secret), { now: NOW, production: false })).toEqual({
      schema_version: 1,
      relays: ['ws://localhost:7777', 'ws://localhost:7778'],
      approved_orgs_list: null,
    })
  })

  it('rejects replayed, unsupported, and insecure production configurations', () => {
    const expired = signedConfig({}, NOW - 1)
    expect(() =>
      readClientConfiguration(expired.event, getPublicKey(expired.secret), {
        now: NOW,
        production: false,
      }),
    ).toThrow('expired')

    const unsupported = signedConfig({ schema_version: 2 })
    expect(() =>
      readClientConfiguration(unsupported.event, getPublicKey(unsupported.secret), {
        now: NOW,
        production: false,
      }),
    ).toThrow('schema version')

    const insecure = signedConfig()
    expect(() =>
      readClientConfiguration(insecure.event, getPublicKey(insecure.secret), {
        now: NOW,
        production: true,
      }),
    ).toThrow('invalid relay URL')
  })
})

