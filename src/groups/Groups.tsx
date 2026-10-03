import { useCallback, useEffect, useMemo, useState } from 'react'
import { createAuthenticatedApi, publicApi } from '../api/client'
import type { GroupJoin, RoomRecipients, SupportGroup } from '../api/types'
import { ChatNotice, PinUnlock } from '../messaging/ChatParts'
import { conversationIdFor } from '../messaging/chat'
import { useMessenger } from '../messaging/useMessenger'
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
const groupIdFromPath = () => window.location.pathname.split('/')[3] ?? ''
const accountApi = (identity: { withPrivateKey: <T>(operation: (key: Uint8Array) => T) => T }) =>
  createAuthenticatedApi(identity.withPrivateKey)

function Header({ title, back, menu }: { title: string; back: () => void; menu?: () => void }) {
  return <header className="groups-header"><button className="groups-back" type="button" onClick={back} aria-label="Go back"><Icon name="back" size={18} /></button><strong>{title}</strong>{menu && <button className="groups-menu-button" type="button" onClick={menu} aria-label="Group options"><Icon name="menu" /></button>}<button className="groups-exit" type="button" onClick={() => window.location.replace('/')}><Icon name="exit" size={17} />Exit</button></header>
}
function Nav() { return <nav className="groups-nav"><a className="active" href={href('/app')}><Icon name="home" /><span>Home</span></a><a href={href('/app/messages')}><Icon name="chat" /><span>Messages</span></a><a href="/app/wallet"><Icon name="wallet" /><span>Wallet</span></a><a href={href('/app/settings')}><Icon name="settings" /><span>Settings</span></a></nav> }

function useGroups() {
  const [groups, setGroups] = useState<SupportGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    publicApi.listSupportGroups(controller.signal).then(setGroups).catch((caught) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Could not load support groups.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  return { groups, loading, error }
}

function Directory() {
  const { groups, loading, error } = useGroups()
  return <div className="groups-screen"><Header title="Talk to someone" back={() => go('/app')} /><div className="groups-tabs"><button onClick={() => go('/app/counselors')}>One-to-one</button><button className="active">Groups</button></div><main className="group-list">{loading && <p>Loading groups…</p>}{error && <p role="alert">{error}</p>}{groups.map((group) => <article className="group-card" key={group.id}><h2>{group.title || 'Support group'}</h2><p>{group.description}</p><span>Led by {group.leader_name || 'a moderator'} {group.organization_name && <strong><Icon name="check" size={16} />Verified by {group.organization_name}</strong>}</span><button type="button" onClick={() => go(`/app/groups/${group.id}`)}>{group.access === 'open' ? 'Open to join' : 'View group'}</button></article>)}</main><button className="groups-help" onClick={() => window.location.assign('/onboarding/emergency')}>Need help now?</button><Nav /></div>
}

function Details() {
  const groupId = groupIdFromPath()
  const { groups } = useGroups()
  const group = groups.find((item) => item.id === groupId)
  const chat = useMessenger('survivor', false)
  const [membership, setMembership] = useState<GroupJoin | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (chat.state.kind !== 'ready') return
    accountApi(chat.state.identity).groupMembership(groupId).then(setMembership).catch(() => setMembership(null))
  }, [chat.state, groupId])
  const join = async () => {
    if (chat.state.kind !== 'ready') return
    setBusy(true); setError('')
    try {
      const result = await accountApi(chat.state.identity).joinSupportGroup(groupId)
      setMembership(result)
      go(result.status === 'approved' ? `/app/groups/${groupId}/chat` : `/app/groups/${groupId}/request-sent`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not join this group.')
    } finally { setBusy(false) }
  }
  if (chat.state.kind === 'locked') return <div className="groups-screen details-screen"><Header title={group?.title || 'Support group'} back={() => go('/app/groups')} /><PinUnlock title="Unlock your account" text="Enter your PIN to join this private group." unlock={chat.unlock} /></div>
  if (chat.state.kind === 'no-account') return <div className="groups-screen details-screen"><Header title={group?.title || 'Support group'} back={() => go('/app/groups')} /><ChatNotice action={{ label: 'Create an account', run: () => go('/onboarding/create') }}>An account is needed to keep private group membership.</ChatNotice></div>
  return <div className="groups-screen details-screen"><Header title={group?.title || 'Support group'} back={() => go('/app/groups')} /><main><section className="group-summary"><p>{group?.description || 'A private support space.'}</p><span>Led by {group?.leader_name || 'a moderator'} {group?.organization_name && <strong><Icon name="check" size={16} />Verified by {group.organization_name}</strong>}</span></section><section className="rules"><h2>Group rules</h2><ol><li>Be kind.</li><li>Keep what’s shared here private.</li><li>No sharing personal contact details.</li><li>The moderator can remove messages.</li></ol></section><section className="visibility"><h3>What others in this group see</h3><div><span>• Your nickname</span><span><Icon name="chat" size={18} />Messages</span></div><p>You can leave anytime. No announcement is posted when you leave.</p></section>{error && <p role="alert">{error}</p>}</main><button className="groups-primary" disabled={busy || chat.state.kind !== 'ready'} onClick={() => membership?.status === 'approved' ? go(`/app/groups/${groupId}/chat`) : void join()}>{membership?.status === 'approved' ? 'Go to group' : busy ? 'Joining…' : group?.access === 'open' ? 'Join group' : 'Request to join'}</button></div>
}

