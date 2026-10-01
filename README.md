# Resilience

# THE ARHITECTURE
- a hybrid architecture: Nostr for identity and encrypted communication, private relays for transport, and a conventional backend for regulated or operational workflows.

| Layer | Responsibility in Resilience |
|---|---|
| Nostr protocol | Keys, signed identities, encrypted messages, counselor attestations, invitations and selected wallet communication |
| Relays | Store-and-forward encrypted events, offline delivery, access control, retention and rate limiting |
| Backend | Credential review, resource directory, abuse handling, grants, M-Pesa payouts, push notifications and administrative workflows |
| Device only | PIN, private key, backup words, guest session data and private records |

## What should use Nostr

### 1. Pseudonymous accounts

Each account receives a Nostr keypair:

- Public key: account identity
- Private key: generated and encrypted locally
- PIN: unlocks the encrypted private key
- Backup words: restore the key

The private key should never be transmitted to your backend or relay.

Counselors, survivors and organizations can all have Nostr identities, but their public keys should generally not be exposed in the UI.

### 2. Private one-to-one conversations

Use:

- [NIP-17 private direct messages](https://github.com/nostr-protocol/nips/blob/master/17.md)
- [NIP-44 encryption](https://github.com/nostr-protocol/nips/blob/master/44.md)
- [NIP-59 gift wrapping](https://github.com/nostr-protocol/nips/blob/master/59.md)

The app creates and encrypts the message locally, then publishes only the encrypted gift-wrapped event.

This fits:

- Survivor ↔ counselor chats
- Circle conversations
- Message requests
- Referrals
- Private resource sharing
- Organization ↔ counselor communication

NIP-17 supports rooms with more than two participants, although changing participants creates a new room with clean history.

### 3. Counselor verification

The organization should sign an attestation containing:

- Counselor public key
- Verification status
- Issuing organization
- Expiration date
- Permitted support categories
- Optional license-confirmed flag

I would make this a Resilience-specific signed event initially. NIP-58 badges are possible, but public badges can expose associations. The attestation shown to survivors should contain no uploaded documents or legal identity.

### 4. Counselor availability and profile

Signed replaceable events could store:

- Display name
- Languages
- Focus areas
- Availability
- Working hours
- Verification reference

Sensitive profile fields should be encrypted or stored only on your restricted relay.

### 5. Invitations

Circle, counselor and group invitations can be signed, encrypted events containing:

- Random invitation token
- Inviting identity
- Expiration
- Intended role
- One-time-use marker

The backend or private relay still needs to enforce “used once” atomically.

### 6. Lightning wallet communication

[NIP-47 Nostr Wallet Connect](https://github.com/nostr-protocol/nips/blob/master/47.md) is appropriate for communication between Resilience and an organization-controlled Lightning wallet. NWC sends encrypted wallet requests through relays.

I would avoid public NIP-57 zap receipts for survivor payments because they can reveal payment relationships. NIP-57 defines public-facing zap requests and receipts, which is useful socially but a poor default for this threat model. [NIP-57 specification](https://github.com/nostr-protocol/nips/blob/master/57.md)

## What the relay should do

I recommend operating dedicated Resilience relays instead of sending sensitive traffic to arbitrary public relays.

The relay should:

- Accept encrypted NIP-17 messages
- Deliver messages while recipients are offline
- Require authenticated connections
- Restrict queries to authorized recipients
- Apply rate limits and spam protection
- Enforce event expiration
- Restrict counselor and organization event kinds
- Prevent broad enumeration of users
- Keep short retention windows where appropriate
- Replicate encrypted messages across two independent relays

Use [NIP-42 relay authentication](https://github.com/nostr-protocol/nips/blob/master/42.md) for restricted subscriptions and publishing. Authentication is connection-scoped and does not need to appear inside stored events.

A relay should not:

- Receive private keys
- Decrypt messages
- Store counselor credentials
- Store backup words
- Decide grant eligibility
- Process M-Pesa transfers
- Know survivors’ real identities

### Support groups

[NIP-29](https://github.com/nostr-protocol/nips/blob/master/29.md) provides relay-managed groups and access control, but it is not automatically an end-to-end private group system. Group IDs, membership activity and relay relationships can still become sensitive.

For Resilience I would start with:

- Private Resilience relay
- NIP-42 authentication
- Encrypted group-message payloads
- Random group identifiers
- No public member list
- Membership enforced by the relay
- Membership changes producing new encryption state

Do not use ordinary public Nostr channels for survivor support groups.

## What should remain conventional backend code

### Counselor credential review

The backend handles:

- Invite-code issuance
- One-time invite consumption
- Encrypted credential upload
- Organization review queues
- Requests for clearer documents
- Verification renewal and revocation
- Audit records

Documents should go directly to encrypted organization-controlled storage—not Nostr relays.

### Resource directory

The backend or signed content service manages:

- Shelters
- Legal support
- Medical services
- Operating hours
- Verification dates
- Area selection
- Rights articles
- Offline resource bundles

You could publish signed resource snapshots through Nostr later, but a database and editorial workflow will be much easier initially.

### Reports and safety operations

Backend responsibilities include:

- Counselor or group reports
- Abuse-review queues
- Blocking enforcement
- Counselor suspension
- Organization audit trails
- Emergency escalation policies
- Rate limiting and anti-spam

The message itself should only be included when the survivor explicitly enables “share recent messages.”

### Money and payouts

The backend must manage:

- Organization pooled funds
- Grant approval
- Counselor payments
- Internal KES ledger
- Bitcoin/KES conversion records
- Lightning settlement
- M-Pesa payout integration
- Idempotency and reconciliation
- Withdrawal scheduling
- Regulatory and accounting requirements

Nostr can transport wallet commands, but it should not be the authoritative financial ledger.

### Notifications

A backend notification service should send generic messages such as:

> You have a new update.

It must never include:

- Sender
- Counselor name
- Group name
- Message content
- Grant information

## What should stay only on the device

- Decrypted messages
- Guest conversations
- PIN
- Private key
- Backup words
- Local health records
- Saved resources
- Drafts
- Auto-exit state
- Guest identity

“Delete locally” must be described honestly. Nostr deletion requests do not guarantee that every relay or recipient removed a copy.

## Recommended architecture

```text
Resilience PWA
  ├── Local encrypted vault
  │     Keys, PIN, records, cached messages
  │
  ├── Nostr protocol layer
  │     NIP-17 + NIP-44 + NIP-59
  │
  ├── Private Resilience relays
  │     Encrypted delivery, ACLs, expiration
  │
  └── Resilience API
        Counselor review
        Resources CMS
        Reporting
        Grants and ledger
        Lightning/M-Pesa
        Push notifications
```

The most important principle is:

> Use Nostr for signed, encrypted communication—not as a replacement for every database.

Also note that NIP-44 explicitly acknowledges limits around metadata hiding, forward secrecy and post-compromise security in relay-based messaging. For a survivor-safety application, I’d commission a threat-model review before treating Nostr messaging as production-ready. [NIP-44 security considerations](https://github.com/nostr-protocol/nips/blob/master/44.md)


# STRUCTURE

## Integrations needed for this backend

### 1. Nostr relay integration

Use the existing Python `nostr-sdk` dependency to:

- Connect to configured WebSocket relays
- Publish signed events
- Subscribe using filters
- Receive encrypted messages
- Reconnect automatically
- Track accepted or rejected relay writes

Configuration would look approximately like:

```env
NOSTR_RELAYS=wss://relay-one.example,wss://relay-two.example
NOSTR_CONNECT_TIMEOUT=10
NOSTR_PUBLISH_TIMEOUT=10
```

### 2. Key-management integration

We need distinct key strategies:

- Survivor keys: created and encrypted in the client
- Counselor keys: created in the client
- Organization key: stored in a secrets manager
- Backend service key: separate restricted key, if necessary
- Relay authentication: NIP-42

The API must never receive a survivor’s private key.

### 3. Private-message integration

Implement:

- NIP-17 message structure
- NIP-44 encryption
- NIP-59 gift wrapping
- Recipient relay routing
- Local or encrypted message persistence
- Delivery and retry status

Ideally encryption and signing happen in the PWA. The backend should primarily coordinate relay selection and organization-owned messages.

### 4. Cryptographic validation

Replace the placeholder validator with actual verification of:

- Event serialization
- Event ID hash
- Schnorr signature
- Public key format
- Timestamp tolerance
- Allowed event kinds
- Required tags
- Maximum content size
- Replay protection

`nostr-sdk` should perform the cryptographic verification instead of custom handwritten crypto.

### 5. Private relay deployment

Deploy at least one controlled relay, preferably two for resilience.

The relay requires:

- TLS/WSS
- NIP-42 authentication
- Restricted subscriptions
- Event-kind allowlists
- Rate limits
- Maximum event sizes
- Retention policies
- Monitoring
- Backups
- No public user enumeration

A relay such as `strfry` is a reasonable starting point, but its admission and query policies must be customized for Resilience.

### 6. PostgreSQL integration

PostgreSQL should store operational state—not decrypted conversations.

Suggested tables:

```text
organizations
counselor_invites
counselor_profiles
credential_submissions
verification_attestations
resource_directory
reports
blocks
support_requests
wallet_ledger
payouts
relay_delivery_attempts
```

Avoid storing:

- Private keys
- Backup words
- Decrypted survivor messages
- Guest conversations
- Unnecessary real-world identity data

### 7. Credential-storage integration

Counselor credentials need encrypted object storage, for example:

- S3-compatible private bucket
- Short-lived signed upload URLs
- Organization-specific encryption keys
- Automatic document expiration
- Audit logging

Credential files should not be published to Nostr relays.

### 8. Wallet integration

For the wallet flows:

- Lightning node or wallet provider
- NIP-47/Nostr Wallet Connect
- Exchange-rate provider
- Internal double-entry ledger
- M-Pesa payout API
- Idempotency keys
- Webhook verification
- Reconciliation jobs

Nostr Wallet Connect can transport wallet requests, but PostgreSQL should remain the authoritative financial ledger.

### 9. Notification integration

A push service is needed for installed PWAs:

- Web Push/VAPID
- Generic notification content
- No sender, group or message details
- Subscription management
- Failed-subscription cleanup

### 10. Background worker

Relay subscriptions and payment callbacks should not run solely inside HTTP requests.

Add a worker system such as:

- Celery with Redis
- Dramatiq
- ARQ
- A dedicated asynchronous Nostr listener process

The worker would handle relay subscriptions, delivery retries, expirations, notifications and payment reconciliation.


# Implementation Order

1. **Threat model and event design**
   - Define what goes on Nostr
   - Define what remains local
   - Define what the backend stores
   - Choose allowed event kinds and retention rules

2. **Key-management design**
   - Generate survivor and counselor keys client-side
   - Encrypt private keys locally with the PIN
   - Define organization and backend service keys
   - Ensure private keys never reach the API or relay

3. **Set up one local development relay**
   - Connect the FastAPI backend
   - Test publish, subscribe, reconnect and event filtering
   - Configure NIP-42 authentication

4. **Implement cryptographic validation**
   - Verify event IDs
   - Verify Schnorr signatures
   - Validate timestamps, tags, kinds and sizes
   - Add replay and rate-limit protection

5. **Implement private messaging**
   - NIP-44 encryption
   - NIP-59 gift wrapping
   - NIP-17 conversations
   - Delivery acknowledgements, retries and offline retrieval

6. **Build a complete messaging vertical slice**
   - Survivor generates an identity
   - Survivor sends an encrypted message
   - Relay accepts it
   - Counselor receives and decrypts it
   - Neither relay nor backend sees the content

7. **Deploy two private relays**
   - TLS/WSS
   - Authentication
   - Restricted queries
   - Event retention
   - Monitoring and backups
   - Multi-relay publishing and fallback

8. **Add operational backend services**
   - PostgreSQL
   - Counselor invitations and verification
   - Credential storage
   - Resource directory
   - Reporting and blocking
   - Background workers
   - Push notifications

9. **Add private groups and circles**
   - Membership management
   - Group encryption
   - Key rotation when members change
   - Moderation rules

10. **Add wallet integration**
    - Nostr Wallet Connect
    - Lightning provider
    - Internal ledger
    - Grant approvals
    - M-Pesa payouts
    - Reconciliation and idempotency

11. **Security review and production hardening**
    - Threat-model audit
    - Encryption review
    - Relay abuse tests
    - Metadata-leak testing
    - Backup and recovery drills

So the concise order is:

```text
Threat model
→ Key design
→ Local relay
→ Cryptographic validation
→ Private messaging
→ End-to-end test
→ Two production relays
→ Backend operations
→ Groups
→ Wallets
→ Security review
```

Wallet integration should come relatively late. Secure identity and private messaging are the foundation everything else depends on.



# How to Run
You can connect Primal or Damus for a basic relay check, but they are not sufficient to test the complete Resilience messaging design. For proper validation, use a purpose-built test client that performs NIP-42 authentication and NIP-17/NIP-44/NIP-59 messaging.

## 1. Start both relays

From the project root:

```bash
cd backend

cp .env.example .env

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

Generate a temporary development platform key and signed configuration:

```bash
python scripts/sign_config.py --dev
```

It prints something like:

```text
PLATFORM_PUBKEY=abc123...
```

Copy that value into `backend/.env`:

```env
PLATFORM_PUBKEY=abc123...
```

Then start everything:

```bash
docker compose up --build
```

Or start only the relays:

```bash
docker compose up -d relay-1 relay-2
```

Check their status:

```bash
docker compose ps
docker compose logs relay-1
docker compose logs relay-2
```

The local addresses are:

```text
ws://localhost:7777
ws://localhost:7778
```

You can also verify that the ports are open:

```bash
nc -vz localhost 7777
nc -vz localhost 7778
```

## 2. Understand `localhost`

`localhost` means the device running the client.

Therefore:

- A desktop client on the same Mac can try `ws://localhost:7777`.
- Primal or Damus on your phone cannot use that address.
- On your phone, `localhost` would refer to the phone itself.

For temporary LAN testing, obtain your Mac’s local IP:

```bash
ipconfig getifaddr en0
```

For example:

```text
192.168.1.25
```

You would then temporarily configure:

```text
ws://192.168.1.25:7777
ws://192.168.1.25:7778
```

However, iOS and browser security restrictions can reject unencrypted `ws://` connections. The reliable phone-testing approach is to expose both relays through TLS:

```text
wss://relay-1.yourdomain.org
wss://relay-2.yourdomain.org
```

Each relay’s `relay_url` must exactly match its public URL because NIP-42 authentication signs the relay URL.

## 3. Testing with Primal or Damus

In either client, look for its relay-management setting and add:

```text
ws://localhost:7777
ws://localhost:7778
```

Or the production `wss://` addresses.

This can establish:

- Whether the WebSocket opens
- Whether the relay appears reachable
- Whether basic Nostr events can be submitted
- Whether the client responds to NIP-42 challenges

It does not prove:

- NIP-17 private messages work correctly
- NIP-44 content is encrypted correctly
- NIP-59 gift wrapping works
- Only the intended recipient can retrieve a message
- Both relays receive the same encrypted event
- Duplicate delivery is deduplicated
- Guest-message expiration works

General-purpose clients may also use a different private-message format or may not handle NIP-42 exactly as Resilience requires. NIP-42’s authentication sequence is documented in the [official Nostr specification](https://github.com/nostr-protocol/nips/blob/master/42.md).

## 4. Recommended testing approach

`nc -vz localhost 7777` only confirms that something is listening on the TCP port:

```bash
nc -vz localhost 7777
nc -vz localhost 7778
```

`curl` can test the WebSocket HTTP upgrade handshake:

```bash
curl --http1.1 -i \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: SGVsbG9Ob3N0clRlc3Q=' \
  http://localhost:7777
```

Repeat for relay 2:

```bash
curl --http1.1 -i \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: SGVsbG9Ob3N0clRlc3Q=' \
  http://localhost:7778
```

A working relay should respond with something resembling:

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: ...
```

However, `curl` is not convenient for exchanging Nostr messages after the upgrade. It verifies the connection, not NIP-42 authentication or event publishing.

For an interactive WebSocket test, install and use `websocat`:

```bash
websocat ws://localhost:7777
```

After connecting, send a Nostr request:

```json
["REQ","test",{"kinds":[1],"limit":1}]
```

Because NIP-42 is enabled, the relay may return:

```json
["AUTH","challenge-value"]
```

That proves the relay is issuing authentication challenges, but completing authentication requires signing a kind `22242` event.

So the useful testing levels are:

- `nc -vz`: TCP port is open.
- `curl` handshake: it is actually a WebSocket server.
- `websocat`: inspect Nostr protocol messages interactively.
- A signed Nostr test client: verify NIP-42, publishing, subscriptions, encryption, and recipient restrictions.


## Run the app

The backend setup, local run, test, and troubleshooting instructions are in
[`backend/README.md`](backend/README.md).
