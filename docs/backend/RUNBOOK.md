# Resilience backend runbook

This guide runs the FastAPI API, PostgreSQL, the relay admission service, and both private Nostr
relays. Run commands from `backend/` unless a command says otherwise.

## 1. Services and local addresses

| Service | Local address | Purpose |
|---|---|---|
| FastAPI | `http://localhost:8000` | Configuration, directory, groups, and disbursements |
| OpenAPI UI | `http://localhost:8000/docs` | Interactive API schema and request bodies |
| OpenAPI JSON | `http://localhost:8000/openapi.json` | Machine-readable API schema |
| Relay 1 | `ws://localhost:7777` | Private Nostr WebSocket relay |
| Relay 2 | `ws://localhost:7778` | Independent private Nostr WebSocket relay |
| PostgreSQL | `localhost:5433` | Backend database |
| Relay policy | `relay-policy:50051` | Internal gRPC admission service; intentionally not public |

Production must use TLS: `https://` for the API and `wss://` for relays.

## 2. First-time setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

Generate and sign a throwaway local client configuration:

```bash
python scripts/sign_config.py --dev
```

Copy the printed `PLATFORM_PUBKEY=...` line into `.env`. The generated secret exists only for that
signing run; use an offline, backed-up signing key outside development.

Generate a development platform-admin key:

```bash
export ADMIN_SEC=$(openssl rand -hex 32)
python scripts/nostr_dev.py pubkey --sec "$ADMIN_SEC"
```

Put the printed public key—not `ADMIN_SEC`—in `ADMIN_PUBKEYS` in `.env`. Also replace
`RELAY_POLICY_HMAC_KEY` with an independent value from `openssl rand -hex 32`. Never commit `.env`
or any secret key.

## 3. Start and stop the whole application

Build and start every service:

```bash
docker compose up -d --build
docker compose ps
```

Expected services are `db`, `api`, `worker`, `relay-policy`, `relay-1`, and `relay-2`. `db` and
`api` should become `healthy`. The API is the only service that runs Alembic migrations; the
policy service waits for the API.

Follow logs:

```bash
docker compose logs -f api worker relay-policy relay-1 relay-2
```

Stop while keeping data:

```bash
docker compose down
```

Delete all local database and relay data only when intentionally starting over:

```bash
docker compose down -v
```

## 4. Basic health checks

```bash
curl -fsS http://localhost:8000/healthz | jq
curl -fsS http://localhost:8000/v1/config | jq
curl -fsS http://localhost:8000/openapi.json | jq '.info, .paths | keys'
```

The signed config must contain two distinct relay URLs. A `503` from `/v1/config` usually means
`PLATFORM_PUBKEY` is missing or the signed file was not generated. A `500` usually means the file
is expired, malformed, or signed by a different key.

## 5. Authentication

Public reads need no authentication. Protected calls use a signed NIP-98 event:

```bash
export API=http://localhost:8000
export USER_SEC=$(openssl rand -hex 32)
AUTH=$(python scripts/nostr_dev.py auth --sec "$USER_SEC" --url "$API/v1/whoami")
curl -fsS -H "Authorization: $AUTH" "$API/v1/whoami" | jq
```

For writes, the string passed to `--data` must be byte-for-byte identical to the curl body:

```bash
BODY='{"name":"Wangu Centre","domain":"wangu.org","directory_visibility":"public"}'
AUTH=$(python scripts/nostr_dev.py auth --sec "$USER_SEC" --url "$API/v1/orgs" \
  --method POST --data "$BODY")
curl -fsS -X POST -H "Authorization: $AUTH" -H 'Content-Type: application/json' \
  --data "$BODY" "$API/v1/orgs" | jq
```

Sensitive writes additionally require a one-use challenge. First request a challenge, then include
its exact scope and value in the signed operation:

```bash
python scripts/nostr_dev.py organization-approve \
  --sec "$ADMIN_SEC" --api "$API" --org-id "$ORG_ID"
```

The equivalent low-level calls are:

```bash
SCOPE="admin:org:approve:$ORG_ID"
BODY=$(jq -nc --arg scope "$SCOPE" '{scope:$scope}')
AUTH=$(python scripts/nostr_dev.py auth --sec "$ADMIN_SEC" \
  --url "$API/v1/auth/challenges" --method POST --data "$BODY")
CHALLENGE=$(curl -fsS -X POST -H "Authorization: $AUTH" \
  -H 'Content-Type: application/json' --data "$BODY" \
  "$API/v1/auth/challenges" | jq -r .challenge)
OP_AUTH=$(python scripts/nostr_dev.py auth --sec "$ADMIN_SEC" \
  --url "$API/v1/admin/orgs/$ORG_ID/approve" --method POST --data '' \
  --scope "$SCOPE" --challenge "$CHALLENGE")
curl -fsS -X POST -H "Authorization: $OP_AUTH" --data '' \
  "$API/v1/admin/orgs/$ORG_ID/approve" | jq
```

