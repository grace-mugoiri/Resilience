# Resilience backend

FastAPI + PostgreSQL + a private Nostr relay.

- The design, and the rules behind it: [docs/backend/ARCHITECTURE.md](../docs/backend/ARCHITECTURE.md).
  Read section 1 before writing code.
- What has been built and decided so far: [docs/backend/PROGRESS.md](../docs/backend/PROGRESS.md).

## What runs

| Piece | What it does | Address on your laptop |
|---|---|---|
| API (`app/`) | FastAPI server: config, directory of organisations, request signing | `http://localhost:8000` |
| Worker (`python -m app.worker`) | Background jobs: replay-guard purge (1 min), NIP-05 re-check (6 h) | none |
| Database | PostgreSQL 16 | `localhost:5433` (Docker) |
| Relay | `nostr-rs-relay` 0.10.0 with login required (`relay/config.toml`) | `ws://localhost:7777` |

Docker's database is published on **5433**, not the usual 5432, so it does not clash with a
PostgreSQL you may already have installed on your laptop. Inside Docker it is still 5432.

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

Not built yet: emergency payments (`/v1/disbursements`), the worker pulling rosters from the
relay, and a deployed server. See PROGRESS.md.

## 1. What you need

- **Python 3.11 or newer.** Check with `python3 --version`. Ubuntu 24.04 ships 3.12.
- **Docker with Compose v2.** Check with `docker compose version`.
- **`jq`**, for reading JSON in the manual tests.

On Ubuntu:

```bash
sudo apt install python3-venv jq docker.io docker-compose-v2
sudo usermod -aG docker $USER      # then log out and back in, so docker works without sudo
```

## 2. First-time setup (once per machine)

All commands run from the `backend` folder.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

Sign the dev client config and put its key into `.env` in one go:

```bash
KEY=$(python scripts/sign_config.py --dev | grep PLATFORM_PUBKEY) && sed -i "s/^PLATFORM_PUBKEY=.*/$KEY/" .env
grep PLATFORM_PUBKEY .env
```

**Expect:** `PLATFORM_PUBKEY=` followed by 64 characters. `--dev` makes a new throwaway key each
time, so if you run it again, run the whole line again so `.env` gets the new key too.

Point `.env` at Docker's database (port 5433):

```bash
sed -i 's#@localhost:[0-9]*/resilience$#@localhost:5433/resilience#' .env
grep DATABASE_URL .env
```

**Expect:** `DATABASE_URL=postgresql+psycopg://resilience:resilience@localhost:5433/resilience`.
This only matters when you run the API or tests outside Docker. The containers get their own
database address from `docker-compose.yml`.

`.env`, `.venv` and the signed config are all in `.gitignore`, so none of them can be committed
by accident.

## 3. Every new terminal

```bash
cd ~/Documents/Btrust2/Resilience/backend     # or wherever your clone is
source .venv/bin/activate
```

Your prompt should start with `(.venv)`. If it does not, Python will not find the packages and you
will see errors such as `No module named 'coincurve'`.

## 4. Run it

There are two ways. Use **A** to see the whole backend running, or to give it to the frontend
team. Use **B** while you are changing backend code.

### A. Everything in Docker

```bash
docker compose up --build
```

This starts four containers: `db`, `relay`, `api` and `worker`. The API runs the database
migration itself when it starts. It keeps running and printing logs until you press Ctrl+C. It is
ready when you see:

```
backend-api-1  | Uvicorn running on http://0.0.0.0:8000
```

The relay prints nothing, because it only logs warnings (so no IP addresses end up in logs).

Check it from a second terminal:

```bash
docker compose ps                                  # 4 containers, api marked (healthy)
curl -s localhost:8000/healthz; echo               # {"status":"ok"}
curl -s localhost:8000/v1/config | jq .kind        # 30078
docker compose logs worker                         # empty is good
```

Useful commands:

