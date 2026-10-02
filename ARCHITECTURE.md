# Resilience — Architecture

This is a hackathon prototype. It establishes real structure and contracts
for the product while explicitly mocking the integrations that would take
significant additional engineering to build for real (Nostr relays,
Lightning/Bitcoin payments, external counselor credentialing).

## High-level shape

```
frontend/   Next.js (App Router) + TypeScript + Tailwind — responsive web app
backend/    FastAPI + SQLAlchemy — one service, domain-organized
```

The frontend never talks to the database directly and never embeds business
logic that belongs server-side (verification rules, wallet balance math,
message ordering) — it calls the FastAPI API and renders what comes back.

## Backend structure

```
backend/app/
  main.py           FastAPI app, CORS, router wiring, DB init + seed
  config.py         Settings from environment variables
  database.py       SQLAlchemy engine/session (SQLite dev, Postgres-ready)
  security.py       Prototype session handling (see below)
  models/           SQLAlchemy ORM models, one file per domain
  schemas/          Pydantic request/response contracts
  routers/          One router per domain, thin — delegates to services
  services/         Business logic + the mock integration abstractions
```

Domains: identity, counselors, groups (+ group messages), messages (private
conversations), resources, health (records + sharing), wallet, circle, sync.

### Why one FastAPI app, not microservices

The prototype's whole surface area is small enough that splitting it into
services would only add deployment and cross-service-auth complexity without
a corresponding benefit. Domain boundaries are enforced by module structure
(routers only import their own schemas/models plus shared services), which
is enough to split into separate services later if a real deployment needs
independent scaling.

## Authentication boundary (STUB — read this before relying on it)

There is no username/password/email account system, by design — accounts
are pseudonymous. `POST /api/identity` creates a pseudonym + keypair-shaped
identity and returns a bearer session token. `Authorization: Bearer <token>`
on subsequent requests resolves to that identity via `app/security.py`.

This is intentionally **not production authentication**:
- Session tokens live in an in-memory Python dict. They vanish on every
  backend restart and are not shared across multiple worker processes.
- There's no token expiry, rotation, or revocation.
- PINs are compared via `sha256` (not a slow password hash like bcrypt/argon2)
  because the "PIN" here gates a local session, not a network-facing login
  secret on its own — a production build should still harden this if the PIN
  is ever the sole factor protecting anything sensitive.

A production version should replace this with signed, expiring tokens (or a
Nostr-native signature-based auth scheme keyed off the identity's own
keypair) verified statelessly, so the backend can be scaled horizontally.

## Mock service abstractions

Three domains are modeled as swappable service interfaces specifically so a
real integration can replace the mock later without touching routers or the
frontend:

### `NostrService` (`app/services/nostr_service.py`) — MOCK
Real Resilience intends pseudonymous identity and censorship-resistant
messaging over Nostr (keypairs, relays, NIP-04/NIP-17 DMs). Building relay
infrastructure was explicitly out of scope for this prototype. The mock
generates deterministic fake keypairs (`generate_keypair`), records
in-memory "events" (`publish_event` / `fetch_events`), and reports fake
relay latency (`relay_status`). The interface is intentionally already
event-shaped so a `RelayNostrService` implementing the same `Protocol` could
be dropped in later.

### `PaymentService` (`app/services/payment_service.py`) — MOCK
Wallet connection, balance, and transactions are rows in the prototype
database, mutated directly by this service. **No private key, seed phrase,
or Lightning node credential is ever accepted or stored** — `public_address`
is exactly that: public. `mock_zap` simulates an incoming zap by inserting a
`SUCCESS` transaction and incrementing balance; there is no real money
movement anywhere in this codebase.

### `VerificationService` (`app/services/verification_service.py`) — MOCK external attestation
Resilience does not itself license or professionally verify counselors.
`VerificationStatus` (`verified` / `pending` / `expired` / `revoked`) models
a status asserted by a trusted external organization. `attest()` exists so
the prototype can demonstrate all four states; in production this would be
invoked by that external organization's own credentialing pipeline (signed
webhook, verified assertion), never by the counselor or the platform itself.

## Offline-aware messaging (REAL prototype behavior, frontend-only)

`frontend/src/lib/context/offline-context.tsx` detects `online`/`offline`
browser events, queues outgoing group/direct messages in `localStorage` when
offline, and replays them through `POST /api/sync` once connectivity
returns. The backend dedupes replayed messages by `client_message_id`
(`app/routers/sync.py`, `app/routers/groups.py`, `app/routers/messages.py`),
so a retried sync — or a message that actually made it through right before
the connection dropped — never creates a duplicate.

This demonstrates the intended UX and a real dedup mechanism; it is not a
substitute for genuine offline-first data sync (no conflict resolution, no
background sync worker, no service-worker cache of read data).

## Data model

SQLite for local development (`backend/resilience_dev.db`), via a
`DATABASE_URL` environment variable that accepts any SQLAlchemy-compatible
URL — pointing it at a `postgresql://` URL is a config change, not a code
change. Models are intentionally minimal: only what the current screens need
(see `API.md`), not the full entity set implied by the original product
specification.

## Health data — demonstration only

`HealthRecord` rows exist to drive the "My records" UI and sharing/consent
flow. They hold clearly fictional demo content, are not encrypted at rest in
this prototype, and must never contain real medical data. The intended
production design is client-side encryption before anything reaches the
server, with the server storing only ciphertext it cannot read — this
prototype does not implement that; see `README.md` limitations.

## Browser safety limitations

Quick Exit, decoy screens, auto-exit-on-inactivity, and local-data-clearing
are implemented as real frontend behavior, but a browser tab cannot provide
the same guarantees a native app can:
- Browser history, and any autofill/password-manager capture of typed text,
  is outside this app's control.
- A "clear local data" action can wipe `localStorage`/`sessionStorage` it
  owns, but cannot purge browser cache, service worker storage some browsers
  retain, or OS-level swap/screenshot artifacts.
- Quick Exit navigates away and can replace the current history entry, but
  cannot prevent someone from finding the tab again via browser history UI
  in all cases (e.g. session restore on browser relaunch).

These limitations are surfaced in-product (see the Settings/Safety screens)
rather than silently assumed away.
