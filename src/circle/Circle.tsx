import { useCallback, useEffect, useMemo, useState } from 'react'
import { createAuthenticatedApi } from '../api/client'
import type { CircleRecipients } from '../api/types'
import { ChatNotice, PinUnlock } from '../messaging/ChatParts'
import { useMessenger } from '../messaging/useMessenger'
import './circle.css'

type IconName = 'back' | 'exit' | 'person' | 'plus' | 'copy' | 'send' | 'home' | 'chat' | 'wallet' | 'settings' | 'more' | 'block' | 'report' | 'trash' | 'clock'
const paths: Record<IconName, React.ReactNode> = {
  back: <path d="m15 18-6-6 6-6" />, exit: <><path d="M10 5H5v14h5" /><path d="m14 8 4 4-4 4M8 12h10" /></>, person: <><circle cx="12" cy="8" r="3" /><path d="M6 20v-2a6 6 0 0 1 12 0v2" /></>, plus: <path d="M12 5v14M5 12h14" />,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>, send: <><path d="m3 11 18-8-8 18-2-8-8-2Z" /><path d="m11 13 4-4" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>, chat: <path d="M20 11.5a8 8 0 0 1-9.1 7.9L5 21l1.6-4A8 8 0 1 1 20 11.5Z" />, wallet: <><path d="M3 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6Z" /><path d="M15 11h6v5h-6a2 2 0 0 1 0-5Z" /></>, settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  more: <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>, block: <path d="M5 19 19 5" />, report: <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v5M12 17h.01" /></>, trash: <><path d="M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14" /></>, clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
}
function Icon({ name, size = 22 }: { name: IconName; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg> }
const go = (path: string) => window.location.assign(path)
const apiFor = (identity: { withPrivateKey: <T>(operation: (key: Uint8Array) => T) => T }) => createAuthenticatedApi(identity.withPrivateKey)
const alias = (pubkey: string) => `Circle ${pubkey.slice(-4).toUpperCase()}`

function Header({ title, back, menu }: { title: string; back: () => void; menu?: () => void }) {
  return <header className="circle-header"><button className="circle-back" onClick={back} aria-label="Go back"><Icon name="back" size={18} /></button><strong>{title}</strong>{menu && <button className="circle-more" onClick={menu} aria-label="Open member menu"><Icon name="more" size={19} /></button>}<button className="circle-exit" onClick={() => window.location.replace('/')}><Icon name="exit" size={17} />Exit</button></header>
}
function Nav({ active = 'home' }: { active?: 'home' | 'messages' }) { return <nav className="circle-nav"><a className={active === 'home' ? 'active' : ''} href="/app"><Icon name="home" /><span>Home</span></a><a className={active === 'messages' ? 'active' : ''} href="/app/messages"><Icon name="chat" /><span>Messages</span></a><a href="/app/wallet"><Icon name="wallet" /><span>Wallet</span></a><a href="/app/settings"><Icon name="settings" /><span>Settings</span></a></nav> }

function useCircleRouting() {
  const chat = useMessenger('survivor', false)
  const [routing, setRouting] = useState<CircleRecipients | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    if (chat.state.kind !== 'ready') return
    const api = apiFor(chat.state.identity)
    try { setRouting(await api.circleRecipients()); setMissing(false) }
    catch (caught) {
      if (caught instanceof Error && caught.message.includes('not found')) { setMissing(true); return }
      if (caught instanceof Error && caught.message.includes('reissued')) {
        await api.refreshCircleRoutingKey(); setRouting(await api.circleRecipients()); return
      }
      setError(caught instanceof Error ? caught.message : 'Could not load your circle.')
    }
  }, [chat.state])
  useEffect(() => {
    if (chat.state.kind !== 'ready') return
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [chat.state.kind, refresh])
  return { chat, routing, missing, error, refresh }
}

