import { useEffect, useMemo, useState } from 'react'
import { ResilienceApi } from '../api/client'
import type { Organization } from '../api/types'
import './donate.css'

const go = (path: string) => window.location.assign(path)
const invoice = 'lnbc210u1p5resilience8q8x7kztestonly'
const organizationKey = 'donation-organization'
const formatKes = (sats: number) => Math.round((sats * 2700) / 21000).toLocaleString('en-KE')

type DonationOrganization = Pick<Organization, 'id' | 'name' | 'domain' | 'focus_areas'>

const selectedOrganization = (): DonationOrganization | null => {
  try {
    const value = sessionStorage.getItem(organizationKey)
    return value ? (JSON.parse(value) as DonationOrganization) : null
  } catch {
    return null
  }
}

function Shell({ children }: React.PropsWithChildren) {
  return <main className="donate-page"><section className="donate-modal" aria-labelledby="donate-title"><header><h1 id="donate-title">Donate</h1><button onClick={() => window.location.assign('/')} aria-label="Close donation flow">×</button></header><div className="donate-test">TEST MODE: NO REAL MONEY MOVES</div>{children}</section></main>
}

function ChooseOrganization() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selected, setSelected] = useState(selectedOrganization()?.id ?? '')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    new ResilienceApi().listOrganizations(controller.signal)
      .then(setOrganizations)
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Could not load organizations')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])

  const retry = () => {
    setLoading(true)
    setError('')
    setReload((value) => value + 1)
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return organizations
    return organizations.filter((organization) => `${organization.name} ${organization.domain} ${organization.focus_areas.join(' ')}`.toLowerCase().includes(needle))
  }, [organizations, query])

  const continueToAmount = () => {
    const organization = organizations.find((item) => item.id === selected)
    if (!organization) return
    const value: DonationOrganization = { id: organization.id, name: organization.name, domain: organization.domain, focus_areas: organization.focus_areas }
    sessionStorage.setItem(organizationKey, JSON.stringify(value))
    go('/donate/amount')
  }

  return <Shell><div className="donate-heading"><span>1 of 2</span><h2>Choose an organization</h2><p>Your donation goes to the approved organization you select.</p></div><label className="donate-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search by name or focus area" aria-label="Search organizations" /></label>{loading&&<p className="donate-loading">Loading approved organizations…</p>}{error&&<div className="donate-error" role="alert"><p>{error}</p><button onClick={retry}>Try again</button></div>}{!loading&&!error&&!organizations.length&&<div className="donate-empty"><strong>No approved organizations yet</strong><p>Donations will become available when the first organization is approved.</p></div>}<div className="donate-organizations">{visible.map((organization)=><button className={selected===organization.id?'selected':''} aria-pressed={selected===organization.id} onClick={()=>setSelected(organization.id)} key={organization.id}><i>{organization.name.charAt(0).toUpperCase()}</i><span><strong>{organization.name}</strong><small>✓ Approved · {organization.domain}</small><em>{organization.focus_areas.length?organization.focus_areas.join(' · '):'Community support'}</em></span><b aria-hidden="true">{selected===organization.id?'●':'○'}</b></button>)}</div>{!loading&&!error&&organizations.length>0&&visible.length===0&&<p className="donate-loading">No organizations match that search.</p>}<button className="donate-primary" disabled={!selected} onClick={continueToAmount}>Continue</button><p className="donate-footnote">Only approved organizations appear here. Resilience does not ask for your name or email.</p></Shell>
}

function OrganizationSummary({ organization, change = false }: { organization: DonationOrganization; change?: boolean }) {
  return <div className="donate-partner"><i>{organization.name.charAt(0).toUpperCase()}</i><span><strong>{organization.name}</strong><small>{organization.focus_areas.length ? organization.focus_areas.join(' · ') : 'Community support'}</small></span>{change&&<button onClick={()=>go('/donate')}>Change</button>}</div>
}

