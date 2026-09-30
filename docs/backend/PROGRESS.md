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
| `GET /v1/admin/orgs` | Platform admin NIP-98 key | Implemented |
| `POST /v1/admin/orgs/{id}/approve` | Platform admin NIP-98 key | Implemented |
| `POST /v1/admin/orgs/{id}/suspend` | Platform admin NIP-98 key | Implemented |
| `/v1/disbursements` routes | Not implemented | Planned |

## Current limitations

- Counsellor rosters are submitted to the API; automatic relay-to-database roster synchronization is
  not implemented.
- The client-side verification flow for the platform-signed approved-organisation list is not
  implemented.
- Lightning disbursement endpoints and payment-provider integration are not implemented.
- Relay configuration has no event-kind allowlist yet. NIP-42 authentication applies to direct
  messages, while other event kinds may still be published.
- Production TLS, public hostnames, and deployment configuration are not included in the local
  Compose setup.

## Verification

The test suite covers NIP-98 authentication, configuration signatures, CORS, NIP-05 validation,
organisation administration, counsellor roster rules, and worker behavior. Run the tests using the
instructions in [`../../backend/README.md`](../../backend/README.md).
