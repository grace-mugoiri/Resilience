import { useState } from 'react'
import './messages.css'

type Filter = 'All' | 'Circle' | 'Groups'
type IconName = 'back' | 'exit' | 'home' | 'chat' | 'wallet' | 'settings' | 'hidden'
const icons: Record<IconName, React.ReactNode> = {
  back: <path d="m15 18-6-6 6-6" />,
  exit: <><path d="M10 5H5v14h5" /><path d="m14 8 4 4-4 4M8 12h10" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>,
  chat: <path d="M20 11.5a8 8 0 0 1-9.1 7.9L5 21l1.6-4A8 8 0 1 1 20 11.5Z" />,
  wallet: <><path d="M3 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6Z" /><path d="M15 11h6v5h-6a2 2 0 0 1 0-5Z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  hidden: <><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9 7 9 7a17 17 0 0 1-2.1 3.1M6.2 6.2C4.1 7.7 3 12 3 12s3.5 7 9 7c1 0 1.9-.2 2.7-.5" /></>,
}
function Icon({ name, size = 23 }: { name: IconName; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg> }

const guest = () => new URLSearchParams(window.location.search).get('mode') === 'guest'
const withMode = (path: string) => `${path}${guest() ? `${path.includes('?') ? '&' : '?'}mode=guest` : ''}`
const go = (path: string) => window.location.assign(withMode(path))
function Exit() { return <button className="messages-exit" onClick={() => window.location.replace('/')}><Icon name="exit" size={17} />Exit</button> }
function Nav() { return <nav className="messages-nav"><a href={withMode('/app')}><Icon name="home" /><span>Home</span></a><a className="active" href={withMode('/app/messages')}><Icon name="chat" /><span>Messages</span></a>{guest() ? <a href={withMode('/app')}><Icon name="wallet" /><span>Wallet</span></a> : <a href="/app/wallet"><Icon name="wallet" /><span>Wallet</span></a>}<button><Icon name="settings" /><span>Settings</span></button></nav> }

type Conversation = { name: string; preview: string; time: string; type: Exclude<Filter, 'All'> | 'Counselor'; unread?: boolean; verified?: boolean; route: string }
const conversations: Conversation[] = [
  { name: 'Grace', preview: 'Let me check the available shelter spaces…', time: '2m', type: 'Counselor', unread: true, verified: true, route: '/app/chat/grace' },
  { name: 'River', preview: 'Did you manage to reach the organization?', time: '1h', type: 'Groups', unread: true, route: '/app/groups/healing/chat' },
  { name: 'Healing after abuse', preview: 'Grace: Please remember not to share the exact…', time: '3h', type: 'Groups', route: '/app/groups/healing/chat' },
  { name: 'Healing after abuse', preview: 'Your request was accepted', time: 'Just now', type: 'Groups', route: '/app/groups/healing/chat' },
  { name: 'Amani', preview: 'Thanks for the advice yesterday!', time: 'Yesterday', type: 'Circle', route: '/app/circle/amani' },
  { name: 'Sunrise', preview: 'Thank you for the kind words yesterday.', time: 'Yesterday', type: 'Circle', route: '/app/circle/sunrise' },
]

const requestData = [
  { name: 'Jamie', group: 'Healing after abuse', text: 'Hi there, I saw your post and wanted to share my experience if you’re open to chatting.' },
  { name: 'Taylor', group: 'Healing after abuse', text: 'Hello! I can help guide you to some great resources in the CBD area.' },
]

function Inbox() {
  const [filter, setFilter] = useState<Filter>('All')
  const unresolvedCount = requestData.filter((request) => !sessionStorage.getItem(`message-request-${request.name}`)).length
  const accepted = requestData.filter((request) => sessionStorage.getItem(`message-request-${request.name}`) === 'accepted').map<Conversation>((request) => ({ name: request.name, preview: request.text, time: 'Just now', type: 'Groups', unread: true, route: '/app/messages' }))
  const available = guest() ? conversations.filter((item) => item.name === 'Grace') : [...accepted, ...conversations]
  const shown = filter === 'All' ? available : available.filter((item) => item.type === filter)
  return <div className="messages-screen"><header className="messages-header"><h1>Messages</h1><Exit /></header>{!guest() && <div className="message-filters">{(['All', 'Circle', 'Groups'] as Filter[]).map((item) => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}<button className="requests-tab" onClick={() => go('/app/messages/requests')}>Requests{unresolvedCount > 0 && <span>{unresolvedCount}</span>}</button></div>}<p className="preview-privacy"><Icon name="hidden" size={18} />Message previews are hidden on your lock screen.</p><main className="inbox-list">{shown.map((conversation, index) => <button onClick={() => go(conversation.route)} key={`${conversation.name}-${index}`}><span className="inbox-avatar">{conversation.name.charAt(0)}</span><span className="inbox-copy"><strong>{conversation.name}{conversation.verified && <span className="verified-mark">✓</span>}</strong><span>{conversation.preview}</span></span><span className="inbox-meta">{conversation.time}{conversation.unread && <i />}</span></button>)}</main><Nav /></div>
}

function Requests() {
  const [requests, setRequests] = useState(() => requestData.filter((request) => !sessionStorage.getItem(`message-request-${request.name}`)))
  const resolve = (name: string, result: 'accepted' | 'ignored') => { sessionStorage.setItem(`message-request-${name}`, result); setRequests((current) => current.filter((request) => request.name !== name)) }
  return <div className="messages-screen request-screen"><header className="messages-header"><button className="messages-back" onClick={() => go('/app/messages')} aria-label="Go back"><Icon name="back" size={18} /></button><h1>Message requests</h1><Exit /></header><main className="request-list">{requests.map((request) => <article key={request.name}><h2>{request.name}</h2><span>From: {request.group}</span><p>“{request.text}”</p><div><button onClick={() => resolve(request.name, 'ignored')}>Ignore</button><button onClick={() => resolve(request.name, 'accepted')}>Accept</button></div></article>)}{requests.length === 0 && <div className="empty-requests"><span><Icon name="chat" size={34} /></span><h2>No message requests</h2><p>New requests from group members will appear here.</p></div>}</main><p className="request-privacy">When someone from a group wants to talk, their request appears here. They won’t know if you ignore it.</p></div>
}

export default function Messages() { return window.location.pathname.endsWith('/requests') ? <Requests /> : <Inbox /> }