function CircleHome() {
  const { chat, routing, missing, error, refresh } = useCircleRouting()
  if (chat.state.kind === 'locked') return <div className="circle-screen"><Header title="My circle" back={() => go('/app')} /><PinUnlock title="Unlock your circle" text="Enter your PIN to see your private circle." unlock={chat.unlock} /></div>
  if (chat.state.kind === 'no-account') return <div className="circle-screen"><Header title="My circle" back={() => go('/app')} /><ChatNotice action={{ label: 'Create an account', run: () => go('/onboarding/create') }}>Create an account to keep a private circle.</ChatNotice></div>
  return <div className="circle-screen"><Header title="My circle" back={() => go('/app')} /><p className="circle-private">Your circle is private. No public member list is published.</p><main className="circle-members">{routing?.recipients.map((pubkey) => <article key={pubkey}><span className="circle-avatar"><Icon name="person" /></span><strong>{alias(pubkey)}</strong><button onClick={() => go(`/app/circle/chat/${pubkey}`)}>Message</button></article>)}{missing && <ChatNotice action={{ label: 'Enter invite code', run: () => go('/app/circle/join') }}>Your circle is empty. Create one by inviting someone, or join with a one-time code.</ChatNotice>}{error && <p role="alert">{error}</p>}{chat.state.kind === 'ready' && (!routing || routing.recipients.length < 2) && <button className="invite-circle" onClick={() => go('/app/circle/invite')}><Icon name="plus" />Invite someone (Max 3)</button>}{routing && <button className="invite-circle" onClick={() => void refresh()}><Icon name="clock" />Refresh circle</button>}</main><Nav /></div>
}

function MemberMenu({ close, peer, circleId }: { close: () => void; peer: string; circleId: string }) {
  const chat = useMessenger('survivor', false)
  const act = async (action: 'block' | 'report' | 'remove') => {
    if (chat.state.kind !== 'ready') return
    const api = apiFor(chat.state.identity)
    if (action === 'block') await api.blockPeer(peer)
    else if (action === 'report') await api.createReport({ subject_pubkey: peer, reason: 'other' })
    else await api.removeCircleMember(circleId, peer)
    go('/app/circle')
  }
  return <><button className="circle-backdrop" onClick={close} aria-label="Close member menu" /><section className="circle-member-menu"><span className="sheet-handle" /><div className="member-heading"><span className="circle-avatar"><Icon name="person" /></span><span><h2>{alias(peer)}</h2><p>In your circle</p></span></div><button className="danger" onClick={() => void act('block')}><Icon name="block" />Block</button><button className="danger" onClick={() => void act('report')}><Icon name="report" />Report</button><button className="danger" onClick={() => void act('remove')}><Icon name="trash" />Remove from circle</button><small>They won’t be notified.</small></section></>
}

