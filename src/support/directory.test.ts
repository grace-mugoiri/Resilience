import { afterEach, describe, expect, it, vi } from 'vitest'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { hexToBytes } from 'nostr-tools/utils'
import {
  buildCounselors,
  loadCounselor,
  loadDirectory,
  parseProfilePath,
  readProfile,
  type ApiDirectory,
  type Organization,
} from './directory'

// Throwaway test keys only.
const ORG_SECRET = hexToBytes('0a'.repeat(32))
const OTHER_SECRET = hexToBytes('3a'.repeat(32))
const GRACE_SECRET = hexToBytes('01'.repeat(32))
const AMANI_SECRET = hexToBytes('02'.repeat(32))
const GRACE = getPublicKey(GRACE_SECRET)
const AMANI = getPublicKey(AMANI_SECRET)
const SALMA = getPublicKey(hexToBytes('03'.repeat(32)))

const NOW = new Date('2026-10-01T12:00:00Z')
const nowSeconds = Math.floor(NOW.getTime() / 1000)
const ORG: Organization = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'FIDA Kenya',
  domain: 'fidakenya.org',
  nostr_pubkey: getPublicKey(ORG_SECRET),
}

function roster(members: string[], { secret = ORG_SECRET, expiresIn = 30 * 86400, kind = 30000, d = 'verified-counsellors' } = {}) {
  const tags = [['d', d], ...members.map((m) => ['p', m]), ['expiration', String(nowSeconds + expiresIn)]]
  return finalizeEvent({ kind, created_at: nowSeconds - 60, tags, content: '' }, secret)
}

function profile(secret: Uint8Array, content: Record<string, unknown> | string, kind = 0) {
  const body = typeof content === 'string' ? content : JSON.stringify(content)
  return finalizeEvent({ kind, created_at: nowSeconds - 60, tags: [], content: body }, secret)
}

const graceProfile = () =>
  profile(GRACE_SECRET, {
    name: 'grace',
    display_name: 'Counsellor Grace',
    about: 'Trauma-informed counsellor.',
    specialties: ['Trauma support', 'Legal aid'],
    languages: ['English', 'Kiswahili'],
    response_time: 'Usually replies within a few hours',
    picture: 'https://images.example/grace.jpg',
  })

function directory(rosterEvent: unknown, counsellors: { pubkey: string; profile_event: unknown }[]): ApiDirectory {
  return { organization: ORG, roster: rosterEvent, counsellors }
}

describe('buildCounselors', () => {
  it('marks counselors on a valid, current roster as verified and reads their signed profile', () => {
    const [grace] = buildCounselors(ORG, directory(roster([GRACE]), [{ pubkey: GRACE, profile_event: graceProfile() }]), NOW)
    expect(grace.status).toBe('verified')
    expect(grace.orgName).toBe('FIDA Kenya')
    expect(grace.verifiedUntil?.getTime()).toBe((nowSeconds + 30 * 86400) * 1000)
    expect(grace.profile).toEqual({
      name: 'Counsellor Grace',
      about: 'Trauma-informed counsellor.',
      specialties: ['Trauma support', 'Legal aid'],
      languages: ['English', 'Kiswahili'],
      responseTime: 'Usually replies within a few hours',
    })
  })

  it('never exposes a picture URL', () => {
    const [grace] = buildCounselors(ORG, directory(roster([GRACE]), [{ pubkey: GRACE, profile_event: graceProfile() }]), NOW)
    expect(JSON.stringify(grace)).not.toContain('images.example')
  })

  it('marks counselors on a lapsed roster as expired', () => {
    const [grace] = buildCounselors(ORG, directory(roster([GRACE], { expiresIn: -1 }), [{ pubkey: GRACE, profile_event: null }]), NOW)
    expect(grace.status).toBe('expired')
  })

  it('marks counselors left off the roster as removed, even if the server says otherwise', () => {
    const result = buildCounselors(ORG, directory(roster([GRACE]), [
      { pubkey: GRACE, profile_event: null },
      { pubkey: AMANI, profile_event: null },
    ]), NOW)
    expect(result.find((c) => c.pubkey === AMANI)?.status).toBe('removed')
    expect(result.find((c) => c.pubkey === AMANI)?.verifiedUntil).toBeNull()
  })

  it('still lists someone on the signed roster that the server left out', () => {
    const result = buildCounselors(ORG, directory(roster([GRACE, SALMA]), [{ pubkey: GRACE, profile_event: null }]), NOW)
    expect(result.map((c) => [c.pubkey, c.status])).toContainEqual([SALMA, 'verified'])
  })

  it.each([
    ['signed by another key', () => roster([GRACE], { secret: OTHER_SECRET })],
    ['the wrong kind', () => roster([GRACE], { kind: 3 })],
    ['the wrong list name', () => roster([GRACE], { d: 'friends' })],
    ['a member slipped in after signing', () => { const r = roster([]); r.tags.push(['p', GRACE]); return r }],
    ['missing', () => null],
    ['not an event', () => ({ hello: 'world' })],
  ])('vouches for nobody when the roster is %s', (_label, makeRoster) => {
    const [grace] = buildCounselors(ORG, directory(makeRoster(), [{ pubkey: GRACE, profile_event: null }]), NOW)
    expect(grace.status).toBe('unverified')
    expect(grace.verifiedUntil).toBeNull()
  })

  it('lists verified counselors first, then by name', () => {
    const result = buildCounselors(ORG, directory(roster([GRACE, AMANI]), [
      { pubkey: SALMA, profile_event: null },
      { pubkey: GRACE, profile_event: profile(GRACE_SECRET, { name: 'Zawadi' }) },
      { pubkey: AMANI, profile_event: profile(AMANI_SECRET, { name: 'Amani' }) },
    ]), NOW)
    expect(result.map((c) => c.profile?.name ?? c.status)).toEqual(['Amani', 'Zawadi', 'removed'])
  })
})

