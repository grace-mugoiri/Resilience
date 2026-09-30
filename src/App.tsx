import { useEffect, useState } from 'react'

function App() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateStatus)
    window.addEventListener('offline', updateStatus)

    return () => {
      window.removeEventListener('online', updateStatus)
      window.removeEventListener('offline', updateStatus)
    }
  }, [])

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
          This React and TypeScript PWA is installable, responsive, and available
          even when the network is not.
        </p>
        <div className="actions">
          <a className="primary-action" href="#features">Explore the foundation</a>
          <span className="install-hint">Install it from your browser menu</span>
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
