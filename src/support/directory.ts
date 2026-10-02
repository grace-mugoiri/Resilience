// Reads the counselor directory from the Resilience API and checks the signatures itself.
//
// The API is a fast index, not something the app trusts. Every organisation signs its list of
// counselors (a Nostr roster event) and every counselor signs her own profile (a Nostr kind 0
// event). This module verifies both signatures on the phone and works out each counselor's
// status from the signed roster, so a server that lied could not make a stranger look verified.
import { verifyEvent, type Event } from 'nostr-tools/pure'
import { npubEncode } from 'nostr-tools/nip19'

export const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8000').replace(/\/+$/, '')

const ROSTER_KIND = 30000
const ROSTER_D_TAG = 'verified-counsellors'
const PROFILE_KIND = 0
const HEX64 = /^[0-9a-f]{64}$/

export type Organization = { id: string; name: string; domain: string; nostr_pubkey: string }

type ApiCounselor = { pubkey: string; profile_event: unknown }
export type ApiDirectory = { organization: Organization; roster: unknown; counsellors: ApiCounselor[] }

// verified:   on the organisation's newest signed roster, which has not expired
// expired:    on that roster, but the organisation let it lapse
// removed:    the organisation's signed roster no longer lists her
// unverified: the roster's signature could not be checked, so nothing can be vouched for
export type Status = 'verified' | 'expired' | 'removed' | 'unverified'

export type CounselorProfile = {
  name: string
  about: string | null
  specialties: string[]
  languages: string[]
  responseTime: string | null
}

export type Counselor = {
  pubkey: string
  orgId: string
  orgName: string
  status: Status
  verifiedUntil: Date | null
  // Null when she has not published a profile or its signature does not check out.
  // Pictures are never read: loading one would give the image host the survivor's IP address.
  profile: CounselorProfile | null
}

export class DirectoryError extends Error {}

function isEvent(value: unknown): value is Event {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    typeof e.id === 'string' && typeof e.pubkey === 'string' && typeof e.sig === 'string' &&
    typeof e.kind === 'number' && typeof e.created_at === 'number' && typeof e.content === 'string' &&
    Array.isArray(e.tags) && e.tags.every((t) => Array.isArray(t) && t.every((x) => typeof x === 'string'))
  )
}

// verifyEvent caches its answer on the event object under a hidden key, and a spread copy would
// carry that key along. Copying only the seven NIP-01 fields means every check really runs.
function checked(value: unknown): Event | null {
  if (!isEvent(value)) return null
  const { id, pubkey, created_at, kind, content, sig } = value
  const copy: Event = { id, pubkey, created_at, kind, tags: value.tags.map((t) => [...t]), content, sig }
  return verifyEvent(copy) ? copy : null
}

function firstTag(event: Event, name: string): string | undefined {
  return event.tags.find((t) => t.length >= 2 && t[0] === name)?.[1]
}

type Roster = { members: Set<string>; expiresAt: Date }

export function readRoster(value: unknown, org: Organization): Roster | null {
  const event = checked(value)
  if (!event || event.kind !== ROSTER_KIND || firstTag(event, 'd') !== ROSTER_D_TAG) return null
  if (event.pubkey !== org.nostr_pubkey) return null
  const expiration = firstTag(event, 'expiration')
  if (!expiration || !/^\d+$/.test(expiration)) return null
  const members = new Set(event.tags.filter((t) => t[0] === 'p' && HEX64.test(t[1] ?? '')).map((t) => t[1]))
  return { members, expiresAt: new Date(Number(expiration) * 1000) }
}

function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= limit ? trimmed : null
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const items: string[] = []
  for (const item of value.slice(0, 10)) {
    const t = text(item, 40)
    if (t && !items.some((i) => i.toLowerCase() === t.toLowerCase())) items.push(t)
  }
  return items
}

