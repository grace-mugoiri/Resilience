# Resilience

A privacy-first, pseudonymous support platform for survivors of gender-based
violence — peer support groups, verified-by-external-org counselors, private
messaging, selectively-shared health notes, and Bitcoin-based support
("zaps"), built as a responsive web app.

This is a **hackathon prototype**. It has a real Next.js frontend and a real
FastAPI backend with a real database — but Nostr identity/messaging, the
Bitcoin wallet, and counselor verification are all mocked behind clean
service interfaces. See [ARCHITECTURE.md](./ARCHITECTURE.md) for exactly
what's real vs. mocked and why, and [API.md](./API.md) for the endpoint
reference.

## Project overview

Two user journeys share one backend:

- **Survivor**: safety-first onboarding → pseudonymous account → home
  dashboard → talk to a counselor or join a peer group → private/group
  messaging → find resources → manage health notes with per-counselor
  sharing/revocation → connect a wallet and receive support → safety
  settings (Quick Exit, PIN, backup, clear data).
- **Counselor**: register a pseudonymous counselor account → set up a
  profile (specialties, languages, attesting organization) → dashboard →
  respond to survivor conversations → manage verification status display
  and availability → wallet.

Quick Exit is reachable from the very first screen onward, and instantly
swaps to a convincing decoy (a fake weather app) with no confirmation, no
animation — matching the source design's safety requirement.

## Repository layout

```
frontend/   Next.js 16 (App Router) + TypeScript + Tailwind v4
backend/    FastAPI + SQLAlchemy (SQLite for dev)
ARCHITECTURE.md   Mock vs. real, service boundaries, security notes
API.md            Endpoint reference
```

## Running locally

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload --port 8000
```

The first run creates `resilience_dev.db` (SQLite) and seeds it with
fictional demo data (survivors, counselors in all four verification states,
support groups, resources). Interactive API docs: `http://localhost:8000/docs`.

Run the backend test suite:

```bash
cd backend
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:3000`. The frontend calls the backend at
`NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) — no other backend
coupling exists; it's a plain `fetch`-based API client
(`frontend/src/lib/api/`).

Other frontend commands:

```bash
npm run build   # production build + typecheck
npm run lint    # ESLint
npx tsc --noEmit  # typecheck only
```

## Environment variables

**Backend** (`backend/.env`, see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./resilience_dev.db` | Any SQLAlchemy URL; point at `postgresql://...` for Postgres. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins. |
| `NOSTR_MOCK` / `WALLET_MOCK` | `true` | Documentation flags — the mock services are always used in this prototype regardless of these values. |

**Frontend** (`frontend/.env.local`, see `.env.local.example`):

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL the frontend calls. |

## How the frontend talks to the backend

Every request goes through `frontend/src/lib/api/client.ts`, which attaches
`Authorization: Bearer <token>` from the session context
(`frontend/src/lib/context/session-context.tsx`). Domain-specific functions
live in `frontend/src/lib/api/*.ts` (one file per backend router) and return
typed responses matching `frontend/src/lib/types/index.ts`. No component
calls `fetch` directly.

## Mocked integrations

| Integration | Status | Where |
|---|---|---|
| Nostr identity & messaging | **MOCK** | `backend/app/services/nostr_service.py` |
| Bitcoin wallet & zaps | **MOCK** | `backend/app/services/payment_service.py` |
| Counselor verification | **MOCK external attestation** | `backend/app/services/verification_service.py` |
| M-Pesa withdrawal | **MOCK** | `backend/app/services/payment_service.py` (`mock_withdraw`) |
| Health record encryption | **DEMONSTRATION ONLY** | plaintext in dev DB — see limitations below |
| Session/auth | **STUB** | in-memory bearer tokens, see `backend/app/security.py` |
| Offline message queue + sync dedup | **REAL** (frontend + backend) | `frontend/src/lib/context/offline-context.tsx`, `backend/app/routers/sync.py` |
| Backend API, database, everything else | **REAL** (dev-grade) | — |

## Known limitations

- **Browser safety limits.** Quick Exit and the decoy screen are real, but a
  browser tab cannot guarantee what a native app can — browser history,
  session restore, and OS-level screenshots/swap are outside this app's
  control. See ARCHITECTURE.md.
- **Sessions are in-memory** on the backend and reset on restart; there's no
  token expiry/rotation. Not production auth.
- **Health records are not encrypted** in this prototype; they're plaintext
  rows scoped to the owner, demonstrating the sharing/consent UX only.
- **No moderator-approval UI.** Groups that require approval show a real
  "pending" state after requesting to join, but nothing in this prototype
  ever approves that request.
- **Wallet currency mismatch with the source Figma.** The product spec
  calls for a Bitcoin-native wallet (sats, QR receive); the Figma file
  modeled the same screens around KES + M-Pesa withdrawal. This build follows
  the product spec's Bitcoin-native direction (sats, mock QR) while keeping
  the Figma's privacy-conscious "balance hidden by default" pattern and its
  M-Pesa-flavored withdrawal step, since neither the spec nor the Figma
  settled this and no real payment rail is implemented either way.
- **No real-time delivery.** Messages are fetched on load/send; there's no
  websocket/push, so a second participant's incoming message only appears on
  next load or after your own queue drains.

## Testing performed

- Backend: `pytest` (26 tests) covering identity creation/restore/login,
  counselor verification states & profile ownership, group join/approval/
  idempotent messaging, health record sharing & revocation, wallet connect/
  zap/withdraw and insufficient-balance rejection, and offline-sync
  idempotency/authorization — all passing.
- Frontend: `next build` (production build + TypeScript) and `eslint` — both
  clean (0 errors; 10 documented warnings from the fetch-in-`useEffect`
  pattern used throughout, see `frontend/eslint.config.mjs`).
- Manual browser QA of the live app end-to-end: onboarding → account
  creation → dashboard → counselor directory (all four verification states)
  → counselor profile → private messaging → moderated and open group
  join/chat → wallet connect/zap/balance-hide → Quick Exit → decoy →
  PIN-return → counselor registration → profile setup → dashboard, plus a
  simulated offline/online cycle confirming message queueing and auto-sync.
  Responsive layout verified at mobile (390px), tablet (820px), and desktop
  (1714px) widths.

## Future integration points

- Replace `MockNostrService` with a real relay-backed implementation behind
  the same interface.
- Replace `PaymentService` with NWC (Nostr Wallet Connect) or a Lightning
  node integration.
- Replace the in-memory session store with signed/expiring tokens.
- Client-side encryption for health records before they ever reach the
  server.
- Real counselor credentialing webhook driving `VerificationService.attest`.