function Amount() {
  const organization = selectedOrganization()
  const [amount, setAmount] = useState(21000)
  const [custom, setCustom] = useState('')
  if (!organization) return <ChooseOrganization />
  const customAmount = Number(custom)
  const valid = custom ? customAmount >= 100 : amount > 0
  const choose = (value: number) => { setAmount(value); setCustom('') }
  const submit = () => {
    const sats = custom ? customAmount : amount
    sessionStorage.setItem('donation-amount', String(sats))
    sessionStorage.setItem('donation-created', String(Date.now()))
    go('/donate/pay')
  }
  return <Shell><div className="donate-heading"><span>2 of 2</span><h2>Choose an amount</h2></div><OrganizationSummary organization={organization} change /><div className="donate-amounts">{[5000, 21000, 50000].map((value) => <button className={!custom && amount === value ? 'selected' : ''} onClick={() => choose(value)} key={value}><strong>{value.toLocaleString()} sats</strong><small>≈ KES {formatKes(value)}</small></button>)}<label className={custom ? 'selected' : ''}><strong>Other amount</strong><input inputMode="numeric" value={custom} onChange={(event) => setCustom(event.target.value.replace(/\D/g, ''))} placeholder="Enter sats" aria-label="Custom amount in sats" /></label></div><p className="donate-privacy"><span>▢</span>No account or email needed. Your test donation goes to {organization.name}’s pooled fund.</p><button className="donate-primary" disabled={!valid} onClick={submit}>Pay with Lightning</button><p className="donate-footnote">KES amounts are estimates and change with the Bitcoin price.</p></Shell>
}

function Qr() {
  const cells = Array.from({ length: 29 * 29 }, (_, index) => { const x = index % 29, y = Math.floor(index / 29); const finder = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7 && ((x === ox || x === ox + 6 || y === oy || y === oy + 6) || (x >= ox + 2 && x <= ox + 4 && y >= oy + 2 && y <= oy + 4)); return finder(1, 1) || finder(21, 1) || finder(1, 21) || ((x * 7 + y * 11 + x * y) % 5 < 2 && x > 0 && y > 0 && x < 28 && y < 28) })
  return <svg className="donate-qr" viewBox="0 0 29 29" aria-label="Test Lightning QR code">{cells.map((filled, index) => filled && <rect x={index % 29} y={Math.floor(index / 29)} width="1" height="1" key={index} />)}</svg>
}

function Pay() {
  const organization = selectedOrganization()
  const amount = Number(sessionStorage.getItem('donation-amount') || 21000)
  const [remaining, setRemaining] = useState(() => { const created = Number(sessionStorage.getItem('donation-created') || Date.now()); return Math.max(0, 600 - Math.floor((Date.now() - created) / 1000)) })
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (remaining <= 0) { go('/donate/expired'); return } const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer) }, [remaining])
  if (!organization) return <ChooseOrganization />
  const minutes = Math.floor(remaining / 60).toString().padStart(2, '0')
  const seconds = (remaining % 60).toString().padStart(2, '0')
  const copy = async () => { await navigator.clipboard?.writeText(invoice); setCopied(true) }
  return <Shell><div className="donate-payment"><h2>{amount.toLocaleString()} sats</h2><p>to {organization.name} · ≈ KES {formatKes(amount)}</p><Qr /><strong className="donate-timer">◷ Expires in {minutes}:{seconds}</strong><div className="invoice"><code>{invoice.slice(0, 18)}…{invoice.slice(-6)}</code><button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button></div><p className="donate-pending"><i />Pending: waiting for payment</p><button className="donate-primary" onClick={() => go('/donate/success')}>Open in my Lightning wallet</button><button className="donate-test-complete" onClick={() => go('/donate/success')}>Simulate completed test payment</button><small>Scan with any Lightning wallet. This page updates when the payment arrives.</small></div></Shell>
}

function Expired() { return <Shell><div className="donate-state"><span className="expired-icon">!</span><h2>This payment request expired</h2><p>No money was taken. Lightning requests only last 10 minutes, so you can simply make a new one.</p><button className="donate-primary" onClick={() => { sessionStorage.setItem('donation-created', String(Date.now())); go('/donate/pay') }}>Make a new request</button><button onClick={() => go('/donate/amount')}>Choose a different amount</button></div></Shell> }
function Success() { const amount = Number(sessionStorage.getItem('donation-amount') || 21000); const organization = selectedOrganization(); return <Shell><div className="donate-state"><span className="success-icon">✓</span><h2>Test payment complete</h2><p>Your simulated donation of {amount.toLocaleString()} sats to {organization?.name ?? 'the selected organization'} was recorded. No real money moved.</p><button className="donate-primary" onClick={() => window.location.assign('/')}>Back to Resilience</button><button onClick={() => go('/donate')}>Make another test donation</button></div></Shell> }

export default function Donate() { const path = window.location.pathname; if (path.endsWith('/amount')) return <Amount />; if (path.endsWith('/pay')) return <Pay />; if (path.endsWith('/expired')) return <Expired />; if (path.endsWith('/success')) return <Success />; return <ChooseOrganization /> }
