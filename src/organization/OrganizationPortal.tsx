import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CounselorEnrollment,
  CounselorInviteRecord,
  OrganizationDashboard,
  OrganizationFocusArea,
} from '../api/types'
import { ApiError } from '../api/client'
import {
  decryptCredential,
  nip05Document,
  organizationApi,
  rootOrganizationApi,
  signOperationalAuthorization,
  signRoster,
} from './organization'
import { organizationVault, type OrganizationVaultSummary as VaultSummary } from './organizationVault'
import './organization.css'

const go = (path: string) => window.location.assign(path)
const organizationFocusAreas: OrganizationFocusArea[] = ['Legal aid', 'Safe shelter', 'Medical care', 'Counselling', 'Emergency support', 'Economic empowerment', 'Child and family support', 'Advocacy and education']

function Exit() {
  return <button className="org-exit" onClick={() => { organizationVault.lock(); window.location.replace('/') }}>↪ Exit</button>
}

function Header({ title, back = false }: { title: string; back?: boolean }) {
  return <header className="org-header">{back && <button className="org-back" onClick={() => history.back()} aria-label="Go back">‹</button>}<h1>{title}</h1><Exit /></header>
}

function Screen({ title, back = false, className = '', children }: React.PropsWithChildren<{ title: string; back?: boolean; className?: string }>) {
  return <main className={`org-screen ${className}`}><Header title={title} back={back} />{children}</main>
}

function ErrorText({ children }: React.PropsWithChildren) {
  return children ? <p className="org-error" role="alert">{children}</p> : null
}

function Unlock({ onUnlock, summary }: { onUnlock: (summary: VaultSummary) => void; summary: VaultSummary }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const unlock = async () => {
    setBusy(true); setError('')
    try { onUnlock(await organizationVault.unlock(pin)) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to unlock'); setBusy(false) }
  }
  return <section className="org-unlock"><span className="org-symbol">◇</span><h2>Open {summary.name}</h2><p>Enter the organization PIN. It stays on this device and unlocks the operational key locally.</p><label>4-digit PIN<input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} type="password" inputMode="numeric" autoComplete="current-password" /></label><ErrorText>{error}</ErrorText><button className="org-primary" disabled={!/^\d{4}$/.test(pin) || busy} onClick={() => void unlock()}>{busy ? 'Unlocking…' : 'Unlock organization'}</button></section>
}

function PortalGate({ children }: { children: (summary: VaultSummary) => React.ReactNode }) {
  const [summary, setSummary] = useState<VaultSummary | null | undefined>(undefined)
  const [unlocked, setUnlocked] = useState(organizationVault.isUnlocked())
  useEffect(() => { void organizationVault.summary().then(setSummary) }, [])
  if (summary === undefined) return <p className="org-loading">Opening secure organization storage…</p>
  if (!summary) return <section className="org-empty"><h2>No organization on this device</h2><p>Register an organization to create its root and operational keys locally.</p><button className="org-primary" onClick={() => go('/organization/register')}>Register organization</button></section>
  if (!unlocked) return <Unlock summary={summary} onUnlock={(value) => { setSummary(value); setUnlocked(true) }} />
  return <>{children(summary)}</>
}

function Welcome() {
  const [summary, setSummary] = useState<VaultSummary | null | undefined>(undefined)
  useEffect(() => { void organizationVault.summary().then(setSummary) }, [])
  if (summary === undefined) return <Screen title="Organizations"><p className="org-loading">Checking this device…</p></Screen>
  return <Screen title="Organizations" className="org-welcome"><section className="org-hero"><span className="org-symbol">✦</span><p className="org-kicker">RESILIENCE PARTNERS</p><h2>Verify counselors without exposing survivors.</h2><p>Organizations use a protected Nostr identity to invite counselors, review encrypted credentials, and publish a transparent verified roster.</p></section>{summary ? <section className="org-existing"><small>ORGANIZATION ON THIS DEVICE</small><strong>{summary.name}</strong><span>{summary.domain}</span><button className="org-primary" onClick={() => go(summary.backupConfirmed ? '/organization/dashboard' : '/organization/backup')}>Continue to portal</button></section> : <><button className="org-primary" onClick={() => go('/organization/register')}>Register an organization</button><aside>Registration creates an offline root identity and separate operational and credential-review keys. A platform administrator approves the organization after its domain is verified.</aside></>}</Screen>
}

