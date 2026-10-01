import { lazy, Suspense, useEffect, useState } from 'react'

const isOnboardingRoute = window.location.pathname.startsWith('/onboarding')
const isDonateRoute = window.location.pathname.startsWith('/donate')
const isCounselorOnboardingRoute = window.location.pathname.startsWith('/counselor')
const isMessagesRoute = window.location.pathname.startsWith('/app/messages')
const isSettingsRoute = window.location.pathname.startsWith('/app/settings')
const isRecordsRoute = window.location.pathname.startsWith('/app/records')
const isWalletRoute = window.location.pathname.startsWith('/app/wallet')
const isResourcesRoute = window.location.pathname.startsWith('/app/resources')
const isCircleRoute = window.location.pathname.startsWith('/app/circle')
const isGroupsRoute = window.location.pathname.startsWith('/app/groups')
const isSupportRoute = window.location.pathname.startsWith('/app/counselors') || window.location.pathname.startsWith('/app/chat') || window.location.pathname.startsWith('/app/report')
const isHomeRoute = window.location.pathname.startsWith('/app')
const Onboarding = lazy(() => import('./onboarding/Onboarding'))
const Donate = lazy(() => import('./donate/Donate'))
const CounselorOnboarding = lazy(() => import('./counselor/CounselorOnboarding'))
const Home = lazy(() => import('./home/Home'))
const Support = lazy(() => import('./support/Support'))
const Groups = lazy(() => import('./groups/Groups'))
const Circle = lazy(() => import('./circle/Circle'))
const Resources = lazy(() => import('./resources/Resources'))
const Wallet = lazy(() => import('./wallet/Wallet'))
const Messages = lazy(() => import('./messages/Messages'))
const Settings = lazy(() => import('./settings/Settings'))
const Records = lazy(() => import('./records/Records'))

