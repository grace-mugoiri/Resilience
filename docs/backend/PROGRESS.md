# Backend progress

Status as of Wednesday 30 September 2026. Hack4Freedom Nairobi, Demo Day Monday 5 October.

This is a record of what the backend work has covered so far: what the app is for, what was
decided and why, what is built and tested, what went wrong and how it was fixed, and what is left.
For how to run it, see [backend/README.md](../../backend/README.md). For the full design, see
[ARCHITECTURE.md](ARCHITECTURE.md).

## 1. The project in one paragraph

Resilience lets a person facing gender-based violence talk privately to a verified support
organisation and receive emergency money, without leaving anything on her phone or her M-Pesa
statement. In Kenya's 2022 health survey (DHS), 41% of women who have had a partner reported
violence from him. Her phone is often the danger: an abuser checks her messages and M-Pesa, and
every normal channel (WhatsApp, Signal, a registered SIM) is tied to her ID.

**The demo:** open a link, find verified help, talk safely, get money for the journey, leave no
trace.

## 2. Who uses it

**Akinyi, the survivor.** 29, lives in Kayole, sells vegetables, cheap Android phone that her
husband sometimes checks. She has maybe ten minutes alone. Her steps:

1. Open a link in a private tab. No install, no signup. A throwaway identity is created for her.
2. Pick an organisation marked verified. Her own phone checks the mark.
3. Chat privately. Messages are encrypted and disappear after 7 days.
4. Receive emergency money (for example KSh 500 for transport) over Lightning, spent at a till,
   so it never shows on her M-Pesa statement.
5. Tap quick exit. The screen jumps to a harmless page and closing the tab wipes everything.

**Wambui, the counsellor.** Works at a registered GBV organisation, on a laptop. She signs in with
her organisation's verified key, replies to chats, and sends the KSh 500 from the organisation's
own wallet. The app records the payment but never holds the money.

## 3. Decisions made, and why

| Decision | Why |
|---|---|
| Web app first, not a mobile app | A judge can open a link, and there is nothing installed on her phone for an abuser to find. |
| **The one rule:** the server never holds her keys, her messages, her money, or an IP address next to a public key | If the server were seized or subpoenaed, it should reveal nothing about any survivor. |
| Our own relay, not public ones | Only the recipient can fetch a message, messages are really deleted on expiry, and we control logging. |
| An **authenticated** relay (of the four types: personal, paid, authenticated, public) | Clients log in with their key (NIP-42) and private messages are served only to their recipient. Paid would link a payment to her key; public lets anyone download encrypted messages and study who talks to whom. |
| No accounts, passwords or phone numbers | Every write is signed with a Nostr key (NIP-98). Survivors never log in to the API at all. |
| Organisations prove themselves through their own website (NIP-05) | Anyone can claim to be a counsellor. A website listing the organisation's key is a check the survivor's phone can repeat itself. |
| No Lightning custody | Holding other people's money is licensed activity under Kenya's VASP Act 2025. The organisation's wallet pays; the server only records proof. |
| No M-Pesa (Daraja) payouts to survivors | They would appear on her M-Pesa statement. |
| Cut: group chat | NIP-17 groups have no admins and no bans, so an abuser who gets in cannot be removed. |
| Cut: health records | The riskiest data in the system, and a record encrypted with a key that dies with the tab can never be reopened. |
| `coincurve` plus our own ~80-line helper for Nostr signatures, not `nostr-sdk` | Smaller and easy to read and test. |
| Replay blocking on write requests only | Two identical reads in the same second produce the same signed event, and repeating a read changes nothing. |
| Docker Compose for the deployed server and for teammates | One command starts the same pinned versions everywhere. |
| Docker's database on port 5433 | Your laptop already had PostgreSQL on 5432. |
| Your laptop is the real copy of the code | Work arrives as patch files you review with `git diff` and apply with `git apply`. Nothing is pushed until you say so. |

## 4. What is built

### Monday 28 September: the foundation

- FastAPI project, settings from `.env`, Dockerfile, Docker Compose (database, relay, API,
  worker), GitHub Actions CI (lint, format, migration, tests).
- `GET /healthz`: is the database reachable.
- `GET /v1/config`: the list of trusted relays, signed by the platform key. The server refuses to
  serve it if the signature does not match, so a swapped relay list is caught.
- `GET /v1/whoami`: returns your key if your signed request is valid. For testing signing.
- NIP-98 request signing: checks the signature, a 60-second time window, the exact public URL,
  the method, a hash of the body, and blocks a replayed write.
- CORS locked to the web app's exact address. The server refuses to start with `*`.
- The whole database schema in one migration (`0001`).
- Worker: deletes old replay-guard entries every minute.
- Relay config for `nostr-rs-relay` 0.10.0: login required, private messages only to their
  recipient, rate limits, no IP logging.
- The backend architecture document.

### Tuesday 29 September: Docker, then the directory

- **First real Docker run on your laptop.** It found two problems, both fixed (section 7).
- **The directory of verified organisations and counsellors**, which answers "is this counsellor
  real?":
  - `POST /v1/orgs`: an organisation applies, signed with its own key.
  - `GET /v1/admin/orgs`, `POST .../approve`, `POST .../suspend`: admin only. Approval checks
    the organisation's website (`/.well-known/nostr.json`) first and is refused if the site does
    not list the organisation's key.
  - `PUT /v1/orgs/{id}/roster`: the organisation's signed list of counsellors. Only its own key
    can sign it, older lists are refused, and anyone left off the newest list stops being trusted.
  - `GET /v1/orgs`, `GET /v1/orgs/{id}/counsellors`: public, no login, and the signed list is
    included so the survivor's browser can check it without trusting our server.
  - Worker: re-checks every organisation's website every 6 hours. A site that changes its key gets
    the organisation suspended; a site that is merely down does not.
  - `scripts/nostr_dev.py`: makes test keys, signed headers, `nostr.json` files and rosters, for
    testing by hand.

### Wednesday 30 September: documentation

- `backend/README.md` rewritten as a full how-to-run guide: setup, Docker, day-to-day
  development, checks, a manual walkthrough and troubleshooting.
- This document.

### Endpoints

| Method and path | Who can call it | Status |
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