Challenges expire quickly, are bound to one public key and scope, and work only once.

## 6. API inventory

The authoritative request and response schemas are at `/docs` and `/openapi.json`.

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| GET | `/healthz` | Public | API and database health |
| GET | `/v1/config` | Public | Platform-signed client config and relay list |
| GET | `/v1/whoami` | NIP-98 | Verify the caller's signing setup |
| POST | `/v1/auth/challenges` | NIP-98 | Issue a short-lived scoped challenge |
| POST | `/v1/orgs` | NIP-98 root key | Apply as an organization |
| GET | `/v1/orgs` | Public | List approved organizations |
| GET | `/v1/orgs/me` | Root or active operational key | Recover the caller's pending or approved organization |
| GET | `/v1/orgs/{org_id}/dashboard` | Root or `verification` key | Organization portal status and counts |
| GET | `/v1/orgs/{org_id}/counsellors` | Public | Signed roster, authorization, revocation, and counselor states |
| GET | `/v1/orgs/{org_id}/operational-keys` | Root or `verification` key | List operational-key state |
| PUT | `/v1/orgs/{org_id}/operational-keys` | Root-signed body | Authorize an operational key |
| PUT | `/v1/orgs/{org_id}/operational-keys/{pubkey}/revoke` | Root-signed body | Emergency key cancellation |
| PUT | `/v1/orgs/{org_id}/roster` | Operational-key-signed body | Publish the counselor roster |
| PUT | `/v1/orgs/{org_id}/counsellors/{pubkey}/profile` | Counselor-signed body | Publish a public counselor profile |
| POST | `/v1/orgs/{org_id}/counselor-invites` | `verification` key + challenge | Create one-use counselor invitation |
| GET | `/v1/orgs/{org_id}/counselor-invites` | `verification` key | List invite metadata without raw codes |
| POST | `/v1/counselor-enrollments/claim` | Counselor NIP-98 | Claim invitation with signed profile |
| GET | `/v1/counselor-enrollments` | Counselor NIP-98 | Recover the caller's applications |
| GET | `/v1/counselor-enrollments/{id}` | Owning counselor NIP-98 | Read onboarding status |
| PUT | `/v1/counselor-enrollments/{id}/profile` | Owning counselor NIP-98 | Replace draft signed profile |
| PUT | `/v1/counselor-enrollments/{id}/credentials` | Counselor challenge scope | Submit NIP-44 v2 ciphertext |
| GET | `/v1/orgs/{org_id}/counselor-enrollments` | `verification` key | Review queue |
| POST | `/v1/orgs/{org_id}/counselor-enrollments/{id}/{decision}` | `verification` key + challenge | Request information, approve, or reject |
| GET | `/v1/admin/orgs?status=pending` | NIP-98 admin | List organizations by state |
| POST | `/v1/admin/orgs/{org_id}/approve` | Admin challenge scope | Approve after NIP-05 verification |
| POST | `/v1/admin/orgs/{org_id}/suspend` | Admin challenge scope | Suspend an organization |
| POST | `/v1/orgs/{org_id}/support-groups` | `groups` key + challenge | Create an opaque support group |
| PUT | `/v1/orgs/{org_id}/support-groups/{group_id}/members/{pubkey}` | `groups` key + challenge | Add/update a blinded membership |
| DELETE | `/v1/orgs/{org_id}/support-groups/{group_id}/members/{pubkey}` | `groups` key + challenge | Remove a membership |
| POST | `/v1/orgs/{org_id}/disbursements` | Counselor + challenge + idempotency key | Create and sign approval one |
| POST | `/v1/disbursements/{id}/approve` | `payments` key + challenge | Independent second approval |
| POST | `/v1/disbursements/{id}/invoice` | Requesting counselor | Attach the survivor's invoice after approval two |
| POST | `/v1/disbursements/{id}/paying` | `payments` key | Mark the payment as under way |
| POST | `/v1/disbursements/{id}/proof` | `payments` key | Submit the preimage; `PAID` if it matches |
| POST | `/v1/disbursements/{id}/cancel` | Requesting counselor or `payments` key | Cancel before payment starts |
| GET | `/v1/disbursements/{id}` | NIP-98 authorized party | Read the record and approval state |
| GET | `/v1/orgs/{org_id}/disbursements?state=` | Counselor (own) or `payments` key (all) | List requests |
| PUT | `/v1/admin/orgs/{org_id}/disbursement-limits` | Admin challenge scope | Set per-payment and daily caps |

Sensitive scopes are:

```text
admin:org:approve:<org UUID>
admin:org:suspend:<org UUID>
admin:org:limits:<org UUID>
group:create:<org UUID>
group:member:<group UUID>
disbursement:create:<org UUID>
disbursement:approve:<disbursement UUID>
counselor:invite:<org UUID>
counselor:credentials:<enrollment UUID>
counselor:review:<org UUID>
```

