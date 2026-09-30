import { lazy, Suspense, useEffect, useState } from 'react'

const isOnboardingRoute = window.location.pathname.startsWith('/onboarding')
const isMessagesRoute = window.location.pathname.startsWith('/app/messages')
const isWalletRoute = window.location.pathname.startsWith('/app/wallet')
const isResourcesRoute = window.location.pathname.startsWith('/app/resources')
const isCircleRoute = window.location.pathname.startsWith('/app/circle')
const isGroupsRoute = window.location.pathname.startsWith('/app/groups')
const isSupportRoute = window.location.pathname.startsWith('/app/counselors') || window.location.pathname.startsWith('/app/chat') || window.location.pathname.startsWith('/app/report')
const isHomeRoute = window.location.pathname.startsWith('/app')
const Onboarding = lazy(() => import('./onboarding/Onboarding'))
const Home = lazy(() => import('./home/Home'))
const Support = lazy(() => import('./support/Support'))
const Groups = lazy(() => import('./groups/Groups'))
const Circle = lazy(() => import('./circle/Circle'))
const Resources = lazy(() => import('./resources/Resources'))
const Wallet = lazy(() => import('./wallet/Wallet'))
const Messages = lazy(() => import('./messages/Messages'))

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

  if (isMessagesRoute) {
    return (
      <Suspense fallback={<main className="onboarding-loading">Loading…</main>}>
        <Messages />
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

  return (
    <main className="app-shell">
      <nav className="nav" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="Resilience home">
          <span className="brand-mark" aria-hidden="true">R</span>
          Resilience
        </a>
        <span className={`status ${online ? 'online' : 'offline'}`}>
          <span className="status-dot" aria-hidden="true" />
          {online ? 'Online' : 'Offline'}
        </span>
      </nav>

      <section className="hero">
        <p className="eyebrow">Ready wherever you are</p>
        <h1>A resilient app starts with a resilient foundation.</h1>
        <p className="intro">
          A privacy-first, pseudonymous support platform for survivors of gender-based violence — peer support groups, verified-by-external-org counselors, private messaging, selectively-shared health notes, and Bitcoin-based support ("zaps"), built as a responsive web app.
        </p>
        <div className="actions">
          <a className="primary-action" href="#features">Explore the foundation</a>
          {installPrompt && !installed ? (
            <button className="install-action" type="button" onClick={installApp}>
              <span aria-hidden="true">↓</span>
              Install App
            </button>
          ) : (
            <span className="install-hint">
              {installed ? 'Installed on this device' : 'Install it from your browser menu'}
            </span>
          )}
        </div>
      </section>

      <section className="features" id="features" aria-label="PWA features">
        <article>
          <span className="feature-number">01</span>
          <h2>Installable</h2>
          <p>Add it to a phone or desktop and launch it like a native app.</p>
        </article>
        <article>
          <span className="feature-number">02</span>
          <h2>Offline-ready</h2>
          <p>The app shell is cached so essential screens remain available.</p>
        </article>
        <article>
          <span className="feature-number">03</span>
          <h2>Built to grow</h2>
          <p>A typed React foundation ready for your real product features.</p>
        </article>
      </section>
    </main>
  )
}

export default App
