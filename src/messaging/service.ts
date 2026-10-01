import type { NostrEvent } from 'nostr-tools/pure'
import { readClientConfiguration } from './config'
import { RelayMessagingClient } from './relayClient'

export type MessagingBootstrap = {
  apiBase: string
  platformPublicKey: string
  withPrivateKey: <T>(operation: (privateKey: Uint8Array) => T) => T
  fetcher?: typeof fetch
}

export const createMessagingClient = async ({
  apiBase,
  platformPublicKey,
  withPrivateKey,
  fetcher = fetch,
}: MessagingBootstrap) => {
  const response = await fetcher(`${apiBase.replace(/\/$/, '')}/v1/config`, {
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Could not load relay configuration (${response.status})`)
  const signedEvent = (await response.json()) as NostrEvent
  const configuration = readClientConfiguration(signedEvent, platformPublicKey)
  return new RelayMessagingClient(configuration.relays, withPrivateKey)
}

