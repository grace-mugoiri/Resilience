# Frontend API and relay integration

The frontend talks to FastAPI for public directory data, signed relay configuration,
organization administration, support-group membership and disbursement coordination. Private
messages never pass through FastAPI; they are encrypted locally and sent to both configured Nostr
relays.

## Local configuration

Copy `.env.example` to `.env.local`:

```dotenv
VITE_API_BASE=http://localhost:8000
VITE_PLATFORM_PUBKEY=<the PLATFORM_PUBKEY value from ../Resilience/backend/.env>
```

`VITE_PLATFORM_PUBKEY` is a trust anchor, not a secret. It must come from the deployment process,
not from an API response. Restart Vite after changing either value.

Start the backend and frontend in separate terminals:

```bash
cd ../Resilience/backend
docker compose up -d --build
```

```bash
cd ../Resilience-frontend
npm ci
npm run dev
```

## Public API

Public reads never send cookies or a referrer:

```ts
import { publicApi } from './src/api'

const health = await publicApi.health()
const organizations = await publicApi.listOrganizations()
const directory = await publicApi.listCounselors(organizations[0].id)
```

The existing counselor directory additionally verifies the signed roster, root authorization,
revocation and counselor profile events in the browser.

## Authenticated API

NIP-98 headers are generated just before each request. Private keys remain inside the vault's
callback and are never returned, stored in React state or sent to FastAPI:

```ts
import { createAuthenticatedApi } from './src/api'
import { accountVault } from './src/security/vault'

await accountVault.unlock(pin)
const api = createAuthenticatedApi((operation) => accountVault.withPrivateKey(operation))
const identity = await api.whoAmI()
```

For sensitive operations the client automatically:

1. signs `POST /v1/auth/challenges` with ordinary NIP-98;
2. requests the exact operation scope;
3. signs the operation with the one-use challenge, scope and a client nonce.

The transmitted JSON string is created once and the NIP-98 `payload` tag hashes those exact bytes.

## Available methods

| Client method | Backend endpoint | Authorization |
| --- | --- | --- |
| `health` | `GET /healthz` | Public |
| `clientConfiguration` | `GET /v1/config` | Public + platform signature |
| `whoAmI` | `GET /v1/whoami` | NIP-98 |
| `createChallenge` | `POST /v1/auth/challenges` | NIP-98 |
| `listOrganizations` | `GET /v1/orgs` | Public |
| `applyOrganization` | `POST /v1/orgs` | NIP-98 root identity |
| `listCounselors` | `GET /v1/orgs/{id}/counsellors` | Public + event verification |
| `publishRoster` | `PUT /v1/orgs/{id}/roster` | Signed Nostr event body |
| `authorizeOperationalKey` | `PUT /v1/orgs/{id}/operational-keys` | Root-signed event body |
| `revokeOperationalKey` | `PUT /v1/orgs/{id}/operational-keys/{key}/revoke` | Root-signed event body |
| `publishCounselorProfile` | `PUT /v1/orgs/{id}/counsellors/{key}/profile` | Counselor-signed event body |
| `listSupportGroups` | `GET /v1/support-groups` | Public |
| `groupMembership` | `GET /v1/support-groups/{id}/membership` | NIP-98 member identity |
| `joinSupportGroup` | `POST /v1/support-groups/{id}/join` | NIP-98 member identity |
| `leaveSupportGroup` | `DELETE /v1/support-groups/{id}/membership` | NIP-98 member identity |
| `supportGroupRecipients` | `GET /v1/support-groups/{id}/recipients` | Active member NIP-98 |
| `refreshSupportGroupRoutingKey` | `PUT /v1/support-groups/{id}/routing-key` | Active member NIP-98 |
| `circleStatus` | `GET /v1/circle` | NIP-98 circle identity |
| `createCircleInvite` | `POST /v1/circle/invites` | NIP-98 circle identity |
| `claimCircleInvite` | `POST /v1/circle/invites/claim` | NIP-98 circle identity |
| `circleRecipients` | `GET /v1/circle/recipients` | Active member NIP-98 |
| `refreshCircleRoutingKey` | `PUT /v1/circle/routing-key` | Active member NIP-98 |
| `removeCircleMember` | `DELETE /v1/circle/{id}/members/{key}` | Circle member NIP-98 |
| `blockPeer` / `unblockPeer` | `PUT` / `DELETE /v1/blocks/{key}` | NIP-98 |
| `createReport` | `POST /v1/reports` | NIP-98 |
| `setCounselorAvailability` | `PUT /v1/counselors/me/availability` | Verified counselor NIP-98 |
| `createSupportGroup` | `POST /v1/orgs/{id}/support-groups` | Scoped challenge + groups key |
| `putSupportGroupMember` | `PUT .../members/{key}` | Scoped challenge + groups key |
| `removeSupportGroupMember` | `DELETE .../members/{key}` | Scoped challenge + groups key |
| `createDisbursement` | `POST /v1/orgs/{id}/disbursements` | Scoped challenge + counselor key |
| `approveDisbursement` | `POST /v1/disbursements/{id}/approve` | Scoped challenge + payments key |
| `getDisbursement` | `GET /v1/disbursements/{id}` | NIP-98 |
| `listDisbursements` | `GET /v1/orgs/{id}/disbursements` | Counselor or payments key NIP-98 |
| `listAdminOrganizations` | `GET /v1/admin/orgs` | NIP-98 platform admin |
| `approveOrganization` | `POST /v1/admin/orgs/{id}/approve` | Scoped challenge + platform admin |
| `suspendOrganization` | `POST /v1/admin/orgs/{id}/suspend` | Scoped challenge + platform admin |

