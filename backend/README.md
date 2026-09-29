# Resilience backend

FastAPI + PostgreSQL + a private Nostr relay. The design, and the rules behind it, are in
[docs/backend/ARCHITECTURE.md](../docs/backend/ARCHITECTURE.md). Read section 1 before writing code.

## What works today

- `GET /healthz`: checks the database.
- `GET /v1/config`: the client config (trusted relays, approved-orgs list address), served as a
  Nostr event signed by the platform key. The server refuses to serve it if the signature does
  not match `PLATFORM_PUBKEY`.
- `GET /v1/whoami`: returns your pubkey if your NIP-98 header is valid. Use it to test signing.
- The directory of verified organisations and counsellors:
  - `POST /v1/orgs`: an organisation applies, signed (NIP-98) with its own key.
  - `GET /v1/admin/orgs?status=pending`, `POST /v1/admin/orgs/{id}/approve`,
    `POST /v1/admin/orgs/{id}/suspend`: admin only (`ADMIN_PUBKEYS`). Approval runs the NIP-05
    check and is refused unless `https://<domain>/.well-known/nostr.json` lists the org's key.
  - `PUT /v1/orgs/{id}/roster`: the organisation's signed counsellor list (kind 30000,
    `d=verified-counsellors`, with an `expiration` tag). Older rosters are refused.
  - `GET /v1/orgs` and `GET /v1/orgs/{id}/counsellors`: public, no auth. The counsellors
    response includes the signed roster so the client can check the signature itself.
- NIP-98 auth dependency (`app/auth/nip98.py`), CORS locked to exact origins.
- The full database schema (migration `0001`).
- Worker: purges old replay-protection ids every minute, and re-runs the NIP-05 check on
  approved organisations every 6 hours (suspending any whose website stops vouching).

## Run it locally (no Docker)

You need Python 3.11+ and a PostgreSQL 16 server.

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                  # then edit DATABASE_URL if needed
python scripts/sign_config.py --dev   # copy the PLATFORM_PUBKEY line it prints into .env
alembic upgrade head
uvicorn app.main:app --reload --no-access-log
```

Worker, in a second terminal: `python -m app.worker`

## Run it with Docker

```bash
cd backend
cp .env.example .env && python scripts/sign_config.py --dev   # paste PLATFORM_PUBKEY into .env
docker compose up --build
```

API on `http://localhost:8000`, relay on `ws://localhost:7777`, Postgres on `5432`.

## Checks (run these before every PR)

The frontend team runs `npm run lint` and `npm test`. The backend equivalents:

```bash
ruff check .            # lint
ruff format --check .   # formatting (ruff format . to fix)
pytest                  # tests; needs Postgres, database name from TEST_DATABASE_URL
```

Tests use `resilience_test` by default and **drop and recreate its schema**. Never point
`TEST_DATABASE_URL` at a database you care about.

CI runs the same three checks on every push that touches `backend/` or `relay/`.

## Calling a protected endpoint (NIP-98)

Sign a kind `27235` event with tags `["u", "<full public URL incl. query>"]`,
`["method", "GET"]`, and for POST/PUT/PATCH `["payload", "<sha256 hex of the body>"]`.
Base64 the JSON and send `Authorization: Nostr <base64>`. With `nak`:

```bash
nak event -k 27235 -t u=http://localhost:8000/v1/whoami -t method=GET --sec <hex> \
  | base64 -w0 | xargs -I{} curl -s -H "Authorization: Nostr {}" localhost:8000/v1/whoami
```

The `u` tag must be the **public** URL (`PUBLIC_API_BASE` + path). Behind a proxy the server
never compares against the URL it sees internally.

## Try the directory by hand

This walks through the whole flow with test keys: an organisation applies, the admin approves it
after the NIP-05 check, the organisation publishes its counsellors, and the public directory
shows them. The organisation's "website" is a folder served on your own machine, which is what
`NIP05_DEV_BASE_URL` is for. Run the API with uvicorn (not in Docker) for this, so it can reach
that folder on `localhost`.

**Terminal 1: database and API.** If you use Docker for Postgres, start only the database and
check which port it is on:

```bash
cd backend && source .venv/bin/activate
docker compose up -d db
docker compose stop api worker          # frees port 8000 if they were running
docker compose port db 5432             # e.g. 0.0.0.0:5433
```

Put that port in `DATABASE_URL` in `.env`. Then set the test keys and start the API:

```bash
ADMIN=$(printf 'ad%.0s' $(seq 32)); ORG=$(printf '0a%.0s' $(seq 32))
export ADMIN_PUBKEYS=$(python scripts/nostr_dev.py pubkey --sec $ADMIN)
export NIP05_DEV_BASE_URL=http://localhost:9000
alembic upgrade head
uvicorn app.main:app --port 8000 --no-access-log
```

**Terminal 2: the organisation's website.**

```bash
cd backend && source .venv/bin/activate
ORG=$(printf '0a%.0s' $(seq 32))
mkdir -p /tmp/site/.well-known
python scripts/nostr_dev.py nip05 --sec $ORG > /tmp/site/.well-known/nostr.json
cd /tmp/site && python -m http.server 9000
```

**Terminal 3: the requests.**

```bash
cd backend && source .venv/bin/activate
ADMIN=$(printf 'ad%.0s' $(seq 32)); ORG=$(printf '0a%.0s' $(seq 32)); API=http://localhost:8000
sign() { python scripts/nostr_dev.py auth "$@"; }
```

| # | What | Command | Expect |
|---|---|---|---|
| 1 | Org applies | `BODY='{"name":"Wangu Centre","domain":"wangu.org"}'; curl -s -H "Content-Type: application/json" -H "Authorization: $(sign --sec $ORG --url $API/v1/orgs --method POST --data "$BODY")" --data "$BODY" $API/v1/orgs \| jq` | `"status": "pending"` |
| 2 | Save its id | `ID=<the id from step 1>` | |
| 3 | Public list | `curl -s $API/v1/orgs` | `[]` (pending orgs are hidden) |
| 4 | Admin sees it | `curl -s -H "Authorization: $(sign --sec $ADMIN --url $API/v1/admin/orgs)" $API/v1/admin/orgs \| jq` | the org, pending |
| 5 | Org tries to approve itself | `curl -s -X POST -H "Authorization: $(sign --sec $ORG --url $API/v1/admin/orgs/$ID/approve --method POST)" $API/v1/admin/orgs/$ID/approve` | `not a platform admin` |
| 6 | Admin approves | same, with `--sec $ADMIN` | `"status": "approved"` |
| 7 | Public list | `curl -s $API/v1/orgs \| jq` | the org, with `"nip05": "_@wangu.org"` |
| 8 | Org publishes 2 counsellors | `C1=$(python scripts/nostr_dev.py pubkey --sec $(printf '01%.0s' $(seq 32))); C2=$(python scripts/nostr_dev.py pubkey --sec $(printf '02%.0s' $(seq 32))); python scripts/nostr_dev.py roster --sec $ORG $C1 $C2 > /tmp/r1.json; curl -s -X PUT -H "Content-Type: application/json" --data @/tmp/r1.json $API/v1/orgs/$ID/roster \| jq .counsellors` | two keys |
| 9 | Someone else signs a roster for the org | `python scripts/nostr_dev.py roster --sec $ADMIN $C1 > /tmp/bad.json; curl -s -X PUT -H "Content-Type: application/json" --data @/tmp/bad.json $API/v1/orgs/$ID/roster` | `must be signed by the organisation's own key` |
| 10 | Org removes C2 (wait a second first) | `python scripts/nostr_dev.py roster --sec $ORG $C1 > /tmp/r2.json; curl -s -X PUT -H "Content-Type: application/json" --data @/tmp/r2.json $API/v1/orgs/$ID/roster \| jq .counsellors` | one key |
| 11 | Replay the old roster | `curl -s -X PUT -H "Content-Type: application/json" --data @/tmp/r1.json $API/v1/orgs/$ID/roster` | `a roster as new or newer is already stored` |
| 12 | Website changes its key, worker runs | `python scripts/nostr_dev.py nip05 --sec $ADMIN > /tmp/site/.well-known/nostr.json; python -c "from app.worker import recheck_nip05; print(recheck_nip05())"; curl -s $API/v1/orgs` | `'suspended': 1`, then `[]` |

For step 12, run `export NIP05_DEV_BASE_URL=http://localhost:9000` in terminal 3 first, and
put the same `DATABASE_URL` port there if you changed it only in the shell.

Clean up: Ctrl+C in terminals 1 and 2, then `rm -rf /tmp/site /tmp/r1.json /tmp/r2.json /tmp/bad.json`.

## Adding a migration

Change `app/db/models.py`, then `alembic revision --autogenerate -m "what changed"`, read the
generated file, and run `alembic upgrade head`. One migration per feature.
