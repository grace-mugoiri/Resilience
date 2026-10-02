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
- CORS allows the Vite web client (`http://localhost:5173`) in the local example settings.
- Background cleanup of expired NIP-98 replay records.
- Nostr relay configuration with NIP-42 authentication, recipient-only delivery for gift-wrapped
  direct messages, event and subscription rate limits, and expiry handling.

## API routes

| Method and path | Authorization | Status |
|---|---|---|
| `GET /healthz` | None | Implemented |
| `GET /v1/config` | None | Implemented |
| `GET /v1/whoami` | NIP-98 | Implemented |
| `POST /v1/orgs` | Organisation NIP-98 key | Implemented |
| `GET /v1/orgs` | None | Implemented |
| `GET /v1/orgs/{id}/counsellors` | None | Implemented |
| `PUT /v1/orgs/{id}/roster` | Signed roster event | Implemented |
| `PUT /v1/orgs/{id}/counsellors/{pubkey}/profile` | Counsellor's signed kind 0 event | Implemented |
| `GET /v1/admin/orgs` | Platform admin NIP-98 key | Implemented |
| `POST /v1/admin/orgs/{id}/approve` | Platform admin NIP-98 key | Implemented |
| `POST /v1/admin/orgs/{id}/suspend` | Platform admin NIP-98 key | Implemented |
| `PUT /v1/admin/orgs/{id}/disbursement-limits` | Platform admin NIP-98 key + challenge | Implemented |
| `POST /v1/orgs/{id}/disbursements` | Active counsellor NIP-98 + challenge | Implemented |
| `POST /v1/disbursements/{id}/approve` | `payments` key NIP-98 + challenge | Implemented |
| `POST /v1/disbursements/{id}/invoice` | Requesting counsellor NIP-98 | Implemented |
| `POST /v1/disbursements/{id}/paying`, `/proof` | `payments` key NIP-98 | Implemented |
| `POST /v1/disbursements/{id}/cancel` | Requesting counsellor or `payments` key | Implemented |
| `GET /v1/disbursements/{id}`, `GET /v1/orgs/{id}/disbursements` | NIP-98 | Implemented |

## Current limitations

- Counsellor rosters and profiles are submitted to the API; automatic relay-to-database
  synchronization is not implemented.
- The client-side verification flow for the platform-signed approved-organisation list is not
  implemented.
- Disbursements record payments made from the organisation's own wallet. The server never pays,
  and doesn't check settlement with a wallet or provider: a payment marked `PAYING` stays there
  until its preimage is submitted. M-Pesa payouts are not implemented.
- Relay configuration has no event-kind allowlist yet. NIP-42 authentication applies to direct
  messages, while other event kinds may still be published.
- Production TLS, public hostnames, and deployment configuration are not included in the local
  Compose setup.

## Verification

The test suite covers NIP-98 authentication, configuration signatures, CORS, NIP-05 validation,
organisation administration, counsellor roster and profile rules, and worker behavior. Run the tests using the
instructions in [`../../backend/README.md`](../../backend/README.md).
