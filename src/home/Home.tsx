import { useEffect, useState } from 'react'
import './home.css'

type HomeIcon = 'exit' | 'chat' | 'circle' | 'resources' | 'wallet' | 'home' | 'settings' | 'lock' | 'arrow'
type ProtectedFeature = 'circle' | 'wallet' | null

const paths: Record<HomeIcon, React.ReactNode> = {
  exit: <><path d="M10 5H5v14h5" /><path d="m14 8 4 4-4 4M8 12h10" /></>,
  chat: <path d="M20 11.5a8 8 0 0 1-9.1 7.9L5 21l1.6-4A8 8 0 1 1 20 11.5Z" />,
  circle: <><circle cx="9" cy="8" r="3" /><path d="M3 19a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5" /></>,
  resources: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z" /></>,
  wallet: <><path d="M3 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6Z" /><path d="M3 6a3 3 0 0 1 3-3h11v3M15 11h6v5h-6a2 2 0 0 1 0-5Z" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  arrow: <path d="m9 5 7 7-7 7" />,
}

function Icon({ name, size = 24 }: { name: HomeIcon; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const cards: Array<{ icon: HomeIcon; title: string; description: string; protected?: ProtectedFeature }> = [
  { icon: 'chat', title: 'Talk to someone', description: 'Connect with a counselor or peer supporter.' },
  { icon: 'circle', title: 'My circle', description: 'Your closest people.', protected: 'circle' },
  { icon: 'resources', title: 'Find resources', description: 'Legal, medical, shelter.' },
  { icon: 'wallet', title: 'My wallet', description: "Money sent to you. Withdraw when it's safe.", protected: 'wallet' },
]

const sheetTitles = {
  circle: 'To keep your circle, create an account',
  wallet: 'To use your wallet, create an account',
}

function ExitButton() {
  return <button className="home-exit" type="button" onClick={() => window.location.replace('/')}><Icon name="exit" size={19} />Exit</button>
}

function AccountSheet({ feature, close }: { feature: Exclude<ProtectedFeature, null>; close: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && close()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  return <><button className="account-backdrop" type="button" onClick={close} aria-label="Close account prompt" /><section className="account-sheet" role="dialog" aria-modal="true" aria-labelledby="account-sheet-title"><span className="sheet-handle" /><span className="sheet-lock"><Icon name="lock" size={32} /></span><h2 id="account-sheet-title">{sheetTitles[feature]}</h2><p>It’s just a nickname and a PIN. No name, phone number or email.</p><button className="sheet-primary" type="button" onClick={() => window.location.assign('/onboarding/create')}>Create an account</button><button className="sheet-later" type="button" onClick={close}>Not now</button></section></>
}

export default function Home() {
  const guest = new URLSearchParams(window.location.search).get('mode') === 'guest'
  const [protectedFeature, setProtectedFeature] = useState<ProtectedFeature>(null)

  const selectCard = (feature?: ProtectedFeature, title?: string) => {
    if (title === 'Talk to someone') {
      window.location.assign(`/app/counselors${guest ? '?mode=guest' : ''}`)
    } else if (title === 'My circle' && !guest) {
      window.location.assign('/app/circle')
    } else if (title === 'Find resources') {
      window.location.assign(`/app/resources${guest ? '?mode=guest' : ''}`)
    } else if (guest && feature) {
      setProtectedFeature(feature)
    }
  }

  return <div className="home-screen"><header className="home-header"><strong>Resilience</strong><ExitButton /></header><section className="home-intro">{guest ? <><p>You’re using Resilience without an account.<br />Everything is cleared when you leave.</p><button type="button" onClick={() => window.location.assign('/onboarding/create')}>Create an account</button></> : <p>You’re in control.</p>}</section><main className="home-cards">{cards.map((card) => { const locked = guest && Boolean(card.protected); return <button className={`home-card ${locked ? 'locked' : ''}`} type="button" key={card.title} onClick={() => selectCard(card.protected, card.title)}><span className="home-card-icon"><Icon name={locked ? 'lock' : card.icon} /></span><span className="home-card-copy"><strong>{card.title}</strong><span>{card.description}</span>{locked && <small>Needs an account</small>}</span>{guest && <Icon name="arrow" size={19} />}</button>})}</main><button className="urgent-help" type="button" onClick={() => window.location.assign('/onboarding/emergency')}>Need help now?</button><nav className="bottom-nav" aria-label="App navigation"><a className="active" href="/app" aria-current="page"><Icon name="home" /><span>Home</span></a><button type="button"><Icon name="chat" /><span>Messages</span></button><button type="button" onClick={() => guest && setProtectedFeature('wallet')}><Icon name="wallet" /><span>Wallet</span></button><button type="button"><Icon name="settings" /><span>Settings</span></button></nav>{protectedFeature && <AccountSheet feature={protectedFeature} close={() => setProtectedFeature(null)} />}</div>
}
