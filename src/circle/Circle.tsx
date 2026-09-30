import { useState } from 'react'
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

function Header({ title, back, menu }: { title: string; back: () => void; menu?: () => void }) {
  return <header className="circle-header"><button className="circle-back" onClick={back} aria-label="Go back"><Icon name="back" size={18} /></button><strong>{title}</strong>{menu && <button className="circle-more" onClick={menu} aria-label="Open member menu"><Icon name="more" size={19} /></button>}<button className="circle-exit" onClick={() => window.location.replace('/')}><Icon name="exit" size={17} />Exit</button></header>
}
function Nav({ active = 'home' }: { active?: 'home' | 'messages' }) { return <nav className="circle-nav"><a className={active === 'home' ? 'active' : ''} href="/app"><Icon name="home" /><span>Home</span></a><button className={active === 'messages' ? 'active' : ''}><Icon name="chat" /><span>Messages</span></button><button><Icon name="wallet" /><span>Wallet</span></button><button><Icon name="settings" /><span>Settings</span></button></nav> }

function CircleHome() {
  const pending = sessionStorage.getItem('circle-pending-invite')
  const members = ['Sunrise', 'Amani'].filter((name) => !sessionStorage.getItem(`circle-removed-${name.toLowerCase()}`))
  return <div className="circle-screen"><Header title="My circle" back={() => go('/app')} /><p className="circle-private">Your circle is private. No one else can see who’s in it.</p><main className="circle-members">{members.map((name) => <article key={name}><span className="circle-avatar"><Icon name="person" /></span><strong>{name}</strong><button onClick={() => go(`/app/circle/${name.toLowerCase()}`)}>Message</button></article>)}{pending && <article className="pending-member"><span className="circle-avatar"><Icon name="clock" /></span><span><strong>{pending}</strong><small>Waiting for them to accept</small></span><em>Waiting</em></article>} {!pending && members.length < 3 && <button className="invite-circle" onClick={() => go('/app/circle/invite')}><Icon name="plus" />Invite someone (Max 3)</button>}</main><Nav /></div>
}

type Message = { from: 'them' | 'me'; text: string }
function MemberMenu({ close, member }: { close: () => void; member: string }) { const remove = () => { sessionStorage.setItem(`circle-removed-${member.toLowerCase()}`, 'true'); go('/app/circle') }; return <><button className="circle-backdrop" onClick={close} aria-label="Close member menu" /><section className="circle-member-menu"><span className="sheet-handle" /><div className="member-heading"><span className="circle-avatar"><Icon name="person" /></span><span><h2>{member}</h2><p>In your circle</p></span></div><button className="danger"><Icon name="block" />Block</button><button className="danger"><Icon name="report" />Report</button><button className="danger" onClick={remove}><Icon name="trash" />Remove from circle</button><small>They won’t be notified.</small></section></> }

function CircleChat({ member }: { member: string }) {
  const [menu, setMenu] = useState(false), [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<Message[]>([{ from: 'them', text: 'Hey, just wanted to check in. Are you safe tonight?' }, { from: 'me', text: 'Yes, I am home now. Everything is fine. Thanks for asking!' }])
  const send = () => { if (!draft.trim()) return; setMessages((list) => [...list, { from: 'me', text: draft.trim() }]); setDraft('') }
  const quick = (text: string) => setDraft(text)
  return <div className="circle-screen circle-chat"><Header title={member} back={() => go('/app/circle')} menu={() => setMenu(true)} /><main className="circle-messages">{messages.map((message, index) => <div className={message.from} key={index}><p>{message.text}</p>{message.from === 'me' && <small>Sent</small>}</div>)}</main><div className="quick-actions"><button onClick={() => quick('Please check on me')}>Check on me</button><button onClick={() => quick('I need help')}>I need help</button></div><form className="circle-composer" onSubmit={(event) => { event.preventDefault(); send() }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message…" /><button aria-label="Send"><Icon name="send" /></button></form><Nav active="messages" />{menu && <MemberMenu member={member} close={() => setMenu(false)} />}</div>
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function makeInviteCode() { const bytes = crypto.getRandomValues(new Uint8Array(6)); return Array.from(bytes, (byte, index) => `${index === 3 ? '-' : ''}${alphabet[byte % alphabet.length]}`).join('') }
function getInviteCode() { const existing = sessionStorage.getItem('circle-invite-code'); if (existing) return existing; const code = makeInviteCode(); sessionStorage.setItem('circle-invite-code', code); return code }

function Invite() {
  const [code] = useState(getInviteCode), [copied, setCopied] = useState(false), [pending, setPending] = useState(sessionStorage.getItem('circle-pending-invite'))
  const copy = async () => { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
  const invite = (name: string) => { sessionStorage.setItem('circle-pending-invite', name); setPending(name) }
  return <div className="circle-screen"><Header title="Invite someone" back={() => go('/app/circle')} /><main className="invite-content"><p>Nicknames can’t be searched, so only people you invite can join your circle.</p><h2>Share a one-time invite code</h2><div className="invite-code"><strong>{code}</strong><button onClick={copy} aria-label="Copy invite code"><Icon name="copy" /></button></div><small>{copied ? 'Copied to clipboard.' : 'Works once, expires in 24 hours.'}</small><h2>Invite someone you’ve talked with</h2>{['River', 'Hope'].map((name) => <article key={name}><span className="circle-avatar"><Icon name="person" /></span><strong>{name}</strong><button disabled={Boolean(pending)} onClick={() => invite(name)}>{pending === name ? 'Waiting' : 'Invite'}</button></article>)}</main><Nav /></div>
}

export default function Circle() {
  const path = window.location.pathname
  if (path.endsWith('/invite')) return <Invite />
  if (path.endsWith('/amani')) return <CircleChat member="Amani" />
  if (path.endsWith('/sunrise')) return <CircleChat member="Sunrise" />
  return <CircleHome />
}