| To | Run |
|---|---|
| Run in the background instead | `docker compose up -d --build` |
| See the logs of one piece | `docker compose logs -f api` |
| Stop everything, keep the data | `docker compose down` |
| Stop everything and wipe the database and relay data | `docker compose down -v` |
| Pick up code changes, or a newly signed config | `docker compose up --build` again |

The containers copy the code when they are built. If you change code or re-run
`sign_config.py`, rebuild with `--build`, or the containers keep running the old version.

### B. Day-to-day development

Run the database and relay in Docker, and the API directly on your laptop, so code changes show up
as soon as you save.

**Terminal 1:**

```bash
docker compose stop api worker     # frees port 8000 if the Docker API was running
docker compose up -d db relay
alembic upgrade head
uvicorn app.main:app --reload --port 8000 --no-access-log
```

**Expect:** `Running upgrade -> 0001` the first time (nothing after that), then
`Uvicorn running on http://127.0.0.1:8000`.

**Terminal 2 (only when you need background jobs):**

```bash
python -m app.worker
```

It prints nothing until it has something to do. Stop either one with Ctrl+C.

`--reload` restarts the API when you save a `.py` file, but **not** when you change `.env`.
After editing `.env`, stop the API with Ctrl+C and start it again.

## 5. Run the checks

Run these before every commit. They are the backend's version of the frontend team's
`npm run lint` and `npm test`, and CI runs the same three.

The tests use a separate database called `resilience_test`, which Docker does not create for you.
Create it once:

```bash
docker compose up -d db
sleep 3
docker compose exec db psql -U resilience -tc "select 1 from pg_database where datname='resilience_test'" | grep -q 1 \
  || docker compose exec db psql -U resilience -c "create database resilience_test"
```

Tell the tests where it is. Adding the line to the venv's activate script means every terminal
gets it from then on. Run this line **once**:

```bash
echo 'export TEST_DATABASE_URL=postgresql+psycopg://resilience:resilience@localhost:5433/resilience_test' >> .venv/bin/activate
source .venv/bin/activate
```

Then, any time:

```bash
ruff check .            # lint
ruff format --check .   # formatting (ruff format . fixes it)
pytest                  # all tests, about 3 seconds
```

**Expect:** `All checks passed!`, `... files already formatted`, `100 passed`.

`pytest -v` lists every test by name, which is a quick way to see what is checked. To run one
file: `pytest -v tests/test_roster.py`.

The tests **drop and recreate everything** in `resilience_test`. Never point `TEST_DATABASE_URL`
at a database you care about.

## 6. Try it by hand

Start the API with **4B** first (the API on your laptop, not in Docker). Then, in another
terminal:

### Basic checks

```bash
API=http://localhost:8000
sign() { python scripts/nostr_dev.py auth "$@"; }
TEST=$(printf '7f%.0s' $(seq 32))       # a test key; never use a real one here
```

| # | What it checks | Command | Expect |
|---|---|---|---|
| 1 | Health | `curl -s $API/healthz` | `{"status":"ok"}` |
| 2 | Signed relay list | `curl -s $API/v1/config \| jq -c '{kind,content}'` | `kind: 30078` with `ws://localhost:7777` in `content` |
| 3 | No signature | `curl -s -w " %{http_code}\n" $API/v1/whoami` | `missing 'Authorization...'` and `401` |
| 4 | Valid signature | `curl -s -w " %{http_code}\n" -H "Authorization: $(sign --sec $TEST --url $API/v1/whoami)" $API/v1/whoami` | a `pubkey` and `200` |
| 5 | Signed for another URL | `curl -s -w " %{http_code}\n" -H "Authorization: $(sign --sec $TEST --url http://127.0.0.1:8000/v1/whoami)" $API/v1/whoami` | `'u' tag does not match` and `401` |
| 6 | Signed for another method | `curl -s -w " %{http_code}\n" -H "Authorization: $(sign --sec $TEST --url $API/v1/whoami --method POST)" $API/v1/whoami` | `'method' tag does not match` and `401` |
| 7 | CORS, the web app's address | `curl -s -D - -o /dev/null -X OPTIONS -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: POST" $API/v1/whoami \| grep -i allow-origin` | `access-control-allow-origin: http://localhost:3000` |
| 8 | CORS, an unknown site | the same with `Origin: https://evil.example` | prints nothing |

