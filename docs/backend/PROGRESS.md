# Backend implementation status

## Implemented

- FastAPI service, PostgreSQL schema and migration, Docker Compose, and CI checks.
- NIP-98 request authentication with signature, time-window, URL, method, payload-hash and replay
  checks.
- Signed client configuration and exact-origin CORS validation.
- Public health and identity endpoints.
- Organisation applications, platform-admin approval and suspension, and NIP-05 website checks.
- Signed counsellor roster intake, stale-roster rejection, public directory endpoints, and periodic
  NIP-05 re-checks.
- Counsellor profiles: signed kind 0 profiles (name, bio, specialties, languages, reply time)
  accepted from counsellors on a current roster, and a directory response that carries the
  organisation and each counsellor's `verified`, `expired` or `removed` status.
- Offline organization roots authorize time-bounded operational roster keys; root-signed rotation
  and emergency revocation events are stored and returned for client verification.
- Organization applications explicitly consent to a public counselor directory; the privacy
  implications of kind 30000 `p` tags are documented.
- Single-use, hashed counselor invitations; counselor-signed onboarding profiles; hybrid
  AES-256-GCM/NIP-44 credential encryption; organization review states; and roster-gated activation.
- CORS allows the Vite web client (`http://localhost:5173`) in the local example settings.
- Background cleanup of expired NIP-98 replay records.
- Nostr relay configuration with NIP-42 authentication, recipient-only delivery for gift-wrapped
  direct messages, event and subscription rate limits, and expiry handling.

## API routes

| Method and path | Authorization | Status |
|---|---|---|
| `GET /healthz` | anyone | built |
| `GET /v1/config` | anyone | built |
| `GET /v1/whoami` | signed request | built |
| `POST /v1/orgs` | signed by the organisation | built |
| `GET /v1/orgs`, `GET /v1/orgs/{id}/counsellors` | anyone | built |
| `PUT /v1/orgs/{id}/roster` | the body is the organisation's signed event | built |
| `GET /v1/admin/orgs`, `POST /v1/admin/orgs/{id}/approve`, `/suspend` | platform admin key | built |
| `POST /v1/disbursements` and its `/invoice`, `/paying`, `/proof`, `/cancel` | organisation or counsellor | next |
| `GET /v1/disbursements` | own organisation | next |

"Next" means planned and designed, with its database tables already in place, but no code
answering it yet. Calling it today returns `404`.

## 5. What the database stores

Seven tables. `alembic_version` only records which migration ran.

| Table | Holds |
|---|---|
| `organizations` | Name, website domain, Nostr key, status (pending, approved, suspended), when the website last vouched, spending limits |
| `roster_events` | Each organisation's signed counsellor list, exactly as it arrived: the proof |
| `counsellor_attestations` | Quick lookup built from those lists: counsellor key, expiry, active or not |
| `disbursements` | Each emergency payment: amount, reason from a fixed list, state, payment hash. The invoice is deleted once final. |
| `disbursement_transitions` | Audit trail: every state change, by which counsellor key, when |
| `seen_auth_events` | IDs of used signed requests, deleted after 2 minutes |

**Not stored, on purpose:** no survivor table, no messages, no IP addresses, no phone numbers,
no private keys. Payments do not record who received them. A seized server would show that "an
organisation sent KSh 500 for transport on Tuesday", not to whom.

## 6. The relay

A relay is the server that passes Nostr messages between people, like a mail server. Damus and
Primal are Nostr **apps** (clients); the relays their companies run are **public** relays.

Ours is `nostr-rs-relay` 0.10.0, configured in `relay/config.toml`:

- `nip42_auth` and `nip42_dms` on: clients log in with their key, and gift-wrapped private
  messages (NIP-17) go only to the key they are addressed to.
- Messages carry a 7-day expiry and the relay deletes them when it passes.
- Logs at warning level only, and no IP forwarding header, so client IPs are not recorded.
- 5 events per second, 10 subscriptions per minute.

**Status:** configured and running in Docker on your laptop (port 7777). Not yet deployed, and
nothing has sent it real messages yet.

**Known gap:** login is only required for private messages. Anyone can still publish other kinds
of events. The fix is one setting, `event_kind_allowlist`, accepting only the kinds the app uses
(1059, 10050, 30000, 30078 and 5). Not done yet.

## 7. Problems found, and how they were fixed

| Problem | Cause | Fix |
|---|---|---|
| Two identical GET requests in the same second: the second was refused as a replay | Both produce the exact same signed event id | Replay blocking now applies only to writes |
| A test failed only on machines with a `.env` | The developer's `.env` leaked into the tests | Tests now set every value they depend on |
| Worker crashed once on the first Docker start (`relation "seen_auth_events" does not exist`) | It started before the API had finished creating the tables | API health check in Compose; the worker waits until the API is healthy |
| Docker's database would not start (`address already in use`) | Your laptop's own PostgreSQL has port 5432 | Docker's database moved to 5433 |
| Re-sending an old counsellor list returned `200` | Only the newest list's id was treated as "already seen" | Any list older than the stored one now returns `409` |
| The test suite took about a minute | `TRUNCATE` between tests took about 2 seconds each | Switched to `DELETE`: 100 tests in about 3 seconds |
| All 100 tests failed with `connection failed` on your laptop | The tests looked for the database on 5432; Docker's is on 5433 | Set `TEST_DATABASE_URL` to port 5433 (README section 5) |
| `No module named 'coincurve'` on your laptop | The virtual environment had not been created there | README section 2 |
| `perl: warning: Setting locale failed` | Your laptop's `sw_KE` region setting | Harmless; `export LC_ALL=C.UTF-8` hides it |

