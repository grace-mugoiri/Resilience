import { useMemo, useState } from 'react'
import './support.css'

type IconName = 'back' | 'exit' | 'search' | 'verified' | 'info' | 'more' | 'send' | 'home' | 'chat' | 'wallet' | 'settings' | 'block' | 'report' | 'trash'

const paths: Record<IconName, React.ReactNode> = {
  back: <path d="m15 18-6-6 6-6" />,
  exit: <><path d="M10 5H5v14h5" /><path d="m14 8 4 4-4 4M8 12h10" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  verified: <><path d="m9 12 2 2 4-5" /><circle cx="12" cy="12" r="8" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  more: <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>,
  send: <><path d="m3 11 18-8-8 18-2-8-8-2Z" /><path d="m11 13 4-4" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>,
  chat: <path d="M20 11.5a8 8 0 0 1-9.1 7.9L5 21l1.6-4A8 8 0 1 1 20 11.5Z" />,
  wallet: <><path d="M3 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6Z" /><path d="M15 11h6v5h-6a2 2 0 0 1 0-5Z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  block: <><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /></>,
  report: <><path d="M6 3h9l3 3v15H6V3Z" /><path d="M14 3v4h4M9 11h6M9 15h6" /></>,
  trash: <><path d="M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14" /></>,
}

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const withMode = (path: string, guest: boolean) => `${path}${guest ? '?mode=guest' : ''}`
const go = (path: string, guest: boolean) => window.location.assign(withMode(path, guest))

function ExitButton() {
  return <button className="support-exit" type="button" onClick={() => window.location.replace('/')}><Icon name="exit" size={17} />Exit</button>
}

function Header({ title, guest, back, chatMenu }: { title: string; guest: boolean; back: () => void; chatMenu?: () => void }) {
  return <header className="support-header" data-mode={guest ? 'guest' : 'account'}><button className="support-back" type="button" onClick={back} aria-label="Go back"><Icon name="back" size={18} /></button><strong>{title}</strong>{title === 'Grace' && <span className="verified"><Icon name="verified" size={17} /></span>}{chatMenu && <button className="more-button" type="button" onClick={chatMenu} aria-label="Open conversation menu"><Icon name="more" size={19} /></button>}<ExitButton /></header>
}

function BottomNav({ guest, active = 'home' }: { guest: boolean; active?: 'home' | 'messages' }) {
  return <nav className="support-nav" aria-label="App navigation"><a className={active === 'home' ? 'active' : ''} href={withMode('/app', guest)}><Icon name="home" /><span>Home</span></a><button className={active === 'messages' ? 'active' : ''} type="button"><Icon name="chat" /><span>Messages</span></button><button type="button"><Icon name="wallet" /><span>Wallet</span></button><button type="button"><Icon name="settings" /><span>Settings</span></button></nav>
}

const counselors = [
  { name: 'Counselor Grace', state: 'Verified by FIDA Kenya', tone: 'verified', tags: ['Trauma support', 'Legal aid'], reply: 'Usually replies within a few hours' },
  { name: 'Amani Support', state: 'Verification expired', tone: 'expired', tags: ['Trauma support'], reply: 'Usually replies within 1 day' },
  { name: 'Salma H.', state: 'Verification removed', tone: 'removed', tags: ['Health', 'Shelter'], reply: 'Usually replies in 30 mins', note: 'This counselor can no longer be verified. Be careful sharing personal details.' },
  { name: 'Peer Supporter Joy', state: 'Not verified', tone: 'neutral', tags: ['Trauma support', 'Health'], reply: 'Usually replies within a day' },
]

function Directory({ guest }: { guest: boolean }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Legal aid')
  const results = useMemo(() => counselors.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()) && (filter === 'All' || item.tags.includes(filter))), [filter, search])
  return <div className="support-screen"><Header title="Talk to someone" guest={guest} back={() => go('/app', guest)} /><div className="directory-tabs"><button className="active">One-to-one</button><button type="button" onClick={() => go('/app/groups', guest)}>Groups</button></div><label className="counselor-search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search counselors…" /></label><div className="filter-row">{['Legal aid', 'Trauma support', 'Health', 'Shelter', 'All'].map((tag) => <button className={filter === tag ? 'active' : ''} type="button" onClick={() => setFilter(tag)} key={tag}>{tag}</button>)}</div><main className="counselor-list">{results.map((person) => <button className="counselor-card" type="button" onClick={() => person.name === 'Counselor Grace' && go('/app/counselors/grace', guest)} key={person.name}><span className="counselor-name">{person.name}</span><span className={`verification ${person.tone}`}><Icon name={person.tone === 'neutral' ? 'info' : 'verified'} size={15} />{person.state}</span><span className="counselor-tags">{person.tags.map((tag) => <small key={tag}>{tag}</small>)}</span><span className="reply-time">{person.reply}</span>{person.note && <span className="verification-note">{person.note}</span>}</button>)}</main><BottomNav guest={guest} /></div>
}

function Profile({ guest }: { guest: boolean }) {
  return <div className="support-screen"><Header title="Grace" guest={guest} back={() => go('/app/counselors', guest)} /><main className="profile"><span className="profile-avatar" aria-hidden="true">G</span><h1>Grace</h1><p>Usually replies within a few hours</p><div className="profile-tags"><span>Trauma support</span><span>Legal aid</span></div><section className="verification-card"><strong><Icon name="verified" size={20} />Verified by FIDA Kenya</strong><p>Verification expires: October 2026</p><button type="button">How verification works <span>⌄</span></button></section></main><button className="support-primary profile-start" type="button" onClick={() => go('/app/chat/grace', guest)}>Start a private conversation</button><BottomNav guest={guest} /></div>
}