Rows 3, 5, 6 and 8 are meant to be refusals: that is the protection working.

### The directory, end to end

This shows the whole trust chain: an organisation applies, the admin approves it only after its
website vouches for its key (NIP-05), the organisation publishes its counsellors, and the public
directory shows them. The organisation's "website" is a folder served from your laptop.

**One-time `.env` additions** (then restart the API in terminal 1 so it reads them):

```bash
ADMIN=$(printf 'ad%.0s' $(seq 32))
sed -i '/^ADMIN_PUBKEYS=/d;/^NIP05_DEV_BASE_URL=/d' .env
echo "ADMIN_PUBKEYS=$(python scripts/nostr_dev.py pubkey --sec $ADMIN)" >> .env
echo "NIP05_DEV_BASE_URL=http://localhost:9000" >> .env
grep -E "ADMIN_PUBKEYS|NIP05_DEV_BASE_URL" .env
```

`ADMIN_PUBKEYS` is the test admin's key. `NIP05_DEV_BASE_URL` tells the API to fetch
`nostr.json` from your laptop instead of the real `https://wangu.org`. The API ignores it unless
`APP_ENV` is `dev` or `test`.

**Terminal 2: the organisation's website.**

```bash
ORG=$(printf '0a%.0s' $(seq 32))
mkdir -p /tmp/site/.well-known
python scripts/nostr_dev.py nip05 --sec $ORG > /tmp/site/.well-known/nostr.json
cd /tmp/site && python -m http.server 9000
```

**Terminal 3: the requests.** Set up first (test keys only):

```bash
ADMIN=$(printf 'ad%.0s' $(seq 32)); ORG=$(printf '0a%.0s' $(seq 32)); API=http://localhost:8000
C1=$(python scripts/nostr_dev.py pubkey --sec $(printf '01%.0s' $(seq 32)))
C2=$(python scripts/nostr_dev.py pubkey --sec $(printf '02%.0s' $(seq 32)))
sign() { python scripts/nostr_dev.py auth "$@"; }
```

Then run the steps one at a time.

**1. The organisation applies, signed with its own key**

```bash
BODY='{"name":"Wangu Centre","domain":"wangu.org"}'
R=$(curl -s -H "Content-Type: application/json" -H "Authorization: $(sign --sec $ORG --url $API/v1/orgs --method POST --data "$BODY")" --data "$BODY" $API/v1/orgs)
echo "$R" | jq; ID=$(echo "$R" | jq -r .id); echo "ID=$ID"
```

Expect `"status": "pending"`, then `ID=` and a long id.

**2. The public cannot see it yet:** `curl -s $API/v1/orgs; echo` gives `[]`.

**3. The admin can see it**

```bash
curl -s -H "Authorization: $(sign --sec $ADMIN --url $API/v1/admin/orgs)" $API/v1/admin/orgs | jq -c '.[] | {name,status}'
```

Expect `{"name":"Wangu Centre","status":"pending"}`.

**4. The organisation tries to approve itself**

```bash
curl -s -w " %{http_code}\n" -X POST -H "Authorization: $(sign --sec $ORG --url $API/v1/admin/orgs/$ID/approve --method POST)" $API/v1/admin/orgs/$ID/approve
```

Expect `not a platform admin` and `403`.

**5. The admin approves it**

```bash
curl -s -w " %{http_code}\n" -X POST -H "Authorization: $(sign --sec $ADMIN --url $API/v1/admin/orgs/$ID/approve --method POST)" $API/v1/admin/orgs/$ID/approve
```

Expect `"status":"approved"` and `200`. Before approving, the server fetched the website's
`nostr.json` and confirmed it lists the organisation's key.

**6. Now it is public**

