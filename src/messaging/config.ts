import { verifyEvent, type NostrEvent } from 'nostr-tools/pure'

export type ClientConfiguration = {
  schema_version: 1
  relays: string[]
  approved_orgs_list: string | null
}

type ConfigurationOptions = { now?: number; production?: boolean }

const onlyTag = (event: NostrEvent, name: string) => {
  const values = event.tags.filter(([tag]) => tag === name).map(([, value]) => value)
  return values.length === 1 ? values[0] : undefined
}

const relayUrlIsValid = (value: unknown, production: boolean): value is string => {
  if (typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    return (
      (parsed.protocol === 'wss:' || (!production && parsed.protocol === 'ws:')) &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    )
  } catch {
    return false
  }
}

export const readClientConfiguration = (
  event: NostrEvent,
  platformPublicKey: string,
  {
    now = Math.floor(Date.now() / 1000),
    production = typeof location !== 'undefined' && location.protocol === 'https:',
  }: ConfigurationOptions = {},
): ClientConfiguration => {
  if (!verifyEvent(event) || event.pubkey !== platformPublicKey || event.kind !== 30078) {
    throw new Error('Client configuration signature is invalid')
  }
  if (onlyTag(event, 'd') !== 'resilience/client-config') {
    throw new Error('Client configuration coordinates are invalid')
  }
  const expiration = onlyTag(event, 'expiration')
  if (!expiration || !/^\d+$/.test(expiration) || Number(expiration) <= now) {
    throw new Error('Client configuration is expired or has no valid expiration')
  }
  if (event.created_at > now + 10 * 60) {
    throw new Error('Client configuration is dated in the future')
  }

  let content: unknown
  try {
    content = JSON.parse(event.content)
  } catch {
    throw new Error('Client configuration content is not valid JSON')
  }
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error('Client configuration content is invalid')
  }
  const candidate = content as Record<string, unknown>
  if (candidate.schema_version !== 1) {
    throw new Error('Client configuration schema version is unsupported')
  }
  if (!Array.isArray(candidate.relays) || new Set(candidate.relays).size < 2) {
    throw new Error('Client configuration needs two distinct relays')
  }
  if (candidate.relays.some((relay) => !relayUrlIsValid(relay, production))) {
    throw new Error('Client configuration contains an invalid relay URL')
  }
  const approved = candidate.approved_orgs_list
  if (
    approved !== undefined &&
    approved !== null &&
    (typeof approved !== 'string' || !/^\d+:[0-9a-f]{64}:[^\s:]+$/.test(approved))
  ) {
    throw new Error('Client configuration contains an invalid approved-organizations address')
  }
  const allowedKeys = new Set(['schema_version', 'relays', 'approved_orgs_list'])
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) {
    throw new Error('Client configuration contains unsupported fields')
  }
  return {
    schema_version: 1,
    relays: candidate.relays as string[],
    approved_orgs_list: typeof approved === 'string' ? approved : null,
  }
}
