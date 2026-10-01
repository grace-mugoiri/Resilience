import "./home.css";

function Home() {
  return (
    <main className="home-page">
      <header className="home-header">
        <div>
          <p className="home-eyebrow">RESILIENCE</p>
          <h1>Welcome </h1>
          <p className="home-subtitle">
            A private space to find support, connect with others, and access
            resources safely.
          </p>
        </div>

        <div>
          <button>Exit</button>
        </div>
      </header>

      <section className="home-grid">
        <article className="home-card home-card-primary">
          <div className="home-card-icon" />
          <div>
            <p className="home-card-label">SUPPORT</p>
            <h2>Talk to a counselor</h2>
            <p>
              Connect with a verified counselor in a private and supportive
              environment.
            </p>
            <button type="button">Find a counselor</button>
          </div>
        </article>

        <article className="home-card">
          <div className="home-card-icon" />
          <div>
            <p className="home-card-label">COMMUNITY</p>
            <h2>Peer support groups</h2>
            <p>
              Join a supportive community and connect with people who
              understand.
            </p>
            <button type="button">Explore groups</button>
          </div>
        </article>

        <article className="home-card">
          <div className="home-card-icon" />
          <div>
            <p className="home-card-label">RESOURCES</p>
            <h2>Find resources</h2>
            <p>
              Access trusted information, services, and support resources.
            </p>
            <button type="button">View resources</button>
          </div>
        </article>

        <article className="home-card">
          <div className="home-card-icon" />
          <div>
            <p className="home-card-label">MY RECORDS</p>
            <h2>My Wallet </h2>
            <p>
              Money sent to you.Withdraw when it's safe.
            </p>
            <button type="button">View my records</button>
          </div>
        </article>
      </section>

        
    </main>
  );
}

export default Home;