```bash
curl -s $API/v1/orgs | jq -c '.[] | {name,nip05,status}'
```

Expect `{"name":"Wangu Centre","nip05":"_@wangu.org","status":"approved"}`.

**7. The organisation publishes two counsellors**

```bash
python scripts/nostr_dev.py roster --sec $ORG $C1 $C2 > /tmp/r1.json
curl -s -X PUT -H "Content-Type: application/json" --data @/tmp/r1.json $API/v1/orgs/$ID/roster | jq .counsellors
```

Expect two keys.

**8. An impostor signs a list for the organisation**

```bash
python scripts/nostr_dev.py roster --sec $ADMIN $C1 > /tmp/bad.json
curl -s -w " %{http_code}\n" -X PUT -H "Content-Type: application/json" --data @/tmp/bad.json $API/v1/orgs/$ID/roster
```

Expect `roster must be signed by the organisation's own key` and `403`.

**9. The organisation removes C2**

```bash
sleep 1
python scripts/nostr_dev.py roster --sec $ORG $C1 > /tmp/r2.json
curl -s -X PUT -H "Content-Type: application/json" --data @/tmp/r2.json $API/v1/orgs/$ID/roster > /dev/null
curl -s $API/v1/orgs/$ID/counsellors | jq .counsellors
```

Expect one key. The `sleep 1` makes the new list newer than the old one.

**10. Someone replays the old list to bring C2 back**

```bash
curl -s -w " %{http_code}\n" -X PUT -H "Content-Type: application/json" --data @/tmp/r1.json $API/v1/orgs/$ID/roster | tail -c 80
```

Expect `a roster as new or newer is already stored` and `409`.

**11. The website goes down for a while.** Press Ctrl+C in terminal 2, then:

```bash
python -c "from app.worker import recheck_nip05; print(recheck_nip05())"
curl -s $API/v1/orgs | jq length
```

Expect `{'verified': 0, 'suspended': 0, 'unreachable': 1}`, then `1`: a site being down is not
proof of anything, so the organisation stays listed. Restart the site in terminal 2 with
`python -m http.server 9000`.

**12. The website stops vouching for the organisation's key**

```bash
python scripts/nostr_dev.py nip05 --sec $ADMIN > /tmp/site/.well-known/nostr.json
python -c "from app.worker import recheck_nip05; print(recheck_nip05())"
curl -s $API/v1/orgs; echo
```

Expect `{'verified': 0, 'suspended': 1, 'unreachable': 0}`, then `[]`.

**To run the walkthrough again from step 1**, empty the directory first (otherwise step 1 gives
`409 already applied`):

```bash
docker compose exec db psql -U resilience -c "delete from counsellor_attestations; delete from roster_events; delete from organizations"
```

**When you are done:** Ctrl+C in terminals 1 and 2, then
`rm -rf /tmp/site /tmp/r1.json /tmp/r2.json /tmp/bad.json`.

The `ADMIN_PUBKEYS` and `NIP05_DEV_BASE_URL` values above are for testing only. A real server gets
a real admin key and no `NIP05_DEV_BASE_URL`.

## 7. When something goes wrong