## 8. How it is tested

- **100 automated tests**, about 3 seconds: every way a signed request can be rejected, config
  tampering, CORS, the NIP-05 check and all its failure modes, applications, approval,
  suspension, rosters, and the worker.
- **Property tests** (hypothesis, the fuzzing idea from the Btrust session): no event edited after
  signing may ever verify; and after any sequence of counsellor lists, only counsellors on the
  newest one are listed.
- **Manual runs:** every step in README section 6 was run against a live server and matched its
  expected output. You ran the Monday checks in the browser workspace and the Docker stack on your
  laptop.
- **Not tested yet:** the relay with real messages, anything on a deployed server, and the
  frontend talking to the API.

## 9. Deployment: what it needs and what it costs

Today everything runs on `localhost`, which only your laptop can reach. On Demo Day the judges'
phones must reach the API and the relay over the internet, and an `https://` page can only talk
to a relay at a `wss://` address, which needs a certificate.

What it needs:

- **A server** (a VPS): the only part that costs money.
- **A name:** free with sslip.io (`203.0.113.5` becomes `203-0-113-5.sslip.io`), or a `.xyz`
  domain for about $2 the first year.
- **Caddy:** free; gets the Let's Encrypt certificate and handles `https://` and `wss://`.

Prices checked 29 September 2026 (1 USD = KSh 129.55):

| Option | Price |
|---|---|
| Vultr, 1 GB RAM | $5/month (about KSh 650) |
| DigitalOcean, 512 MB | $4/month, probably too little memory |
| Hetzner, 4 GB | €5.99/month, sold out at the time |
| Google Cloud free tier | free, 1 GB RAM, US only, needs a card |

Billed hourly, so a $5 server from Wednesday to after Demo Day is about $1 to $1.50. The real
blocker is a payment card, not the price. Free fallback: a Cloudflare quick tunnel from a laptop,
testing only, and Cloudflare would see visitors' IPs.

**Recommendation:** a 1 GB Vultr server with a free sslip.io name, deleted after Demo Day. Ask
DADA Devs or the Btrust mentors about cloud credits first.

## 10. What is left

In order:

1. **Emergency payments** (`/v1/disbursements`): the state machine (created, invoice attached,
   paying, paid, expired, failed, cancelled), idempotency keys so a payment cannot be created
   twice, spending caps, proof of payment with the Lightning preimage, and a property test that
   nothing is ever paid twice or goes over the daily cap.
2. **Deploy:** needs someone with a card or credits. Then Caddy and a production Compose file, so
   the deploy is one command.
3. **Relay hardening:** the `event_kind_allowlist` line.
4. **An API guide for the frontend team:** each endpoint with an example request and response,
   and how to sign a request.
5. **Later:** the worker pulling counsellor lists from the relay by itself, and the
   platform-signed list of approved organisations.

Before any of this goes to the team repo:

- Open an issue, as `CONTRIBUTING.md` asks, and rename the branch to
  `feature/<issue-number>/backend-setup`.
- Agree the base branch with the team (the backend branched from `main`; the frontend works
  from `frontend`).
- Fork the repo, add the fork as `origin`, and push only when you decide to.

## 11. Words used in this project

| Word | Meaning |
|---|---|
| Nostr | An open protocol where your identity is a key pair and messages are signed events passed through relays |
| Key pair | A secret key (never shared) and a public key (your identity, safe to share) |
| Event | A signed Nostr message. Its `kind` number says what it is. |
| Relay | A server that stores and passes on events |
| Client | The app people use, such as Damus, Primal, or our web app |
| NIP | A Nostr Implementation Possibility: one numbered part of the Nostr spec |
| NIP-98 | Signing an HTTP request with your Nostr key, instead of a password |
| NIP-05 | A website vouching for a key by listing it in `/.well-known/nostr.json` |
| NIP-17 / gift wrap | Private messages sealed so even the relay cannot see who wrote them |
| NIP-42 | Logging in to a relay by signing a challenge with your key |
| NIP-40 | An `expiration` tag, after which relays delete the event |
| Roster | An organisation's signed list of its counsellors (kind 30000) |
| Lightning invoice | A payment request. Paying it reveals a secret, the **preimage**, which proves the payment arrived. |
| Idempotency key | A unique label on a request, so sending it twice does not create two payments |
| Migration | A versioned change to the database structure (Alembic) |
| Worker | A second process running background jobs on a timer |
