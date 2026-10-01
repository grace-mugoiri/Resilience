import { verifyEvent, type NostrEvent } from 'nostr-tools/pure'

export type ClientConfiguration = { relays: string[]; approved_orgs_list?: string }

export const readClientConfiguration = (event: NostrEvent, platformPublicKey: string) => {
  if (!verifyEvent(event) || event.pubkey !== platformPublicKey || event.kind !== 30078) {
    throw new Error('Client configuration signature is invalid')
  }
  if (!event.tags.some(([name, value]) => name === 'd' && value === 'resilience/client-config')) {
    throw new Error('Client configuration coordinates are invalid')
  }
  const content = JSON.parse(event.content) as ClientConfiguration
  if (!Array.isArray(content.relays) || new Set(content.relays).size < 2) {
    throw new Error('Client configuration needs two distinct relays')
  }
  if (content.relays.some((relay) => !/^wss?:\/\/[^\s]+$/.test(relay))) {
    throw new Error('Client configuration contains an invalid relay URL')
  }
  return content
}

