import { useEffect, useRef, useState } from 'react'
import { faker } from '@faker-js/faker/locale/en'
import './onboarding.css'

type Screen = 'safety' | 'emergency' | 'privacy' | 'choice' | 'create' | 'restore'
type IconName = 'shield' | 'exit' | 'heart' | 'alert' | 'phone' | 'user' | 'device' | 'trash' | 'hidden' | 'account' | 'arrow' | 'refresh' | 'back'

const routeFor: Record<Screen, string> = {
  safety: '/onboarding',
  emergency: '/onboarding/emergency',
  privacy: '/onboarding/privacy',
  choice: '/onboarding/continue',
  create: '/onboarding/create',
  restore: '/onboarding/restore',
}

const screenForPath = (): Screen => {
  const match = Object.entries(routeFor).find(([, route]) => route === window.location.pathname)
  return (match?.[0] as Screen | undefined) ?? 'safety'
}

const iconPaths: Record<IconName, React.ReactNode> = {
  shield: <path d="M12 3 5.5 6v5.2c0 4.2 2.7 8 6.5 9.8 3.8-1.8 6.5-5.6 6.5-9.8V6L12 3Z" />,
  exit: <><path d="M10 5H5v14h5" /><path d="m14 8 4 4-4 4M8 12h10" /></>,
  heart: <path d="M12 20s-7-4.2-7-9a4 4 0 0 1 7-2.4A4 4 0 0 1 19 11c0 4.8-7 9-7 9Z" />,
  alert: <><path d="M12 3 3.8 7.7v8.6L12 21l8.2-4.7V7.7L12 3Z" /><path d="M12 8v5M12 16h.01" /></>,
  phone: <path d="M7 3h3l1.2 5-2 1.2a15 15 0 0 0 5.6 5.6l1.2-2 5 1.2v3c0 2-1 4-4 4C9.3 21 3 14.7 3 7c0-3 2-4 4-4Z" />,
  user: <><circle cx="12" cy="8" r="3" /><path d="M6 20v-2a6 6 0 0 1 12 0v2" /></>,
  device: <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 17h2" /></>,
  trash: <><path d="M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14" /></>,
  hidden: <><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9 7 9 7a17 17 0 0 1-2.1 3.1M6.2 6.2C4.1 7.7 3 12 3 12s3.5 7 9 7c1 0 1.9-.2 2.7-.5" /></>,
  account: <><circle cx="10" cy="9" r="3" /><path d="M4 19a6 6 0 0 1 12 0M18 8v6M15 11h6" /></>,
  arrow: <path d="m9 5 7 7-7 7" />,
  refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5M6 9a7 7 0 0 1 12-2l2 5M18 15a7 7 0 0 1-12 2l-2-5" /></>,
  back: <path d="m15 18-6-6 6-6" />,
}

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg className="ob-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>
}

function ExitButton() {
  return <button className="ob-exit" type="button" onClick={() => window.location.replace('/')}><Icon name="exit" size={17} />Exit</button>
}

function Header({ title, back }: { title?: string; back?: () => void }) {
  return (
    <header className="ob-header">
      <div className="ob-header-start">
        {back && <button className="ob-back" type="button" onClick={back} aria-label="Go back"><Icon name="back" size={18} /></button>}
        {title && <strong>{title}</strong>}
      </div>
      <ExitButton />
    </header>
  )
}

function Safety({ go }: { go: (screen: Screen) => void }) {
  return <div className="ob-screen"><Header /><div className="ob-center-icon lilac"><Icon name="shield" size={30} /></div><div className="ob-copy ob-copy-bottom"><h1>Are you safe right now?</h1><p>If you are not safe, we can help you find emergency contacts immediately. You can always exit quickly.</p></div><div className="ob-actions"><button className="ob-primary" onClick={() => go('privacy')}>Yes, I’m safe to continue</button><button className="ob-secondary" onClick={() => go('emergency')}>No, I need help now</button></div></div>
}

function Emergency({ go }: { go: (screen: Screen) => void }) {
  return <div className="ob-screen"><Header /><div className="ob-main-centered"><div className="ob-title-with-icon danger"><Icon name="alert" size={22} /><h1>Emergency Help</h1></div><p>Choose a hotline to call. These services offer immediate, confidential support.</p><a className="hotline" href="tel:1195"><span><small>GBV Hotline</small><strong className="danger-text">1195</strong></span><span className="ob-round-icon"><Icon name="phone" /></span></a><a className="hotline" href="tel:999"><span><small>Police</small><strong>999</strong></span><span className="ob-round-icon"><Icon name="phone" /></span></a><strong className="free-calls">These calls are free.</strong></div><button className="ob-text-action" onClick={() => go('privacy')}>Continue to the app when you’re ready</button></div>
}

const promises: Array<[IconName, string]> = [
  ['user', "You don't need your name, phone number or email."],
  ['device', 'What you read here stays on this phone. Messages are seen only by the people you send them to.'],
  ['exit', 'Tap Exit at any time to hide this app instantly.'],
  ['trash', 'If you stop using the app for 2 minutes, it hides itself.'],
]