describe('readProfile', () => {
  it('refuses a profile signed by someone else', () => {
    expect(readProfile(profile(AMANI_SECRET, { name: 'Fake Grace' }), GRACE)).toBeNull()
  })

  it('refuses a profile edited after signing', () => {
    const event = graceProfile()
    expect(readProfile({ ...event, content: event.content.replace('Grace', 'Impostor') }, GRACE)).toBeNull()
  })

  it.each([
    ['not JSON', 'not json'],
    ['a list', '[1, 2]'],
    ['nameless', { about: 'no name' }],
    ['a name that is too long', { name: 'x'.repeat(81) }],
  ])('refuses content that is %s', (_label, content) => {
    expect(readProfile(profile(GRACE_SECRET, content), GRACE)).toBeNull()
  })

  it('refuses events that are not profiles', () => {
    expect(readProfile(profile(GRACE_SECRET, { name: 'Grace' }, 1), GRACE)).toBeNull()
  })

  it('trims and deduplicates lists and ignores what does not fit', () => {
    const result = readProfile(profile(GRACE_SECRET, {
      name: ' Grace ',
      languages: ['English', ' english ', '', 7, 'Kiswahili'],
      specialties: 'Legal aid',
      about: 'x'.repeat(501),
    }), GRACE)
    expect(result).toEqual({ name: 'Grace', about: null, specialties: [], languages: ['English', 'Kiswahili'], responseTime: null })
  })
})

describe('loading from the API', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubApi(routes: Record<string, unknown>) {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const path = new URL(url).pathname
      return path in routes
        ? new Response(JSON.stringify(routes[path]), { status: 200 })
        : new Response('{}', { status: 500 })
    }))
    return calls
  }

  const OTHER_ORG: Organization = { ...ORG, id: '22222222-2222-2222-2222-222222222222', name: 'Broken Org' }

  it('keeps the organisations that load when one fails, and sends no cookies or referrer', async () => {
    const calls = stubApi({
      '/v1/orgs': [ORG, OTHER_ORG],
      [`/v1/orgs/${ORG.id}/counsellors`]: directory(roster([GRACE]), [{ pubkey: GRACE, profile_event: graceProfile() }]),
    })
    const result = await loadDirectory()
    expect(result.map((c) => c.profile?.name)).toEqual(['Counsellor Grace'])
    expect(calls.every((c) => c.init?.credentials === 'omit' && c.init?.referrerPolicy === 'no-referrer')).toBe(true)
  })

  it('reports an error when no organisation loads', async () => {
    stubApi({ '/v1/orgs': [OTHER_ORG] })
    await expect(loadDirectory()).rejects.toThrow()
  })

  it('loads one counselor, and null when the organisation does not list her', async () => {
    stubApi({ [`/v1/orgs/${ORG.id}/counsellors`]: directory(roster([GRACE]), [{ pubkey: GRACE, profile_event: null }]) })
    expect((await loadCounselor(ORG.id, GRACE))?.status).toBe('verified')
    expect(await loadCounselor(ORG.id, AMANI)).toBeNull()
  })
})

describe('parseProfilePath', () => {
  it('reads the organisation and counselor from the address', () => {
    expect(parseProfilePath(`/app/counselors/${ORG.id}/${GRACE}`)).toEqual({ orgId: ORG.id, pubkey: GRACE })
    expect(parseProfilePath('/app/counselors/grace')).toBeNull()
    expect(parseProfilePath(`/app/counselors/${ORG.id}/NPUB1abc`)).toBeNull()
  })
})