type Message = { from: 'them' | 'me'; text: string; status?: string }
const accountMessages: Message[] = [
  { from: 'them', text: "Hello, thank you for reaching out. Take your time. I'm here to listen." },
  { from: 'me', text: 'I need some advice on emergency shelter options.', status: 'Sent' },
  { from: 'me', text: 'Is there a safe place near CBD where I can stay tonight?', status: 'Sending' },
  { from: 'them', text: 'Let me check the available shelter spaces for you right now.' },
  { from: 'me', text: 'Thank you. I am waiting.', status: 'Waiting for connection' },
  { from: 'me', text: 'Will it be confidential?', status: 'Failed: tap to retry' },
]
const guestMessages: Message[] = [
  { from: 'them', text: 'Hello, welcome to Resilience. How can I help you today?' },
  { from: 'me', text: 'I need someone to talk to', status: 'Sent' },
  { from: 'them', text: "I'm here for you. You're not alone." },
]

function KeepConversation({ close, leave }: { close: () => void; leave: () => void }) {
  return <><button className="support-backdrop" type="button" onClick={close} aria-label="Close prompt" /><section className="keep-sheet" role="dialog" aria-modal="true"><span className="sheet-handle" /><span className="keep-icon"><Icon name="chat" size={30} /></span><h2>Keep this conversation?</h2><p>If you create an account, this conversation will be saved. Without an account, it will be cleared when you leave.</p><button className="support-primary" type="button" onClick={() => window.location.assign('/onboarding/create')}>Create an account to keep it</button><button className="support-secondary" type="button" onClick={leave}>Leave and clear</button><button className="support-link" type="button" onClick={close}>Stay</button></section></>
}

function ChatMenu({ close, report, clear }: { close: () => void; report: () => void; clear: () => void }) {
  return <><button className="chat-menu-backdrop" type="button" onClick={close} aria-label="Close conversation menu" /><div className="chat-menu" role="menu"><button className="danger" type="button"><Icon name="block" size={18} />Block</button><button type="button" onClick={report}><Icon name="report" size={18} />Report</button><button type="button" onClick={clear}><Icon name="trash" size={18} />Clear this conversation<br />from my phone</button></div></>
}

function Chat({ guest }: { guest: boolean }) {
  const [messages, setMessages] = useState(guest ? guestMessages : accountMessages)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState(false)
  const [keepPrompt, setKeepPrompt] = useState(false)
  const back = () => guest ? setKeepPrompt(true) : go('/app/counselors/grace', false)
  const send = () => { if (!draft.trim()) return; setMessages((current) => [...current, { from: 'me', text: draft.trim(), status: navigator.onLine ? 'Sent' : 'Waiting for connection' }]); setDraft('') }
  return <div className="support-screen chat-screen"><Header title="Grace" guest={guest} back={back} chatMenu={() => setMenu((open) => !open)} />{guest ? <div className="chat-notice">This conversation is cleared when you leave.<button onClick={() => window.location.assign('/onboarding/create')}>Create an account to keep it</button></div> : !navigator.onLine && <div className="chat-notice">You’re offline. Messages will send when you’re connected.</div>}<main className="messages">{messages.map((message, index) => <div className={`message-row ${message.from}`} key={`${message.text}-${index}`}><p>{message.text}</p>{message.status && <small className={message.status.startsWith('Failed') ? 'failed' : ''}>{message.status}</small>}</div>)}</main><form className="composer" onSubmit={(event) => { event.preventDefault(); send() }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={guest ? 'Type a message…' : 'Write a message…'} aria-label="Message" /><button type="submit" aria-label="Send message"><Icon name="send" size={20} /></button></form><BottomNav guest={guest} active="messages" />{menu && <ChatMenu close={() => setMenu(false)} report={() => go('/app/report', guest)} clear={() => { setMessages([]); setMenu(false) }} />}{keepPrompt && <KeepConversation close={() => setKeepPrompt(false)} leave={() => go('/app', true)} />}</div>
}

const reasons = ['Harassment', 'Asking for personal details', 'Pretending to be someone else', 'Spam', 'Something else']

function Report({ guest }: { guest: boolean }) {
  const [reason, setReason] = useState('Asking for personal details')
  const [attach, setAttach] = useState(false)
  return <div className="support-screen report-screen"><Header title="Report" guest={guest} back={() => go('/app/chat/grace', guest)} /><main className="report-content"><h2>Step 1: Choose a reason</h2><div className="reason-list">{reasons.map((item) => <label className={reason === item ? 'selected' : ''} key={item}><input type="radio" name="reason" value={item} checked={reason === item} onChange={() => setReason(item)} /><span />{item}</label>)}</div><h2>Step 2: Attach this message</h2><label className="share-toggle"><strong>Share last 5 messages</strong><input type="checkbox" checked={attach} onChange={(event) => setAttach(event.target.checked)} /><span /></label><p>The group leader will see only what you choose to share.</p></main><button className="support-primary send-report" type="button">Send report</button></div>
}

export default function Support() {
  const guest = new URLSearchParams(window.location.search).get('mode') === 'guest'
  const path = window.location.pathname
  if (path === '/app/counselors/grace') return <Profile guest={guest} />
  if (path === '/app/chat/grace') return <Chat guest={guest} />
  if (path === '/app/report') return <Report guest={guest} />
  return <Directory guest={guest} />
}