function Register() {
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [focusAreas, setFocusAreas] = useState<OrganizationFocusArea[]>([])
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const validDomain = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''))
  const ready = name.trim().length >= 2 && validDomain && focusAreas.length > 0 && /^\d{4}$/.test(pin) && pin === confirm && consent
  const toggleFocusArea = (area: OrganizationFocusArea) => setFocusAreas((current) => current.includes(area) ? current.filter((value) => value !== area) : current.length < 5 ? [...current, area] : current)
  const submit = async () => {
    setBusy(true); setError('')
    let created = false
    try {
      let summary = await organizationVault.summary()
      if (!summary) { summary = await organizationVault.create(pin, name, domain); created = true }
      else await organizationVault.unlock(pin)
      const rootApi = rootOrganizationApi()
      let organization = summary.organization
      if (!organization) {
        try { organization = (await rootApi.myOrganization()).organization }
        catch (caught) {
          if (!(caught instanceof ApiError) || caught.status !== 404) throw caught
          organization = await rootApi.applyOrganization({ name: summary.name, domain: summary.domain, focus_areas: focusAreas, directory_visibility: 'public' })
        }
        await organizationVault.setOrganization(organization)
      }
      const event = signOperationalAuthorization(summary.operationalPublicKey)
      try { await rootApi.authorizeOperationalKey(organization.id, event) }
      catch (caught) { if (!(caught instanceof ApiError) || caught.status !== 409) throw caught }
      go('/organization/backup')
    } catch (caught) {
      if (created) await organizationVault.clear()
      setError(caught instanceof Error ? caught.message : 'The organization could not be registered')
      setBusy(false)
    }
  }
  return <Screen title="Register organization" back className="org-form"><h2>Create your organization identity</h2><p>The root key is generated here. Resilience receives only signed requests and public keys.</p><label>Organization name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="e.g. Wangu Support Network" /></label><label>Public website domain<input value={domain} onChange={(event) => setDomain(event.target.value)} autoCapitalize="none" placeholder="example.org" /><small>You will publish one NIP-05 file on this domain.</small></label><fieldset className="org-focus"><legend>Focus areas <small>Choose up to 5</small></legend><div>{organizationFocusAreas.map((area)=><button type="button" className={focusAreas.includes(area)?'selected':''} aria-pressed={focusAreas.includes(area)} onClick={()=>toggleFocusArea(area)} key={area}>{area}</button>)}</div></fieldset><label>Create a 4-digit portal PIN<input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} type="password" inputMode="numeric" autoComplete="new-password" /></label><label>Confirm PIN<input value={confirm} onChange={(event) => setConfirm(event.target.value.replace(/\D/g, '').slice(0, 4))} type="password" inputMode="numeric" autoComplete="new-password" /></label><label className="org-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I understand that approved organizations and their verified counselor roster are public.</span></label><aside>▣ <span>The root key is used only to authorize operational keys. After backup confirmation, it is removed from this online vault.</span></aside><ErrorText>{error}</ErrorText><button className="org-primary" disabled={!ready || busy} onClick={() => void submit()}>{busy ? 'Creating secure identity…' : 'Create and apply'}</button></Screen>
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
}