export function readProfile(value: unknown, pubkey: string): CounselorProfile | null {
  const event = checked(value)
  if (!event || event.kind !== PROFILE_KIND || event.pubkey !== pubkey) return null
  let data: unknown
  try {
    data = JSON.parse(event.content)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  // NIP-24: display_name is the full name to show; name is the short handle.
  const name = text(d.display_name, 80) ?? text(d.name, 80)
  if (!name) return null
  return {
    name,
    about: text(d.about, 500),
    specialties: list(d.specialties),
    languages: list(d.languages),
    responseTime: text(d.response_time, 80),
  }
}

const ORDER: Record<Status, number> = { verified: 0, expired: 1, removed: 2, unverified: 3 }

export function sortCounselors(items: Counselor[]): Counselor[] {
  return [...items].sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] ||
      Number(a.profile === null) - Number(b.profile === null) ||
      (a.profile?.name ?? '').localeCompare(b.profile?.name ?? '') ||
      a.pubkey.localeCompare(b.pubkey),
  )
}

/** Turn one organisation's API answer into counselors whose status comes from signatures only. */
export function buildCounselors(org: Organization, dir: ApiDirectory, now = new Date()): Counselor[] {
  const roster = readRoster(dir.roster, org)
  const listed = new Map<string, unknown>()
  for (const c of Array.isArray(dir.counsellors) ? dir.counsellors : []) {
    if (c && typeof c.pubkey === 'string' && HEX64.test(c.pubkey)) listed.set(c.pubkey, c.profile_event)
  }
  // Someone on the signed roster still counts even if the API left her out.
  for (const key of roster?.members ?? []) if (!listed.has(key)) listed.set(key, null)

  return sortCounselors(
    [...listed].map(([pubkey, profileEvent]) => {
      let status: Status = 'unverified'
      if (roster) {
        if (!roster.members.has(pubkey)) status = 'removed'
        else status = roster.expiresAt > now ? 'verified' : 'expired'
      }
      return {
        pubkey,
        orgId: org.id,
        orgName: org.name,
        status,
        verifiedUntil: roster && status !== 'removed' ? roster.expiresAt : null,
        profile: readProfile(profileEvent, pubkey),
      }
    }),
  )
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  // No cookies and no referrer: the API should learn nothing about who is reading.
  const response = await fetch(API_BASE + path, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new DirectoryError(`directory answered HTTP ${response.status}`)
  return (await response.json()) as T
}

function counselorsPath(orgId: string): string {
  return `/v1/orgs/${encodeURIComponent(orgId)}/counsellors`
}

/** Every approved organisation's counselors. One organisation failing does not hide the rest. */
export async function loadDirectory(signal?: AbortSignal): Promise<Counselor[]> {
  const orgs = await getJson<Organization[]>('/v1/orgs', signal)
  const results = await Promise.allSettled(
    orgs.map(async (org) => buildCounselors(org, await getJson<ApiDirectory>(counselorsPath(org.id), signal))),
  )
  const loaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (orgs.length > 0 && loaded.length === 0) throw new DirectoryError('no organisation could be loaded')
  return sortCounselors(loaded.flat())
}

/** One counselor of one organisation, or null if that organisation does not list her. */
export async function loadCounselor(orgId: string, pubkey: string, signal?: AbortSignal): Promise<Counselor | null> {
  const dir = await getJson<ApiDirectory>(counselorsPath(orgId), signal)
  if (dir.organization?.id !== orgId) throw new DirectoryError('directory answered for another organisation')
  return buildCounselors(dir.organization, dir).find((c) => c.pubkey === pubkey) ?? null
}

export function shortNpub(pubkey: string): string {
  const npub = npubEncode(pubkey)
  return `${npub.slice(0, 10)}…${npub.slice(-4)}`
}

export function displayName(counselor: Counselor): string {
  return counselor.profile?.name ?? `Counselor ${shortNpub(counselor.pubkey)}`
}

export function profilePath(counselor: Counselor): string {
  return `/app/counselors/${counselor.orgId}/${counselor.pubkey}`
}

export function chatPath(orgId: string, pubkey: string): string {
  return `/app/chat/${orgId}/${pubkey}`
}

export function parseChatPath(path: string): { orgId: string; pubkey: string } | null {
  const match = /^\/app\/chat\/([0-9a-f-]{36})\/([0-9a-f]{64})\/?$/.exec(path)
  return match ? { orgId: match[1], pubkey: match[2] } : null
}

export function parseProfilePath(path: string): { orgId: string; pubkey: string } | null {
  const match = /^\/app\/counselors\/([0-9a-f-]{36})\/([0-9a-f]{64})\/?$/.exec(path)
  return match ? { orgId: match[1], pubkey: match[2] } : null
}