function CircleChat({ peer }: { peer: string }) {
  const { chat, routing } = useCircleRouting()
  const [menu, setMenu] = useState(false), [draft, setDraft] = useState(''), [error, setError] = useState('')
  const messages = useMemo(() => chat.messages.filter((item) => item.peer === peer), [chat.messages, peer])
  const send = async () => {
    if (!draft.trim() || !chat.messenger) return
    const text = draft; setDraft(''); setError('')
    try { await chat.messenger.send(peer, alias(peer), text) }
    catch { setDraft(text); setError('That message could not be sent. Try again.') }
  }
  let body: React.ReactNode
  if (chat.state.kind === 'locked') body = <PinUnlock title="Unlock this conversation" text="Enter your PIN to decrypt messages." unlock={chat.unlock} />
  else if (chat.state.kind !== 'ready') body = <p>Connecting securely…</p>
  else body = <main className="circle-messages">{messages.length === 0 && <p>Start a private conversation with this circle member.</p>}{messages.map((message) => <div className={message.fromMe ? 'me' : 'them'} key={message.id}><p>{message.text}</p>{message.fromMe && <small>{message.status === 'sending' ? 'Sending' : 'Sent'}</small>}</div>)}</main>
  return <div className="circle-screen circle-chat"><Header title={alias(peer)} back={() => go('/app/circle')} menu={() => setMenu(true)} />{body}<div className="quick-actions"><button onClick={() => setDraft('Please check on me')}>Check on me</button><button onClick={() => setDraft('I need help')}>I need help</button></div>{error && <small role="alert">{error}</small>}{chat.state.kind === 'ready' && <form className="circle-composer" onSubmit={(event) => { event.preventDefault(); void send() }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message…" /><button aria-label="Send"><Icon name="send" /></button></form>}<Nav active="messages" />{menu && routing && <MemberMenu peer={peer} circleId={routing.circle_id} close={() => setMenu(false)} />}</div>
}

function Invite() {
  const { chat } = useCircleRouting()
  const [code, setCode] = useState(''), [copied, setCopied] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const identity = chat.state.kind === 'ready' ? chat.state.identity : null
  const createInvite = useCallback(async () => {
    if (!identity) return
    setLoading(true); setError('')
    try { setCode((await apiFor(identity).createCircleInvite()).code) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create an invite.') }
    finally { setLoading(false) }
  }, [identity])
  useEffect(() => {
    if (!identity) return
    const timer = window.setTimeout(() => void createInvite(), 0)
    return () => window.clearTimeout(timer)
  }, [identity, createInvite])
  const copy = async () => { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
  let body: React.ReactNode
  if (chat.state.kind === 'locked') body = <PinUnlock title="Unlock your circle" text="Enter your PIN to create a private one-time invite." unlock={chat.unlock} />
  else if (chat.state.kind === 'no-account') body = <ChatNotice action={{ label: 'Create an account', run: () => go('/onboarding/create') }}>Create an account before inviting someone to your circle.</ChatNotice>
  else if (chat.state.kind === 'error') body = <ChatNotice action={{ label: 'Try again', run: () => void chat.retry() }}>{chat.state.message}</ChatNotice>
  else if (chat.state.kind !== 'ready') body = <ChatNotice>Connecting securely…</ChatNotice>
  else body = <main className="invite-content"><p>Only a person with this one-time code can join your circle.</p><h2>Share a one-time invite code</h2><div className="invite-code"><strong>{loading ? 'Creating…' : code || 'Unavailable'}</strong><button disabled={!code} onClick={() => void copy()} aria-label="Copy invite code"><Icon name="copy" /></button></div><small>{copied ? 'Copied to clipboard.' : 'Works once, expires in 24 hours.'}</small>{error && <><p role="alert">{error}</p><button type="button" onClick={() => void createInvite()}>Try again</button></>}<button onClick={() => go('/app/circle/join')}>I have an invite code</button></main>
  return <div className="circle-screen"><Header title="Invite someone" back={() => go('/app/circle')} />{body}<Nav /></div>
}

function JoinCircle() {
  const { chat } = useCircleRouting()
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const join = async () => {
    if (chat.state.kind !== 'ready') return
    setBusy(true); setError('')
    try { await apiFor(chat.state.identity).claimCircleInvite(code); go('/app/circle') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'This invite could not be claimed.'); setBusy(false) }
  }
  let body: React.ReactNode
  if (chat.state.kind === 'locked') body = <PinUnlock title="Unlock your account" text="Enter your PIN before joining this private circle." unlock={chat.unlock} />
  else if (chat.state.kind === 'no-account') body = <ChatNotice action={{ label: 'Create an account', run: () => go('/onboarding/create') }}>Create an account before joining a circle.</ChatNotice>
  else if (chat.state.kind === 'error') body = <ChatNotice action={{ label: 'Try again', run: () => void chat.retry() }}>{chat.state.message}</ChatNotice>
  else if (chat.state.kind !== 'ready') body = <ChatNotice>Connecting securely…</ChatNotice>
  else body = <main className="invite-content"><p>Enter the one-time invite code exactly as it was shared with you.</p><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" autoComplete="one-time-code" />{error && <p role="alert">{error}</p>}<button disabled={code.length < 8 || busy} onClick={() => void join()}>{busy ? 'Joining…' : 'Join circle'}</button></main>
  return <div className="circle-screen"><Header title="Join a circle" back={() => go('/app/circle')} />{body}<Nav /></div>
}

export default function Circle() {
  const path = window.location.pathname
  if (path.endsWith('/invite')) return <Invite />
  if (path.endsWith('/join')) return <JoinCircle />
  if (path.includes('/chat/')) return <CircleChat peer={path.split('/').pop() || ''} />
  return <CircleHome />
}