function Backup() {
  const [summary, setSummary] = useState<VaultSummary | null>(null)
  const [words, setWords] = useState<string[]>([])
  const [copied, setCopied] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const reveal = (value: VaultSummary) => { setSummary(value); setWords(organizationVault.revealRootWords().split(' ')) }
  const copy = async (label: string, value: string) => { await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(''), 1500) }
  const finish = async () => {
    try { await organizationVault.confirmBackupAndPurgeRoot(); go('/organization/pending') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not confirm the backup') }
  }
  return <Screen title="Back up the root key" back className="org-backup"><PortalGate>{(value) => { if (!summary) window.setTimeout(() => reveal(value), 0); return words.length ? <><p>Write these 12 words down in order. They are the only way to authorize a replacement operational key.</p><ol>{words.map((word, index) => <li key={`${word}-${index}`}><small>{index + 1}</small><strong>{word}</strong></li>)}</ol><div className="org-row"><button className="org-secondary" onClick={() => void copy('words', words.join(' '))}>{copied === 'words' ? 'Copied' : 'Copy words'}</button><button className="org-secondary" onClick={() => downloadText(`${value.domain}-resilience-root-backup.txt`, `RESILIENCE ORGANIZATION ROOT BACKUP\n\nOrganization: ${value.name}\nDomain: ${value.domain}\nRoot public key: ${value.rootPublicKey}\n\n${words.join(' ')}\n\nKeep offline. Never send these words to Resilience, a counselor, or an administrator.\n`)}>Download</button></div><section className="org-nip05"><small>DOMAIN VERIFICATION</small><h3>Publish this exact file at</h3><code>https://{value.domain}/.well-known/nostr.json</code><pre>{nip05Document(value.rootPublicKey)}</pre><button onClick={() => void copy('nip05', nip05Document(value.rootPublicKey))}>{copied === 'nip05' ? 'Copied JSON' : 'Copy JSON'}</button></section><label className="org-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I saved the 12 words offline and understand the root key will be removed from this browser.</span></label><ErrorText>{error}</ErrorText><button className="org-primary" disabled={!confirmed} onClick={() => void finish()}>Confirm backup and remove root key</button></> : <p className="org-loading">Decrypting root backup locally…</p> }}</PortalGate></Screen>
}

function PendingContent({ summary }: { summary: VaultSummary }) {
  const [dashboard, setDashboard] = useState<OrganizationDashboard | null>(null)
  const [error, setError] = useState('')
  const refresh = async () => {
    try {
      const access = await organizationApi().myOrganization()
      if (access.organization.status === 'approved') { go('/organization/dashboard'); return }
      setDashboard(await organizationApi().organizationDashboard(access.organization.id))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load approval status') }
  }
  useEffect(() => { const immediate = window.setTimeout(() => void refresh(), 0); const interval = window.setInterval(() => void refresh(), 20_000); return () => { clearTimeout(immediate); clearInterval(interval) } }, [])
  return <section className="org-status"><span className="org-symbol pending">◷</span><p className="org-kicker">APPLICATION RECEIVED</p><h2>{summary.name} is pending approval</h2><p>Resilience checks the NIP-05 file on <strong>{summary.domain}</strong>. Keep the file online; this page checks again automatically.</p><div><span>✓ Root identity created and backed up</span><span>✓ Operational key authorized</span><span>{dashboard?.organization.nip05_verified_at ? '✓' : '◷'} Domain ownership {dashboard?.organization.nip05_verified_at ? 'verified' : 'checked during approval'}</span><span>◷ Platform administrator approval pending</span></div>{import.meta.env.DEV && dashboard && <aside className="org-dev-note"><strong>Local development</strong><span>This page cannot self-approve an organization. Configure a local NIP-05 response and approve organization ID <code>{dashboard.organization.id}</code> with the platform-admin development command.</span></aside>}<ErrorText>{error}</ErrorText><button className="org-secondary" onClick={() => void refresh()}>Check again</button></section>
}

function Pending() { return <Screen title="Organization verification" className="org-pending"><PortalGate>{(summary) => <PendingContent summary={summary} />}</PortalGate></Screen> }

function DashboardContent({ summary }: { summary: VaultSummary }) {
  const [dashboard, setDashboard] = useState<OrganizationDashboard | null>(null)
  const [enrollments, setEnrollments] = useState<CounselorEnrollment[]>([])
  const [invites, setInvites] = useState<CounselorInviteRecord[]>([])
  const [inviteCode, setInviteCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    setError('')
    try {
      const access = await organizationApi().myOrganization()
      if (access.organization.status !== 'approved') { go('/organization/pending'); return }
      const api = organizationApi()
      const [nextDashboard, nextEnrollments, nextInvites] = await Promise.all([api.organizationDashboard(access.organization.id), api.listCounselorEnrollments(access.organization.id), api.listCounselorInvites(access.organization.id)])
      setDashboard(nextDashboard); setEnrollments(nextEnrollments); setInvites(nextInvites)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load the dashboard') }
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer) }, [])
  const createInvite = async () => {
    if (!dashboard) return
    setBusy(true); setError('')
    try { const invite = await organizationApi().createCounselorInvite(dashboard.organization.id, { credential_recipient_pubkey: summary.reviewPublicKey, expires_in_hours: 168 }); setInviteCode(invite.code); await load() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create an invitation') }
    finally { setBusy(false) }
  }
  const attention = enrollments.filter((item) => item.status === 'under_review')
  return <><section className="org-dashboard-head"><div><p className="org-kicker">APPROVED ORGANIZATION</p><h2>{dashboard?.organization.name ?? summary.name}</h2><p>{summary.domain}</p></div><button className="org-primary" disabled={!dashboard || busy} onClick={() => void createInvite()}>{busy ? 'Generating…' : '+ Invite counselor'}</button></section>{inviteCode && <section className="org-invite-code"><small>NEW SINGLE-USE INVITE · COPY IT NOW</small><strong>{inviteCode}</strong><p>The API stores only a keyed hash. This code cannot be shown again.</p><button onClick={() => void navigator.clipboard.writeText(inviteCode)}>Copy invite code</button><button onClick={() => setInviteCode('')}>I’ve saved it</button></section>}<section className="org-metrics"><article><strong>{attention.length}</strong><span>Awaiting review</span></article><article><strong>{dashboard?.counsellors.verified ?? 0}</strong><span>Verified counselors</span></article><article><strong>{dashboard?.active_invites ?? 0}</strong><span>Active invites</span></article></section><section className="org-list"><div className="org-list-title"><h3>Counselor applications</h3><button onClick={() => void load()}>Refresh</button></div>{enrollments.map((enrollment) => <button className="org-application" onClick={() => go(`/organization/applications/${enrollment.id}`)} key={enrollment.id}><span className="org-avatar">{enrollment.profile.name.charAt(0).toUpperCase()}</span><span><strong>{enrollment.profile.name}</strong><small>{enrollment.profile.specialties.join(' · ') || 'No focus areas listed'}</small></span><span className={`org-pill ${enrollment.status}`}>{enrollment.status.replace('_', ' ')}</span><b>›</b></button>)}{!enrollments.length && <p className="org-empty-list">No counselor applications yet. Generate an invite to begin.</p>}</section><section className="org-list compact"><div className="org-list-title"><h3>Recent invitations</h3></div>{invites.slice(0, 5).map((invite) => <article key={invite.id}><span><strong>{invite.used_at ? 'Claimed' : 'Waiting to be claimed'}</strong><small>Expires {new Date(invite.expires_at).toLocaleString()}</small></span><span className={`org-pill ${invite.used_at ? 'approved' : 'draft'}`}>{invite.used_at ? 'used' : 'active'}</span></article>)}</section><ErrorText>{error}</ErrorText></>
}

function Dashboard() { return <Screen title="Organization portal" className="org-dashboard"><PortalGate>{(summary) => <DashboardContent summary={summary} />}</PortalGate></Screen> }

function ApplicationContent({ enrollmentId }: { enrollmentId: string }) {
  const [enrollment, setEnrollment] = useState<CounselorEnrollment | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try { const access = await organizationApi().myOrganization(); const values = await organizationApi().listCounselorEnrollments(access.organization.id); setEnrollment(values.find((item) => item.id === enrollmentId) ?? null) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load the application') }
  }, [enrollmentId])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer) }, [load])
  const decide = async (decision: 'request-information' | 'approve' | 'reject') => {
    if (!enrollment) return
    setBusy(decision); setError('')
    try { const updated = await organizationApi().reviewCounselorEnrollment(enrollment.organization_id, enrollment.id, decision, message); setEnrollment(updated); setMessage('') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The review decision could not be saved') }
    finally { setBusy('') }
  }
  const downloadCredential = async (documentIndex: number) => {
    if (!enrollment?.encrypted_credentials) return
    setBusy(`document-${documentIndex}`); setError('')
    try {
      const document = await decryptCredential(enrollment, enrollment.encrypted_credentials[documentIndex], documentIndex)
      const url = URL.createObjectURL(new Blob([document.bytes.slice().buffer as ArrayBuffer], { type: document.mediaType }))
      const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = document.name; anchor.click(); URL.revokeObjectURL(url); document.bytes.fill(0)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The credential could not be decrypted') }
    finally { setBusy('') }
  }
  const publish = async () => {
    if (!enrollment) return
    setBusy('publish'); setError('')
    try {
      const directory = await organizationApi().listCounselors(enrollment.organization_id)
      const members = directory.counsellors.filter((item) => item.status !== 'removed').map((item) => item.pubkey)
      if (!members.includes(enrollment.counsellor_pubkey)) members.push(enrollment.counsellor_pubkey)
      await organizationApi().publishRoster(enrollment.organization_id, signRoster(members))
      await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The signed roster could not be published') }
    finally { setBusy('') }
  }
  if (!enrollment) return <p className="org-loading">{error || 'Loading counselor application…'}</p>
  const reviewable = enrollment.status === 'under_review' || enrollment.status === 'more_information'
  return <><section className="org-profile-card"><span className="org-avatar">{enrollment.profile.name.charAt(0).toUpperCase()}</span><div><h2>{enrollment.profile.name}</h2><p>{enrollment.profile.specialties.join(' · ')}</p><small>{enrollment.profile.languages.join(' · ')}</small></div><span className={`org-pill ${enrollment.status}`}>{enrollment.status.replace('_', ' ')}</span></section><section className="org-review-block"><h3>Signed profile</h3>{enrollment.profile.about && <p>{enrollment.profile.about}</p>}<code>{enrollment.counsellor_pubkey}</code></section><section className="org-review-block"><h3>Encrypted credentials</h3><p>Documents decrypt only in this browser with the organization’s dedicated review key.</p>{enrollment.encrypted_credentials?.map((document, index) => <button className="org-document" key={`${document.ciphertext.slice(0, 12)}-${index}`} onClick={() => void downloadCredential(index)} disabled={Boolean(busy)}><span>▤</span><span><strong>Credential {index + 1}</strong><small>{document.media_type}</small></span><b>{busy === `document-${index}` ? 'Decrypting…' : 'Decrypt & download'}</b></button>) ?? <p>No documents submitted.</p>}</section>{enrollment.review_message && <aside className="org-message"><small>LAST REVIEW MESSAGE</small>{enrollment.review_message}</aside>}{reviewable && <section className="org-decision"><label>Message to counselor<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Required when requesting more information" rows={3} /></label><div><button className="org-secondary" disabled={Boolean(busy) || !message.trim()} onClick={() => void decide('request-information')}>Request information</button><button className="org-danger" disabled={Boolean(busy)} onClick={() => void decide('reject')}>Reject</button></div><button className="org-primary" disabled={Boolean(busy) || enrollment.status !== 'under_review'} onClick={() => void decide('approve')}>{busy === 'approve' ? 'Approving…' : 'Approve credentials'}</button></section>}{enrollment.status === 'approved' && enrollment.directory_status !== 'verified' && <section className="org-publish"><h3>Publish verification</h3><p>Approval is private. Sign and publish a new public roster to make the verified badge visible.</p><button className="org-primary" disabled={Boolean(busy)} onClick={() => void publish()}>{busy === 'publish' ? 'Signing roster…' : 'Publish verified counselor'}</button></section>}{enrollment.directory_status === 'verified' && <p className="org-success">✓ This counselor is on the organization’s current signed roster.</p>}<ErrorText>{error}</ErrorText></>
}

function Application({ id }: { id: string }) { return <Screen title="Counselor review" back className="org-review"><PortalGate>{() => <ApplicationContent enrollmentId={id} />}</PortalGate></Screen> }

export default function OrganizationPortal() {
  const path = window.location.pathname
  const applicationId = useMemo(() => path.match(/^\/organization\/applications\/([^/]+)$/)?.[1], [path])
  if (applicationId) return <Application id={applicationId} />
  if (path.endsWith('/register')) return <Register />
  if (path.endsWith('/backup')) return <Backup />
  if (path.endsWith('/pending')) return <Pending />
  if (path.endsWith('/dashboard')) return <Dashboard />
  return <Welcome />
}