Offline root-key events should normally be produced on a dedicated offline device and passed to
`authorizeOperationalKey` or `revokeOperationalKey`; do not import an organization root secret
into the everyday PWA.

## Signed relay configuration

`GET /v1/config` is accepted only when the client confirms:

- the event signature and configured platform signer;
- kind `30078` and `d=resilience/client-config`;
- one unexpired `expiration` tag and a reasonable creation time;
- schema version 1;
- at least two unique, credential-free WebSocket URLs;
- `wss://` URLs when the PWA itself is served over HTTPS;
- a valid optional approved-organizations list address.

The messaging client uses the resulting relays for NIP-42 authentication, NIP-59 gift wraps,
dual-relay delivery, retries and subscriptions.

## Group, circle, and message-request delivery

FastAPI is the membership control plane; it never receives message content. Once unlocked, the
PWA requests the current recipient keys and opaque room ID, then creates one NIP-17 gift wrap per
recipient and sends every wrap to both relays.

- Support-group messages use the `group.message` encrypted payload type.
- A membership change rotates the opaque room ID, preventing a removed member from following the
  next room history.
- Circle member cards use authenticated recipient discovery, while one-to-one circle messages use
  ordinary `chat.message` payloads.
- Private requests between group members use `message.request` and
  `message.request.accept` payloads. Ignoring a request sends nothing back.
- A `409` routing-key migration response causes the PWA to reissue its own encrypted routing key
  and retry recipient discovery.

The returned public keys are used only for encrypted delivery. The UI shows local pseudonymous
labels and never exposes a searchable member directory.

## Counselor support requests

The counselor screen creates a challenge-bound disbursement record with amount, reason, and an
optional non-identifying note. It never sends a survivor key, nickname, phone number, location, or
account ID. The counselor wallet calls `listDisbursements` and therefore sees only requests signed
by that counselor; an organization payments key receives the full organization queue.

## Tests

```bash
npm run lint
npm test
npm run build
```

The API tests use local fake fetch functions and real Nostr signatures. For an end-to-end check,
run the backend stack and then use a browser identity that the backend has authorized for the
operation being tested.