### Organization key and roster commands

Generate local root and operational keys:

```bash
export ORG_ROOT_SEC=$(openssl rand -hex 32)
export OP_SEC=$(openssl rand -hex 32)
export OP_PUB=$(python scripts/nostr_dev.py pubkey --sec "$OP_SEC")
```

Authorize the operational key for the needed responsibilities:

```bash
python scripts/nostr_dev.py authorize-key --sec "$ORG_ROOT_SEC" \
  --operational-pubkey "$OP_PUB" --scope roster --scope verification \
  --scope groups --scope payments \
  > /tmp/operational-key.json
curl -fsS -X PUT -H 'Content-Type: application/json' --data @/tmp/operational-key.json \
  "$API/v1/orgs/$ORG_ID/operational-keys" | jq
```

Publish a roster:

```bash
python scripts/nostr_dev.py roster --sec "$OP_SEC" --days 30 "$COUNSELLOR_PUB" \
  > /tmp/roster.json
curl -fsS -X PUT -H 'Content-Type: application/json' --data @/tmp/roster.json \
  "$API/v1/orgs/$ORG_ID/roster" | jq
```

Emergency cancellation uses the offline root key:

```bash
python scripts/nostr_dev.py revoke-key --sec "$ORG_ROOT_SEC" \
  --operational-pubkey "$OP_PUB" > /tmp/revocation.json
curl -fsS -X PUT -H 'Content-Type: application/json' --data @/tmp/revocation.json \
  "$API/v1/orgs/$ORG_ID/operational-keys/$OP_PUB/revoke" | jq
curl -fsS "$API/v1/orgs/$ORG_ID/counsellors" \
  | jq '{revocation:.roster_key_revocation, counsellors:[.counsellors[]|{pubkey,status}]}'
```

Every counselor derived from the cancelled key should immediately show `removed`, and the signed
revocation should be present in `roster_key_revocation`.

### Counselor enrollment workflow

The API exposes this workflow in Swagger at `http://localhost:8000/docs`. All writes use the same
NIP-98 and one-use challenge mechanism described above. In order, a client should:

For local development, create an invite in one command. `OP_SEC` must be an operational key with
the `verification` scope. Keep `REVIEW_SEC` private: the partner organisation needs it to decrypt
credential document keys, but the counselor receives only the returned invite code.

```bash
export REVIEW_SEC=$(openssl rand -hex 32)
export REVIEW_PUB=$(python scripts/nostr_dev.py pubkey --sec "$REVIEW_SEC")
python scripts/nostr_dev.py counselor-invite \
  --sec "$OP_SEC" --api "$API" --org-id "$ORG_ID" \
  --review-pubkey "$REVIEW_PUB"
```

The command requests a one-use challenge, signs both NIP-98 requests, and prints the invite JSON.
The raw `code` is returned only once.

1. Call `POST /v1/auth/challenges` with `counselor:invite:$ORG_ID`, then call
   `POST /v1/orgs/$ORG_ID/counselor-invites` using a `verification`-scoped operational key. The body
   supplies a dedicated credential-review encryption pubkey and an expiry of at most 168 hours.
   Save the returned code—the API shows it only once.
2. Generate the counselor identity locally. Sign the public profile with that key and claim the
   code at `POST /v1/counselor-enrollments/claim` using NIP-98 from the same key.
3. Encrypt each PDF/JPEG/PNG with a fresh AES-256-GCM key and NIP-44-wrap only that key to the
   invitation's `credential_recipient_pubkey`. Obtain scope
   `counselor:credentials:$ENROLLMENT_ID` and submit the hybrid ciphertext envelopes to
   `PUT /v1/counselor-enrollments/$ENROLLMENT_ID/credentials`.
4. The review key reads `GET /v1/orgs/$ORG_ID/counselor-enrollments?status=under_review`. A
   `verification`-scoped signer then obtains `counselor:review:$ORG_ID` and calls one of:
   `request-information`, `approve`, or `reject`.
5. After approval, publish a newer signed roster that includes the counselor pubkey. The API then
   activates the already-signed profile. Until this step, `directory_status` remains `null` and the
   counselor does not appear as verified.

Example request bodies are visible in OpenAPI. The encrypted document object is deliberately
minimal:

```json
{
  "documents": [{
    "v": 1,
    "algorithm": "aes-256-gcm+nip44-v2",
    "recipient_pubkey": "<64-char review pubkey>",
    "wrapped_key": "<canonical base64 NIP-44 v2 payload containing the AES key>",
    "iv": "<base64 12-byte AES-GCM nonce>",
    "ciphertext": "<base64 AES-GCM document ciphertext>",
    "media_type": "application/pdf"
  }]
}
```