| You see | Why | Fix |
|---|---|---|
| `No module named 'coincurve'` (or any `No module named`) | The venv is not active, or packages are not installed | `source .venv/bin/activate`, then `pip install -r requirements-dev.txt` |
| `bind: address already in use` on `5432` or `5433` | Another PostgreSQL is using that port | `sudo ss -ltnp \| grep 543` to see what; change the left number in `ports` for `db` in `docker-compose.yml`, and the port in `.env` |
| `address already in use` on `8000` | The Docker API and a uvicorn are both running | `docker compose stop api worker`, or stop the uvicorn with Ctrl+C |
| Every test errors with `OperationalError: connection failed` | The tests cannot reach `resilience_test` | Check `echo $TEST_DATABASE_URL` shows port 5433, the database is up (`docker compose up -d db`) and `resilience_test` exists (section 5) |
| `database "resilience_test" does not exist` | Docker only creates `resilience` | The create command in section 5 |
| You changed `.env` but the API behaves the same | `.env` is read once, at start-up | Ctrl+C the API and start it again (`docker compose up --build` for Docker) |
| `/v1/config` returns `503` | `PLATFORM_PUBKEY` is empty or the signed file is missing | Re-run the signing line in section 2 (and `--build` if using Docker) |
| `/v1/config` returns `500 ... does not verify` | `.env` key and signed file are from different runs | Re-run the signing line in section 2 (it updates both) |
| `NIP-05 check failed: could not reach the site` when approving | The fake website in terminal 2 is not running, or `NIP05_DEV_BASE_URL` is not in `.env` | Start it, check `.env`, restart the API |
| `409 this domain or key has already applied` | You already ran step 1 | Empty the directory (end of section 6) |
| `sign: command not found` | `sign` only exists in the terminal where you defined it | Paste the `sign() { ... }` line again |
| `perl: warning: Setting locale failed` | Your laptop's region setting (`sw_KE`) is not installed where `psql` runs | Harmless. Hide it with `export LC_ALL=C.UTF-8` |

If none of these match, run the failing command again and keep the full error text.

## Calling a protected endpoint (NIP-98)

Sign a kind `27235` event with tags `["u", "<full public URL incl. query>"]`,
`["method", "GET"]`, and for POST/PUT/PATCH `["payload", "<sha256 hex of the body>"]`.
Base64 the JSON and send `Authorization: Nostr <base64>`.

`scripts/nostr_dev.py auth` does all of that for test keys (see section 6). With `nak`:

```bash
nak event -k 27235 -t u=http://localhost:8000/v1/whoami -t method=GET --sec <hex> \
  | base64 -w0 | xargs -I{} curl -s -H "Authorization: Nostr {}" localhost:8000/v1/whoami
```

The `u` tag must be the **public** URL (`PUBLIC_API_BASE` + path). Behind a proxy the server
never compares against the URL it sees internally.

## Settings (`.env`)

| Setting | What it is |
|---|---|
| `APP_ENV` | `dev` locally. `test` is set by the tests. Anything else counts as production. |
| `DATABASE_URL` | The database the API and worker use outside Docker. |
| `PUBLIC_API_BASE` | The public address clients sign in NIP-98. On a server, the `https://` address. |
| `CORS_ORIGINS` | Exact web app addresses, comma separated. `*` is refused at startup. |
| `PLATFORM_PUBKEY` | Public key of the platform key that signed the client config. |
| `SIGNED_CONFIG_PATH` | Where the signed config lives. |
| `NIP98_WINDOW_SECONDS` | How old a signed request may be. Default 60. |
| `ADMIN_PUBKEYS` | Hex keys allowed to approve and suspend organisations, comma separated. |
| `NIP05_DEV_BASE_URL` | Dev and test only: where to fetch `nostr.json` instead of the org's real site. |

## Where things are

```
backend/
  app/
    main.py            the FastAPI app and its routers
    settings.py        reads .env
    auth/              NIP-98 request signing, admin check
    nostr/events.py    Nostr event signing and verification
    directory/         NIP-05 check, roster parsing, directory logic
    routers/           the endpoints: health, config, whoami, orgs, admin
    db/                database models and connection
    worker.py          background jobs
  migrations/          database migrations (Alembic)
  scripts/
    sign_config.py     signs the client config
    nostr_dev.py       test keys, signed headers, nostr.json and rosters for manual testing
  tests/               pytest tests
  config/              the client config (unsigned, and the signed copy you generate)
  docker-compose.yml   db, relay, api, worker
relay/config.toml      the relay's settings
docs/backend/          ARCHITECTURE.md and PROGRESS.md
```

## Adding a migration

Change `app/db/models.py`, then `alembic revision --autogenerate -m "what changed"`, read the
generated file, and run `alembic upgrade head`. One migration per feature.