function Privacy({ go }: { go: (screen: Screen) => void }) {
  return <div className="ob-screen"><Header /><div className="ob-center-icon white"><Icon name="heart" size={31} /></div><div className="ob-copy ob-copy-centered"><h1>How Resilience keeps you safe</h1></div><div className="promise-list">{promises.map(([icon, text]) => <div className="promise" key={text}><span className="ob-round-icon"><Icon name={icon} /></span><p>{text}</p></div>)}</div><div className="ob-actions single"><button className="ob-primary" onClick={() => go('choice')}>Continue</button></div></div>
}

function Choice({ go }: { go: (screen: Screen) => void }) {
  return <div className="ob-screen"><Header title="Resilience" /><div className="ob-center-icon lilac"><Icon name="heart" size={31} /></div><div className="ob-copy ob-copy-centered"><h1>How would you like to continue?</h1><p>You don’t need an account to get help. Create one only if you want to save things.</p></div><div className="choice-list"><button className="choice featured" type="button"><span className="ob-round-icon"><Icon name="hidden" /></span><span><strong>Continue without an account</strong><small>Nothing is saved. Everything is cleared when you exit or the app hides itself.</small></span><Icon name="arrow" size={18} /></button><button className="choice" type="button" onClick={() => go('create')}><span className="ob-round-icon"><Icon name="account" /></span><span><strong>Create an account</strong><small>Just a nickname and a PIN. Keep your circle, wallet, records and messages.</small></span><Icon name="arrow" size={18} /></button></div><button className="ob-text-action" onClick={() => go('restore')}>I already have an account</button></div>
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()

const generateNickname = () => {
  const adjective = faker.word.adjective({
    length: { min: 4, max: 8 },
    strategy: 'closest',
  })
  const noun = faker.word.noun({
    length: { min: 4, max: 8 },
    strategy: 'closest',
  })

  return `${capitalize(adjective)} ${capitalize(noun)}`
}

function CreateAccount() {
  const [nickname, setNickname] = useState(generateNickname)
  const [pin, setPin] = useState('')
  const shuffleName = () => {
    let nextNickname = generateNickname()

    for (let attempt = 0; attempt < 3 && nextNickname === nickname; attempt += 1) {
      nextNickname = generateNickname()
    }

    setNickname(nextNickname)
  }
  const enterDigit = (digit: string) => setPin((current) => current.length < 4 ? current + digit : current)
  return <div className="ob-screen"><Header /><div className="account-content"><h1>Create your account</h1><p>Pick a nickname and a 4-digit PIN. This is how you’ll get back in.</p><label>Choose a nickname</label><div className="nickname-row"><input value={nickname} onChange={(event) => setNickname(event.target.value)} aria-label="Nickname" /><button type="button" onClick={shuffleName} aria-label="Suggest another nickname"><Icon name="refresh" /></button></div><small>Don’t use your real name.</small><h2>Create a 4-digit PIN</h2><div className="pin-dots" aria-label={`${pin.length} of 4 PIN digits entered`}>{[0, 1, 2, 3].map((index) => <span className={index < pin.length ? 'filled' : ''} key={index} />)}</div><div className="keypad">{['1','2','3','4','5','6','7','8','9'].map((digit) => <button type="button" onClick={() => enterDigit(digit)} key={digit}>{digit}</button>)}<span /><button type="button" onClick={() => enterDigit('0')}>0</button><button type="button" onClick={() => setPin((current) => current.slice(0, -1))} aria-label="Delete last digit">⌫</button></div></div><div className="ob-actions single"><button className="ob-primary" disabled={pin.length !== 4 || !nickname.trim()}>Continue</button></div></div>
}

function Restore({ go }: { go: (screen: Screen) => void }) {
  const [words, setWords] = useState(Array(12).fill(''))
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const updateWord = (index: number, value: string) => {
    const next = [...words]
    next[index] = value.replace(/\s/g, '').toLowerCase()
    setWords(next)
  }
  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').trim().split(/\s+/).slice(0, 12)
    if (pasted.length <= 1) return
    event.preventDefault()
    setWords([...pasted, ...Array(12 - pasted.length).fill('')])
  }
  return <div className="ob-screen"><Header title="Restore your account" back={() => go('choice')} /><div className="restore-content"><h1>Enter your 12 backup words</h1><div className="word-grid">{words.map((word, index) => <label key={index}><span>{index + 1}</span><input ref={(element) => { refs.current[index] = element }} value={word} onChange={(event) => updateWord(index, event.target.value)} onPaste={handlePaste} aria-label={`Backup word ${index + 1}`} autoComplete="off" /></label>)}</div><p>Enter them in the same order you wrote them down.</p><button className="ob-primary" disabled={words.some((word) => !word)}>Restore account</button><button className="ob-text-action" onClick={() => go('safety')}>I don’t have backup words: start fresh</button></div></div>
}

export default function Onboarding() {
  const [screen, setScreen] = useState<Screen>(screenForPath)

  useEffect(() => {
    const handleBack = () => setScreen(screenForPath())
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])

  const go = (next: Screen) => {
    window.history.pushState({}, '', routeFor[next])
    setScreen(next)
    window.scrollTo(0, 0)
  }

  if (screen === 'emergency') return <Emergency go={go} />
  if (screen === 'privacy') return <Privacy go={go} />
  if (screen === 'choice') return <Choice go={go} />
  if (screen === 'create') return <CreateAccount />
  if (screen === 'restore') return <Restore go={go} />
  return <Safety go={go} />
}