Do not add legal names, filenames, license numbers, or other plaintext metadata to this payload.

### NIP-05 during local organization approval

The one-command local workflow selects the newest pending organization, creates a temporary
NIP-05 fixture, provisions a gitignored development admin identity, rebuilds the required
services, and sends the normal signed approval request:

```bash
.venv/bin/python scripts/local_approve_org.py
# Or select one explicitly:
.venv/bin/python scripts/local_approve_org.py --org-id <organization UUID>
```

The script never bypasses NIP-05, admin authentication, or scoped one-use challenges. It merely
hosts the expected document inside the local Compose network. Do not run its `nip05-dev` service
or use its generated admin identity in production.

The manual equivalent follows.

An organization must normally host `https://<domain>/.well-known/nostr.json?name=_`. For local
development, create the same file and serve it without putting the root key on the API server:

```bash
mkdir -p /tmp/resilience-nip05/.well-known
python scripts/nostr_dev.py nip05 --sec "$ORG_ROOT_SEC" \
  > /tmp/resilience-nip05/.well-known/nostr.json
python3 -m http.server 9000 --directory /tmp/resilience-nip05
```

Set `NIP05_DEV_BASE_URL=http://host.docker.internal:9000` in `.env`, then recreate `api` and
`worker`. This host name works with Docker Desktop. On Linux, use a reachable host-gateway address
or test against a real HTTPS NIP-05 file.

## 7. Access and test both relays

`curl` cannot speak the Nostr WebSocket protocol, but it can read each relay's NIP-11 document:

```bash
curl -fsS -H 'Accept: application/nostr+json' http://localhost:7777 | jq
curl -fsS -H 'Accept: application/nostr+json' http://localhost:7778 | jq
```

A TCP-only check confirms that each listener is reachable, not that Nostr works:

```bash
nc -vz localhost 7777
nc -vz localhost 7778
```

Run the live policy smoke test:

```bash
source .venv/bin/activate
python scripts/check_relays.py
```

It authenticates to each relay using NIP-42, verifies that a short-lived ephemeral guest wrap is
accepted, and verifies that an unauthorized stored wrap is denied. Expected output:

```text
ws://localhost:7777: NIP-42, guest retention, and relationship policy passed
ws://localhost:7778: NIP-42, guest retention, and relationship policy passed
```

Primal, Damus, and general-purpose Nostr clients may establish a connection, but they are not a
complete Resilience test because they do not necessarily implement the app's NIP-17/NIP-44/NIP-59
envelope rules, expiration policy, or group authorization flow. Use the PWA or smoke script.

The relay admission service is intentionally reachable only inside the Compose network. Both
relay configs point at `http://relay-policy:50051`. Treat any relay log saying it could not connect
to the authorization service as a security alert: upstream `nostr-rs-relay` is fail-open when that
gRPC service is unavailable.

## 8. Run automated tests

Create the isolated test database once:

```bash
docker compose up -d db
docker compose exec db psql -U resilience -tc \
  "select 1 from pg_database where datname='resilience_test'" | grep -q 1 \
  || docker compose exec db psql -U resilience -c 'create database resilience_test'
```

Focused security tests:

```bash
export TEST_DATABASE_URL=postgresql+psycopg://resilience:resilience@localhost:5433/resilience_test
pytest -q tests/test_relay_policy.py tests/test_groups.py \
  tests/test_disbursements.py tests/test_config.py tests/test_roster.py
```

All checks:

```bash
ruff check .
ruff format --check .
pytest -q
```

The test fixture drops and recreates the test database's `public` schema. Never point
`TEST_DATABASE_URL` at a database containing real data.

## 9. Troubleshooting

```bash
docker compose ps
docker compose logs --tail=200 api relay-policy relay-1 relay-2 db
```

- API is unhealthy: inspect migration or database errors in `api` logs.
- Relay logs report `could not connect to nostr authz GRPC server`: update to the current Compose
  file and recreate the policy and relay containers with
  `docker compose up -d --force-recreate relay-policy relay-1 relay-2`. The relays now wait until
  the policy gRPC port is healthy before starting.
- Docker Desktop on Apple Silicon may warn that the relay image is `linux/amd64` while the host is
  `linux/arm64/v8`. The pinned relay image runs under Docker's emulation; this warning alone does
  not mean startup failed.
- A relay still uses old policy: run `docker compose restart relay-1 relay-2` because relay config
  is read at startup.
- NIP-98 returns `401`: check the exact URL, method, body bytes, timestamp, and one-use event.
- Sensitive operation returns `403`: request a fresh challenge using the same key and exact scope.
- Organization approval returns `409`: inspect its NIP-05 file and ensure `names._` equals the
  organization root public key.
- `/v1/config` fails: regenerate it and copy the newly printed platform public key into `.env`.
