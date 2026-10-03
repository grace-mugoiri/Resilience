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
| `GET /healthz` | None | Implemented |
| `GET /v1/config` | None | Implemented |
| `GET /v1/whoami` | NIP-98 | Implemented |
| `POST /v1/orgs` | Organisation NIP-98 key | Implemented |
| `GET /v1/orgs` | None | Implemented |
| `GET /v1/orgs/{id}/counsellors` | None | Implemented |
| `PUT /v1/orgs/{id}/roster` | Signed roster event | Implemented |
| `PUT /v1/orgs/{id}/counsellors/{pubkey}/profile` | Counsellor's signed kind 0 event | Implemented |
| `POST /v1/orgs/{id}/counselor-invites` | `verification` key + challenge | Implemented |
| `POST /v1/counselor-enrollments/claim` | Counselor NIP-98 key | Implemented |
| `PUT /v1/counselor-enrollments/{id}/credentials` | Counselor + challenge | Implemented |
| `GET /v1/orgs/{id}/counselor-enrollments` | `verification` key | Implemented |
| `/v1/orgs/{id}/counselor-enrollments/{application}/{decision}` | `verification` key + challenge | Implemented |
| `GET /v1/admin/orgs` | Platform admin NIP-98 key | Implemented |
| `POST /v1/admin/orgs/{id}/approve` | Platform admin NIP-98 key | Implemented |
| `POST /v1/admin/orgs/{id}/suspend` | Platform admin NIP-98 key | Implemented |
| `/v1/disbursements` routes | Scoped NIP-98 + multi-party approval | Implemented |

## Current limitations

- Counsellor rosters and profiles are submitted to the API; automatic relay-to-database
  synchronization is not implemented.
- Credential ciphertext is stored in PostgreSQL for the MVP rather than dedicated object storage.
- A real credential reviewer dashboard and external payment-provider settlement are not included.
- Production TLS, public hostnames, and deployment configuration are not included in the local
  Compose setup.

## Verification

The test suite covers NIP-98 authentication, configuration signatures, CORS, NIP-05 validation,
organisation administration, counsellor roster and profile rules, and worker behavior. Run the tests using the
instructions in [`../../backend/README.md`](../../backend/README.md).
