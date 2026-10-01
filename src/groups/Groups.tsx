import { useEffect, useState } from 'react'
import './groups.css'

type IconName = 'back' | 'exit' | 'check' | 'chat' | 'home' | 'wallet' | 'settings' | 'send' | 'menu' | 'plus' | 'block' | 'report'
const icons: Record<IconName, React.ReactNode> = {
  back: <path d="m15 18-6-6 6-6" />, exit: <><path d="M10 5H5v14h5" /><path d="m14 8 4 4-4 4M8 12h10" /></>, check: <path d="m5 12 4 4L19 6" />,
  chat: <path d="M20 11.5a8 8 0 0 1-9.1 7.9L5 21l1.6-4A8 8 0 1 1 20 11.5Z" />, home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>,
  wallet: <><path d="M3 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6Z" /><path d="M15 11h6v5h-6a2 2 0 0 1 0-5Z" /></>, settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  send: <><path d="m3 11 18-8-8 18-2-8-8-2Z" /><path d="m11 13 4-4" /></>, menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>, plus: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>, block: <path d="M5 19 19 5" />, report: <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
}
function Icon({ name, size = 22 }: { name: IconName; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg> }

const mode = () => new URLSearchParams(window.location.search).get('mode') === 'guest'
const href = (path: string) => `${path}${mode() ? `${path.includes('?') ? '&' : '?'}mode=guest` : ''}`
const go = (path: string) => window.location.assign(href(path))

function Header({ title, back, menu }: { title: string; back: () => void; menu?: () => void }) {
  return <header className="groups-header"><button className="groups-back" type="button" onClick={back} aria-label="Go back"><Icon name="back" size={18} /></button><strong>{title}</strong>{menu && <button className="groups-menu-button" type="button" onClick={menu} aria-label="Group options"><Icon name="menu" /></button>}<button className="groups-exit" type="button" onClick={() => window.location.replace('/')}><Icon name="exit" size={17} />Exit</button></header>
}
function Nav() { return <nav className="groups-nav"><a className="active" href={href('/app')}><Icon name="home" /><span>Home</span></a><a href={href('/app/messages')}><Icon name="chat" /><span>Messages</span></a><a href="/app/wallet"><Icon name="wallet" /><span>Wallet</span></a><a href={href('/app/settings')}><Icon name="settings" /><span>Settings</span></a></nav> }

const groupList = [
  { slug: 'healing', title: 'Healing after abuse', description: 'A safe space to share and recover from domestic abuse.', leader: 'Grace (Moderator)', action: 'Joined', access: 'joined' },
  { slug: 'safety', title: 'Safety planning', description: 'Create a personalized, secure safety strategy.', leader: 'Sarah', action: 'Open to join', access: 'open' },
  { slug: 'mothers', title: 'Mothers supporting mothers', description: 'For survivors navigating parenting and custody.', leader: 'Joy', action: 'Request to join', access: 'request' },
  { slug: 'legal', title: 'Legal questions', description: 'Get guidance on custody, protection orders, and divorce.', leader: 'Grace', action: 'Open to join', access: 'open' },
]

function Directory() {
  return <div className="groups-screen"><Header title="Talk to someone" back={() => go('/app')} /><div className="groups-tabs"><button onClick={() => go('/app/counselors')}>One-to-one</button><button className="active">Groups</button></div><main className="group-list">{groupList.map((group) => <article className="group-card" key={group.slug}><h2>{group.title}</h2><p>{group.description}</p><span>Led by {group.leader} <strong><Icon name="check" size={16} />Verified by FIDA Kenya</strong></span><button type="button" onClick={() => group.access === 'joined' ? go('/app/groups/healing/chat') : go(`/app/groups/${group.slug}?access=${group.access}`)}>{group.action}</button></article>)}</main><button className="groups-help" onClick={() => window.location.assign('/onboarding/emergency')}>Need help now?</button><Nav /></div>
}

function Details() {
  const access = new URLSearchParams(window.location.search).get('access') ?? 'request'
  const request = access !== 'open'
  const submit = () => request ? go('/app/groups/request-sent') : go('/app/groups/request-accepted')
  return <div className="groups-screen details-screen"><Header title="Healing after abuse" back={() => go('/app/groups')} /><main><section className="group-summary"><p>A private space for women to share their healing journeys, find mutual support, and rebuild their lives after domestic abuse.</p><span>Led by Grace (Moderator) <strong><Icon name="check" size={16} />Verified by FIDA Kenya</strong></span></section><section className="rules"><h2>Group rules</h2><ol><li>Be kind.</li><li>Keep what’s shared here private.</li><li>No sharing personal contact details.</li><li>The moderator can remove messages.</li></ol></section><section className="visibility"><h3>What others in this group see</h3><div><span>• Your nickname</span><span><Icon name="chat" size={18} />Messages</span></div><p>You can leave anytime. No announcement is posted when you leave.</p></section></main><button className="groups-primary" onClick={submit}>{request ? 'Request to join' : 'Join group'}</button></div>
}

function RequestSent() {
  useEffect(() => { const timer = window.setTimeout(() => go('/app/groups/request-accepted'), 3000); return () => window.clearTimeout(timer) }, [])
  return <div className="groups-screen status-screen"><Header title="Request sent" back={() => go('/app/groups')} /><main><span className="status-icon"><Icon name="check" size={36} /></span><h1>Request sent</h1><p>The group leader will review it. We’ll let you know discreetly.</p><button className="groups-primary" onClick={() => go('/app/groups')}>Back to groups</button></main></div>
}

function RequestAccepted() {
  return <div className="groups-screen status-screen accepted"><Header title="Request Accepted" back={() => go('/app/groups')} /><main><span className="status-icon"><Icon name="check" size={42} /></span><h1>You’ve joined Healing after abuse</h1><p>You can now see messages and post in the group.</p><button className="groups-primary" onClick={() => go('/app/groups/healing/chat')}>Go to group</button></main></div>
}

function MemberSheet({ close }: { close: () => void }) { return <><button className="groups-backdrop" onClick={close} aria-label="Close member options" /><section className="member-sheet"><span className="sheet-handle" /><h2>River</h2><p>Member of Healing after abuse</p><button><Icon name="chat" />Send a message request</button><button><Icon name="plus" />Invite to my circle</button><button className="danger"><Icon name="block" />Block</button><button className="danger"><Icon name="report" />Report</button></section></> }
function LeaveSheet({ close }: { close: () => void }) { return <><button className="groups-backdrop" onClick={close} aria-label="Close leave group prompt" /><section className="leave-sheet"><span className="sheet-handle" /><h2>Leave this group?</h2><p>No announcement is posted. Messages you’ve already posted may still be visible to members.</p><button className="groups-primary" onClick={() => go('/app/groups')}>Leave group</button><button className="groups-secondary" onClick={close}>Stay</button></section></> }

function GroupChat() {
  const [member, setMember] = useState(false), [leave, setLeave] = useState(false), [rules, setRules] = useState(false), [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([{ name: 'Amani', text: 'Has anyone tried the safe shelter near CBD? Is it secure?' }, { name: 'River', text: 'I stayed there last week. Extremely safe and helpful staff.' }, { name: 'Grace', label: 'Leader', text: 'Please remember not to share the exact street address here for security.' }])
  const send = () => { if (!draft.trim()) return; setMessages((list) => [...list, { name: 'Me', text: draft.trim() }]); setDraft('') }
  return <div className="groups-screen group-chat"><Header title="Healing after abuse" back={() => setLeave(true)} menu={() => setLeave(true)} /><button className="rules-toggle" onClick={() => setRules((open) => !open)}>Group rules <span>{rules ? '⌃' : '⌄'}</span></button>{rules && <div className="rules-compact">Be kind. Keep shared information private. Never post personal contact details.</div>}<main className="group-messages">{messages.map((message, index) => <article className={message.name === 'Me' ? 'mine' : ''} key={`${message.name}-${index}`}><button type="button" onClick={() => message.name === 'River' && setMember(true)}>{message.name}</button>{message.label && <small>{message.label}</small>}<p>{message.text}</p>{message.name === 'Me' && <span>Sending</span>}</article>)}</main><form className="group-composer" onSubmit={(event) => { event.preventDefault(); send() }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message…" /><button aria-label="Send"><Icon name="send" /></button></form>{member && <MemberSheet close={() => setMember(false)} />}{leave && <LeaveSheet close={() => setLeave(false)} />}</div>
}

export default function Groups() {
  const path = window.location.pathname
  if (path.endsWith('/request-sent')) return <RequestSent />
  if (path.endsWith('/request-accepted')) return <RequestAccepted />
  if (path.endsWith('/chat')) return <GroupChat />
  if (path !== '/app/groups') return <Details />
  return <Directory />
}
