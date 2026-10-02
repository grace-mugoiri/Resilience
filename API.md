# Resilience API

Base URL (dev): `http://localhost:8000`. Interactive docs at `/docs` (FastAPI
Swagger UI) once the backend is running.

Auth: most endpoints require `Authorization: Bearer <token>`, obtained from
`POST /api/identity`, `/api/identity/login`, or `/api/identity/restore`. See
`ARCHITECTURE.md` for why this is a prototype-grade session, not production
auth.

## Identity

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/identity` | no | Create a pseudonymous identity. Returns the identity, a one-time recovery phrase, and a session token. |
| POST | `/api/identity/restore` | no | Restore access with the recovery phrase + a new PIN. |
| POST | `/api/identity/login` | no | Log back in with `identity_id` + PIN (same-device return). |
| GET | `/api/identity/me` | yes | Current identity. |
| POST | `/api/identity/change-pin` | yes | Change PIN (requires the current PIN). |

## Counselors

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/counselors` | no | List counselors; optional `?verification_status=` filter. |
| GET | `/api/counselors/{id}` | no | Single counselor profile. |
| POST | `/api/counselors` | yes (counselor role) | Create your own counselor profile. Starts `pending`. |
| PATCH | `/api/counselors/{id}` | yes (owner) | Update bio/specialties/languages/availability. |

Verification status is one of `verified` / `pending` / `expired` / `revoked`
— see `ARCHITECTURE.md`'s note on `VerificationService`.

## Support groups

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/groups` | yes | List groups with `is_member`/`is_pending`/`requires_approval` for the current identity. |
| GET | `/api/groups/{id}` | yes | Single group. |
| POST | `/api/groups/{id}/join` | yes | Idempotent. Instant membership for open groups; sets a `pending` membership awaiting moderator approval for `requires_approval` groups (no moderator-approval UI exists in this prototype, so pending requests stay pending). |
| GET | `/api/groups/{id}/messages` | yes (member) | Group chat history. |
| POST | `/api/groups/{id}/messages` | yes (member) | Send a message. Requires a client-generated `client_message_id`; replaying the same id returns the original message instead of duplicating it. |

## Private messages

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/messages` | yes | List the current identity's conversations. |
| POST | `/api/messages` | yes | Start (or reuse) a conversation with `counterpart_identity_id`. |
| GET | `/api/messages/{conversation_id}` | yes (participant) | Message history. |
| POST | `/api/messages/{conversation_id}` | yes (participant) | Send a message (same `client_message_id` idempotency as group messages). |

## Resources

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/resources` | no | Optional `?category=legal\|medical\|shelter\|educational`. All entries are fictional demo data (`is_demo_data: true`). |

## Health records (DEMONSTRATION ONLY — see ARCHITECTURE.md)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health/records` | yes | Your own records, with active shares listed. |
| POST | `/api/health/records` | yes | Create a record. |
| POST | `/api/health/share` | yes | Share a record with a counselor identity (consent grant). |
| DELETE | `/api/health/share/{share_id}` | yes (owner) | Revoke a share. |

## Wallet (MOCK — no real funds ever move)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/wallet` | yes | Current connection state + balance. |
| POST | `/api/wallet/connect` | yes | Attach a public address string. Never send a private key here. |
| POST | `/api/wallet/disconnect` | yes | Disconnect. |
| GET | `/api/wallet/transactions` | yes | Transaction history, newest first. |
| POST | `/api/wallet/zap/mock` | yes (connected) | Simulate receiving a zap: creates a `success` incoming transaction and credits the balance. |
| POST | `/api/wallet/withdraw/mock` | yes (connected) | Simulate an M-Pesa withdrawal: creates a `pending` outgoing transaction and debits the balance immediately (rejected if it exceeds the balance). |

## My Circle

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/circle` | yes | Your trusted contacts. |
| POST | `/api/circle` | yes | Add a member by identity id. |
| DELETE | `/api/circle/{member_id}` | yes (owner) | Remove a member. |

## Sync (offline queue reconciliation)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/sync` | yes | Body: `{"messages": [{client_message_id, target: "group"\|"direct", target_id, body}]}`. Replays each against the group/direct message tables with the same idempotency guarantee as the direct send endpoints, so a client can safely retry a sync that partially succeeded. |

## Misc

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/status` | no | Liveness + which integrations are mocked + fake relay status. |
