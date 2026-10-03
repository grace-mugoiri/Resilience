import { useState } from 'react'
import { conversationsOf } from '../messaging/chat'
import { PinUnlock } from '../messaging/ChatParts'
import { timeLabel } from '../messaging/labels'
import { useMessenger } from '../messaging/useMessenger'
import { chatPath } from '../support/directory'
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
function Nav() { return <nav className="messages-nav"><a href={withMode('/app')}><Icon name="home" /><span>Home</span></a><a className="active" href={withMode('/app/messages')}><Icon name="chat" /><span>Messages</span></a>{guest() ? <a href={withMode('/app')}><Icon name="wallet" /><span>Wallet</span></a> : <a href="/app/wallet"><Icon name="wallet" /><span>Wallet</span></a>}<a href={withMode('/app/settings')}><Icon name="settings" /><span>Settings</span></a></nav> }

type Conversation = { name: string; preview: string; time: string; type: Exclude<Filter, 'All'> | 'Counselor'; unread?: boolean; verified?: boolean; route: string }
function Inbox() {
  const [filter, setFilter] = useState<Filter>('All')
  const chat = useMessenger('survivor', guest())
  const requests = chat.events.filter((event) => event.type === 'message.request' && !sessionStorage.getItem(`message-request-${event.id}`))
  const unresolvedCount = requests.length
  const counselorChats = chat.state.kind === 'ready' && !guest()
    ? conversationsOf(chat.messages).filter((item) => item.orgId).map<Conversation>((item) => ({
      name: item.peerName,
      preview: `${item.last.fromMe ? 'You: ' : ''}${item.last.text}`,
      time: timeLabel(item.last.createdAt),
      type: 'Counselor',
      unread: !item.last.fromMe,
      route: chatPath(item.orgId!, item.peer),
    }))
    : []
  const circleChats = chat.state.kind === 'ready' && !guest()
    ? conversationsOf(chat.messages).filter((item) => !item.orgId).map<Conversation>((item) => ({
      name: item.peerName,
      preview: `${item.last.fromMe ? 'You: ' : ''}${item.last.text}`,
      time: timeLabel(item.last.createdAt),
      type: 'Circle',
      unread: !item.last.fromMe,
      route: `/app/circle/chat/${item.peer}`,
    })) : []
  const groupLatest = new Map<string, (typeof chat.events)[number]>()
  for (const event of chat.events.filter((item) => item.type === 'group.message')) {
    const current = groupLatest.get(event.conversationId)
    if (!current || current.createdAt < event.createdAt) groupLatest.set(event.conversationId, event)
  }
  const groupChats = [...groupLatest.values()].map<Conversation>((event) => ({
    name: typeof event.body.group_name === 'string' ? event.body.group_name : 'Support group',
    preview: `${event.fromMe ? 'You: ' : ''}${String(event.body.text || '')}`,
    time: timeLabel(event.createdAt),
    type: 'Groups',
    unread: !event.fromMe,
    route: typeof event.body.group_id === 'string' ? `/app/groups/${event.body.group_id}/chat` : '/app/groups',
  }))
  const available = guest() ? [] : [...counselorChats, ...circleChats, ...groupChats]
  const shown = filter === 'All' ? available : available.filter((item) => item.type === filter)
  return <div className="messages-screen"><header className="messages-header"><h1>Messages</h1><Exit /></header>{!guest() && <div className="message-filters">{(['All', 'Circle', 'Groups'] as Filter[]).map((item) => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}<button className="requests-tab" onClick={() => go('/app/messages/requests')}>Requests{unresolvedCount > 0 && <span>{unresolvedCount}</span>}</button></div>}<p className="preview-privacy"><Icon name="hidden" size={18} />Message previews are hidden on your lock screen.</p>{chat.state.kind === 'locked' && <PinUnlock title={`Welcome back, ${chat.state.nickname}`} text="Enter your PIN to see your conversations with counselors." unlock={chat.unlock} />}{chat.state.kind === 'error' && <p className="chat-empty">{chat.state.message}</p>}{guest() && <p className="chat-empty">Without an account, a conversation only lasts while it’s open. Create an account to keep your conversations.</p>}<main className="inbox-list">{shown.map((conversation, index) => <button onClick={() => go(conversation.route)} key={`${conversation.name}-${index}`}><span className="inbox-avatar">{conversation.name.charAt(0)}</span><span className="inbox-copy"><strong>{conversation.name}{conversation.verified && <span className="verified-mark">✓</span>}</strong><span>{conversation.preview}</span></span><span className="inbox-meta">{conversation.time}{conversation.unread && <i />}</span></button>)}</main><Nav /></div>
}

function Requests() {
  const chat = useMessenger('survivor', false)
  const [, redraw] = useState(0)
  const requests = chat.events.filter((event) => event.type === 'message.request' && !sessionStorage.getItem(`message-request-${event.id}`))
  const resolve = async (id: string, result: 'accepted' | 'ignored') => {
    const request = requests.find((item) => item.id === id)
    if (!request) return
    if (result === 'accepted' && chat.messenger) await chat.messenger.sendEvent([request.sender], 'message.request.accept', request.conversationId, { request_id: request.id })
    sessionStorage.setItem(`message-request-${id}`, result); redraw((value) => value + 1)
  }
  let body: React.ReactNode
  if (chat.state.kind === 'locked') body = <PinUnlock title="Unlock message requests" text="Enter your PIN to decrypt private requests." unlock={chat.unlock} />
  else body = <main className="request-list">{requests.map((request) => <article key={request.id}><h2>{typeof request.body.from_name === 'string' ? request.body.from_name : `Member ${request.sender.slice(-4)}`}</h2><span>From: {typeof request.body.group_name === 'string' ? request.body.group_name : 'a support group'}</span><p>“{String(request.body.text || 'Would like to talk privately.')}”</p><div><button onClick={() => void resolve(request.id, 'ignored')}>Ignore</button><button onClick={() => void resolve(request.id, 'accepted')}>Accept</button></div></article>)}{requests.length === 0 && <div className="empty-requests"><span><Icon name="chat" size={34} /></span><h2>No message requests</h2><p>New encrypted requests from group members will appear here.</p></div>}</main>
  return <div className="messages-screen request-screen"><header className="messages-header"><button className="messages-back" onClick={() => go('/app/messages')} aria-label="Go back"><Icon name="back" size={18} /></button><h1>Message requests</h1><Exit /></header>{body}<p className="request-privacy">When someone from a group wants to talk, their request appears here. They won’t know if you ignore it.</p></div>
}

export default function Messages() { return window.location.pathname.endsWith('/requests') ? <Requests /> : <Inbox /> }