function Butterfly({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 120 100" aria-hidden="true"><path d="M58 48C44 9 10 4 13 31c2 19 20 29 42 27-21 2-35 15-28 28 8 15 27 2 33-27M62 48C76 9 110 4 107 31c-2 19-20 29-42 27 21 2 35 15 28 28-8 15-27 2-33-27M60 43v38"/><circle cx="60" cy="38" r="4"/></svg>
}

function App() {
  const [online, setOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(
    window.matchMedia('(display-mode: standalone)').matches,
  )

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateStatus)
    window.addEventListener('offline', updateStatus)

    return () => {
      window.removeEventListener('online', updateStatus)
      window.removeEventListener('offline', updateStatus)
    }
  }, [])

  useEffect(() => {
    const saveInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    const handleInstalled = () => {
      setInstallPrompt(null)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', saveInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', saveInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const installApp = async () => {
    if (!installPrompt) return

    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  if (isOnboardingRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <Onboarding />
      </Suspense>
    )
  }

  if (isDonateRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <Donate />
      </Suspense>
    )
  }

  if (isCounselorOnboardingRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <CounselorOnboarding />
      </Suspense>
    )
  }

  if (isMessagesRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <Messages />
      </Suspense>
    )
  }

  if (isSettingsRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <Settings />
      </Suspense>
    )
  }

  if (isRecordsRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <Records />
      </Suspense>
    )
  }

  if (isWalletRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <Wallet />
      </Suspense>
    )
  }

  if (isResourcesRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <Resources />
      </Suspense>
    )
  }

  if (isCircleRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <Circle />
      </Suspense>
    )
  }

  if (isGroupsRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <Groups />
      </Suspense>
    )
  }

  if (isSupportRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <Support />
      </Suspense>
    )
  }

  if (isHomeRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <Home />
      </Suspense>
    )
  }

  const featureItems=[['◌','Private by design','Use a nickname. No real name, phone number or email is required.'],['◯','Supportive conversations','Talk with verified counselors, peers and people you trust.'],['⌁','Resilient access','Essential resources remain available even with limited connectivity.'],['ϟ','Direct support','Receive or send Bitcoin-powered support without a middleman.'],['◎','Your identity, yours','Carry your account safely across devices with backup words.']]
  const steps=[['01','Start safely','A quick safety check puts urgent help first.'],['02','Choose your path','Continue privately as a guest or create an account.'],['03','Talk securely','Connect with a counselor or a trusted support group.'],['04','Find real help','Access legal, medical, shelter and rights resources.']]
  return <main className="app-shell res-landing">
    <nav className="nav res-nav" aria-label="Main navigation"><a className="brand" href="/" aria-label="Resilience home"><Butterfly className="brand-butterfly"/><span>Resilience<small>Privacy. Support. Freedom.</small></span></a><div className="nav-links"><a href="#features">Features</a><a href="#journey">How it works</a><a href="/counselor">Counselors</a></div><div className="nav-actions"><span className={`status ${online?'online':'offline'}`}><span className="status-dot"/>{online?'Online':'Offline'}</span><a className="nav-start" href="/onboarding/safety">Get support <span>→</span></a></div></nav>

    <section className="res-hero"><div className="hero-copy"><p className="eyebrow">Private, resilient support</p><h1>Your safety.<br/>Your circle.<br/><em>Your control.</em></h1><p className="intro">Resilience is a private support space for survivors to talk, find trusted resources and receive direct help—without giving up their identity.</p><div className="actions"><a className="primary-action" href="/onboarding/safety">Get support <span>→</span></a><a className="counselor-action" href="/counselor">Join as a counselor</a></div><div className="trust-row"><span>◇ Pseudonymous</span><span>▢ Private</span><span>⌁ Decentralized</span></div></div><div className="hero-art" aria-hidden="true"><div className="hero-orbit"/><img className="hero-butterfly" src="/resilience-butterfly.png" alt=""/><Butterfly className="hero-butterfly-small one"/><Butterfly className="hero-butterfly-small two"/><div className="hero-card"><span>YOU’RE IN CONTROL</span><strong>A safer space to find your next step.</strong><small>No name. No judgement. Exit anytime.</small></div><p>Safer together.<br/>Stronger always.</p></div></section>

    <section className="res-features" id="features" aria-label="Resilience features">{featureItems.map(([icon,title,copy])=><article key={title}><span>{icon}</span><h2>{title}</h2><p>{copy}</p></article>)}</section>

    <section className="res-journey" id="journey"><header><p className="eyebrow">How it works</p><h2>Simple steps.<br/><em>Real support.</em></h2><p>Move at your own pace. Every screen is designed to protect your privacy and keep control in your hands.</p><a className="primary-action" href="/onboarding/safety">Start safely →</a></header><div className="journey-steps">{steps.map(([number,title,copy])=><article key={number}><span>{number}</span><div className="mini-screen"><Butterfly/><i/><i/><b/></div><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

    <section className="res-impact"><img className="impact-butterfly" src="/resilience-butterfly.png" alt=""/><article><p className="eyebrow">Built around you</p><h2>Quiet technology.<br/><em>Real freedom.</em></h2><p>Resilience helps people connect, get support and build safer futures without surveillance or unnecessary personal data.</p></article><article><p className="eyebrow">Why Nostr?</p><h2>A stronger foundation for safety.</h2><p>A decentralized network avoids a single point of control and lets people own their identity. The technology stays in the background; your needs stay first.</p></article></section>

    <footer className="res-footer"><div><Butterfly/><strong>Resilience</strong><small>Private support. Real agency.</small></div><p>A growing network of survivors, counselors and organizations building safer paths forward.</p><div className="footer-actions"><a href="/onboarding/safety">Get support →</a><a href="/donate">Donate with Lightning</a>{installPrompt&&!installed?<button onClick={installApp}>Install app ↓</button>:<small>{installed?'Installed on this device':'Install from your browser menu'}</small>}</div></footer>
  </main>
}

export default App