function RequestSent() {
  const groupId = groupIdFromPath()
  const chat = useMessenger('survivor', false)
  const [checking, setChecking] = useState(false)
  const check = async () => {
    if (chat.state.kind !== 'ready') return
    setChecking(true)
    try {
      const result = await accountApi(chat.state.identity).groupMembership(groupId)
      if (result.status === 'approved') go(`/app/groups/${groupId}/request-accepted`)
    } finally { setChecking(false) }
  }
  return <div className="groups-screen status-screen"><Header title="Request sent" back={() => go('/app/groups')} /><main><span className="status-icon"><Icon name="check" size={36} /></span><h1>Request sent</h1><p>The group leader will review it. We’ll let you know discreetly.</p><button className="groups-primary" disabled={checking} onClick={() => void check()}>{checking ? 'Checking…' : 'Check again'}</button><button className="groups-primary" onClick={() => go('/app/groups')}>Back to groups</button></main></div>
}

function RequestAccepted() {
  const groupId = groupIdFromPath()
  return <div className="groups-screen status-screen accepted"><Header title="Request accepted" back={() => go('/app/groups')} /><main><span className="status-icon"><Icon name="check" size={44} /></span><h1>You’ve joined the group</h1><p>You can now see messages and post in the group.</p><button className="groups-primary" onClick={() => go(`/app/groups/${groupId}/chat`)}>Go to group</button></main></div>
}

function GroupChat() {
  const groupId = groupIdFromPath()
  const { groups } = useGroups()
  const group = groups.find((item) => item.id === groupId)
  const chat = useMessenger('survivor', false)
  const [routing, setRouting] = useState<RoomRecipients | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [rules, setRules] = useState(false)
  const loadRouting = useCallback(async () => {
    if (chat.state.kind !== 'ready') return
    const api = accountApi(chat.state.identity)
    try { setRouting(await api.supportGroupRecipients(groupId)) }
    catch (caught) {
      if (caught instanceof Error && caught.message.includes('reissued')) {
        await api.refreshSupportGroupRoutingKey(groupId)
        setRouting(await api.supportGroupRecipients(groupId))
      } else throw caught
    }
  }, [chat.state, groupId])
  useEffect(() => {
    if (chat.state.kind !== 'ready') return
    const timer = window.setTimeout(() => void loadRouting().catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not open this group.')), 0)
    return () => window.clearTimeout(timer)
  }, [chat.state.kind, loadRouting])
  const messages = useMemo(() => chat.events.filter((event) => event.type === 'group.message' && event.conversationId === routing?.room_id), [chat.events, routing])
  const send = async () => {
    const text = draft.trim()
    if (!text || !routing || !chat.messenger) return
    setDraft(''); setError('')
    try { await chat.messenger.sendEvent(routing.recipients, 'group.message', routing.room_id, { text, from_name: chat.state.kind === 'ready' ? chat.state.identity.nickname : 'Member', group_id: groupId, group_name: group?.title || 'Support group' }) }
    catch (caught) { setDraft(text); setError(caught instanceof Error ? caught.message : 'Message could not be sent.') }
  }
  const leave = async () => {
    if (chat.state.kind !== 'ready') return
    await accountApi(chat.state.identity).leaveSupportGroup(groupId)
    go('/app/groups')
  }
  const requestMessage = async (peer: string, peerName: string) => {
    if (chat.state.kind !== 'ready' || !chat.messenger) return
    await chat.messenger.sendEvent([peer], 'message.request', conversationIdFor(chat.state.identity.publicKey, peer), {
      from_name: chat.state.identity.nickname,
      group_id: groupId,
      group_name: group?.title || 'Support group',
      text: `Hi, I saw your post in ${group?.title || 'the group'} and would like to talk privately.`,
    })
    setNotice(`Message request sent to ${peerName}.`)
  }
  let body: React.ReactNode
  if (chat.state.kind === 'locked') body = <PinUnlock title="Unlock this group" text="Enter your PIN to decrypt group messages." unlock={chat.unlock} />
  else if (chat.state.kind !== 'ready') body = <p className="chat-empty">Connecting securely…</p>
  else body = <main className="group-messages">{messages.length === 0 && <p>No messages on this phone yet.</p>}{messages.map((message) => { const peerName=message.fromMe?'Me':typeof message.body.from_name==='string'?message.body.from_name:`Member ${message.sender.slice(-4)}`;return <article className={message.fromMe ? 'mine' : ''} key={message.id}><button type="button" disabled={message.fromMe} onClick={() => void requestMessage(message.sender,peerName)}>{peerName}</button><p>{String(message.body.text || '')}</p><span>{message.fromMe ? 'Sent' : 'Tap the name to request a private chat'}</span></article>})}</main>
  return <div className="groups-screen group-chat"><Header title={group?.title || 'Support group'} back={() => go('/app/groups')} menu={() => void leave()} /><button className="rules-toggle" onClick={() => setRules((open) => !open)}>Group rules <span>{rules ? '⌃' : '⌄'}</span></button>{rules && <div className="rules-compact">Be kind. Keep shared information private. Never post personal contact details.</div>}{body}{notice&&<small>{notice}</small>}{error && <small role="alert">{error}</small>}{chat.state.kind === 'ready' && <form className="group-composer" onSubmit={(event) => { event.preventDefault(); void send() }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={routing?.recipients.length ? 'Write a message…' : 'Waiting for another member…'} /><button disabled={!draft.trim() || !routing?.recipients.length} aria-label="Send"><Icon name="send" /></button></form>}</div>
}

export default function Groups() {
  const path = window.location.pathname
  if (path.endsWith('/request-sent')) return <RequestSent />
  if (path.endsWith('/request-accepted')) return <RequestAccepted />
  if (path.endsWith('/chat')) return <GroupChat />
  if (path !== '/app/groups') return <Details />
  return <Directory />
}
