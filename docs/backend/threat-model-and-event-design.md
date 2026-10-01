# Resilience threat model and Nostr event design

Status: draft for implementation review  
Scope: Resilience survivor, counselor, circle, support-group, verification, resource, and wallet workflows

## 1. Purpose

Resilience handles unusually sensitive communications and relationship metadata. This document defines:

- what the system must protect;
- which components are trusted with which data;
- the attacker capabilities the first implementation must address;
- what is stored on the device, on Nostr relays, and in the application backend;
- the initial Nostr event and encrypted payload design;
- the security decisions that must be resolved before implementation.

This is a living threat model. It must be reviewed whenever a new data flow, external provider, event type, or recovery mechanism is introduced.

## 2. Security goals

Resilience must:

1. Keep message content confidential from relays, the Resilience API, infrastructure operators, and unrelated users.
2. Minimize collection of real names, phone numbers, email addresses, exact locations, and government identifiers.
3. Prevent unauthorized users from reading another account's messages or enumerating memberships.
4. Make counselor verification cryptographically verifiable without exposing credential documents.
5. Keep survivor and counselor private keys out of the backend and relays.
6. Limit the value of data obtained from a relay or backend compromise.
7. Support rapid local exit and local deletion without making false claims about deleting recipients' copies.
8. Prevent duplicate financial operations and maintain a conventional auditable ledger.
9. Keep notifications generic and free of relationship or message information.
10. Preserve basic messaging availability when one relay is unavailable.

## 3. Explicit non-goals

The first release cannot guarantee:

- deletion of a message already received or copied by another participant;
- confidentiality on a compromised or unlocked device;
- protection from screenshots or photography by a conversation participant;
- complete network-level anonymity against a global traffic observer;
- forward secrecy or post-compromise security equivalent to Signal;
- correctness or availability of third-party emergency, Lightning, or M-Pesa services;
- permanent anonymity if a user voluntarily shares identifying information in a message.

The UI and documentation must not imply these guarantees.

## 4. Protected assets

### Critical secrets

- Nostr private keys and backup words
- PIN-derived key-encryption keys
- decrypted message content and attachments
- counselor credential documents
- organization signing keys
- relay administration keys
- wallet, NWC, Lightning, and M-Pesa credentials
- push-notification subscription endpoints

### Sensitive metadata

- survivor-to-counselor relationships
- circle and group membership
- message timing and frequency
- public keys associated with a device or network address
- whether a person viewed shelters, legal help, medical care, or rights resources
- counselor availability and working patterns
- support-request reasons and grant activity
- rough or exact location
- account recovery and device-change activity

### Integrity-sensitive records

- counselor verification status and expiration
- block and report state
- group moderation actions
- wallet balances and ledger entries
- grant approvals and payout state
- resource verification status

## 5. Actors and trust boundaries

| Component or actor | Trusted with | Must not receive |
|---|---|---|
| Survivor device | Private key, PIN, backup words, plaintext messages, local records | Organization secrets, other users' plaintext |
| Counselor device | Counselor private key, plaintext conversations assigned to that counselor | Survivor legal identity unless voluntarily disclosed |
| Resilience private relay | Encrypted events, routing tags, authenticated connection identity, timing | Plaintext messages, private keys, credential files |
| Resilience API | Operational records, invitations, verification state, reports, payment workflow | User private keys, backup words, routine plaintext chats |
| Partner organization | Counselor credentials, verification decision, explicitly submitted support requests | Unrelated survivor conversations or circle membership |
| Object storage | Encrypted counselor documents | Decryption keys stored in the same security boundary |
| Notification provider | Generic notification payload and delivery token | Sender, group, message, grant, or resource details |
| Lightning/NWC provider | Payment instructions necessary to settle a payment | Conversations, health records, circle membership |
| M-Pesa provider | Phone number and payout details at withdrawal time | Nostr identity graph or message history |
| Conversation recipient | Messages addressed to them | Other rooms, private records, backup material |

Private relays and the API are separate trust boundaries even if Resilience operates both.

## 6. Primary threats and controls

| Threat | Example | Required controls |
|---|---|---|
| Abuser gains brief device access | Opens recent conversations or backup words | PIN-gated local vault, auto-exit, screen-switch hiding, no lock-screen previews, hold-to-reveal backup words |
| Malicious or compromised relay | Reads events, enumerates recipients, withholds or replays messages | NIP-17/NIP-44/NIP-59, NIP-42, restricted filters, two relays, replay checks, short retention, minimal tags |
| Backend breach | Attacker obtains database and logs | No private keys or plaintext chats, field-level encryption, minimal logs, isolated credential storage, retention limits |
| Network observer | Correlates IP address and event timing | TLS/WSS, randomized gift-wrap timestamps, batching/jitter where practical, no claim of network anonymity |
| Malicious participant | Shares messages or probes for identity | Clear safety prompts, blocking, reporting, membership limits, no searchable survivor directory |
| Counselor impersonation | Fake counselor claims verification | Organization-signed attestation, trusted organization-key registry, expiry and revocation checks |
| Compromised counselor | Requests names, phone numbers, or location | Safety UX, reports, rapid revocation, audit trail, least-privilege room access |
| Spam or denial of service | Floods relays with gift wraps or join requests | NIP-42, allowlists, quotas, payload limits, rate limits, abuse scoring without message decryption |
| Event tampering | Modified message, pubkey, or timestamp | Event ID recomputation, Schnorr signature verification, schema validation, timestamp bounds |
| Replay | Re-sends an invite, grant request, or moderation command | Unique IDs, idempotency records, one-time tokens, expiry, processed-event table |
| Financial duplication | Callback or request executes twice | Double-entry ledger, idempotency keys, unique provider references, reconciliation jobs |
| Supply-chain compromise | Malicious Python or JavaScript dependency | Locked dependencies, vulnerability scanning, minimal crypto libraries, reproducible builds |

## 7. Data placement decisions

| Data | Device | Relay | Backend/database | Object storage |
|---|---:|---:|---:|---:|
| Survivor/counselor private key | Encrypted | Never | Never | Never |
| Backup words | Display temporarily | Never | Never | Never |
| Plaintext messages | Encrypted local cache | Never | Never by default | Never |
| NIP-17 gift wraps | Optional cache | Encrypted, short retention | Delivery metadata only if needed | Never |
| Guest conversation | Temporary encrypted state | Encrypted with expiry | Minimal session status | Never |
| Circle/group membership | Encrypted local state | Encrypted/minimized routing state | Opaque membership IDs if enforcement requires | Never |
| Counselor display profile | Cache | Signed event only if exposure is accepted | Yes | Never |
| Counselor credential documents | Never after upload completes | Never | Metadata and review status | Client-encrypted object |
| Verification attestation | Cache | Signed/encrypted event | Authoritative status and revocation | Never |
| Saved resources/records | Local | Never | Only if user explicitly enables sync later | Never |
| Reports | Local receipt | Never by default | Encrypted case and selected evidence | Encrypted attachments if selected |
| Wallet balance and payments | Cached display | NWC messages only | Authoritative ledger | Never |
| M-Pesa phone number | Entered at payout | Never | Only as long as provider/reconciliation requires | Never |

## 8. Protocol baseline

The first implementation uses:

- NIP-01 for event format and client-relay communication;
- NIP-17 for private direct messages and small encrypted rooms;
- NIP-44 version 2 for payload encryption;
- NIP-59 gift wrapping for metadata-reduced asynchronous delivery;
- NIP-42 for authenticated relay access;
- NIP-40 expiration tags as a relay cleanup request, not as a deletion guarantee;
- NIP-47 later for Nostr Wallet Connect.

NIP-04 must not be used for new conversations.

## 9. Event envelope design

### 9.1 Private message envelope

All private conversation traffic uses the NIP-17 structure:

```text
kind 1059 gift wrap
  -> NIP-44 encrypted kind 13 seal
       -> NIP-44 encrypted unsigned kind 14 rumor
            -> typed Resilience payload
```

For every message:

- create a new random gift-wrap key;
- create one wrapper for each recipient and one for the sender's own archive;
- randomize wrapper and seal timestamps as required by NIP-59;
- include only recipient routing information on the outer event;
- verify the seal author matches the rumor author after decryption;
- reject invalid signatures, unexpected participants, oversized content, and replayed IDs.

### 9.2 Typed encrypted payload

The `content` of the inner kind `14` rumor is JSON:

```json
{
  "v": 1,
  "type": "chat.message",
  "conversation_id": "random-opaque-id",
  "client_message_id": "uuid",
  "body": {
    "text": "message text"
  }
}
```

Rules:

- `v` is the Resilience payload schema version.
- `type` is allowlisted.
- `conversation_id` is random and contains no topic, user, or organization name.
- `client_message_id` provides local deduplication and retry safety.
- No real name, phone, email, exact location, group topic, or support category appears in outer tags.
- Unknown payload versions or types are quarantined rather than rendered.

## 10. Initial encrypted payload catalogue

These are application payload types inside NIP-17 messages, not new public Nostr event kinds.

| Payload type | Sender -> recipient | Purpose | Retention |
|---|---|---|---|
| `chat.message` | Any room member -> room | Text message | Account policy; guest short-lived |
| `chat.system` | Authorized client/service -> room | Non-sensitive room state notice | Same as room |
| `chat.reaction` | Room member -> room | Reaction to a message | Same as referenced message |
| `message.request` | Group member -> requested user | Ask to begin a private conversation | Short-lived |
| `message.request.accept` | Recipient -> requester | Establish a new room | Short-lived |
| `message.request.ignore` | Device-local only | Ignore without notifying requester | Never published |
| `resource.share` | Counselor/peer -> survivor | Share a resource ID, not browsing history | Same as message |
| `counselor.referral` | Counselor -> survivor/counselor | Offer a counselor reference | Short-lived |
| `circle.invite` | Member -> known contact | Invite to circle with opaque token | Until expiry/use |
| `circle.invite.accept` | Invitee -> inviter | Accept circle membership | Short-lived |
| `circle.member.remove` | Circle owner -> removed member | End future room access | Short-lived |
| `group.message` | Group member -> encrypted group room | Support-group message | Group policy |
| `group.membership.changed` | Authorized moderator -> members | Trigger new room/encryption state | Retain while needed |
| `conversation.clear.request` | User -> own devices | Request deletion of local copies | Short-lived; best effort |
| `verification.attestation` | Organization -> counselor/client | Signed counselor verification result | Until expiry/revocation |
| `verification.revocation` | Organization -> affected clients | Revoke attestation | Retain through prior expiry |
| `support.request.receipt` | Backend service -> counselor | Acknowledge support request without survivor identity | Financial retention policy |

### Payloads that must not go through Nostr

- credential document bytes or download URLs;
- report evidence unless a later reviewed encrypted-evidence design explicitly allows it;
- M-Pesa phone numbers;
- internal wallet ledger entries;
- exact shelter occupancy or sensitive location data;
- backup words, PIN material, or private keys;
- push subscription endpoints.

## 11. Conversation models

### Account conversation

- Long-term participant keys identify the room members.
- The room uses NIP-17 delivery.
- Clients retain encrypted local history according to user settings.
- A sender publishes a wrapped copy for the recipient and for the sender.

### Guest conversation

- The client creates a fresh ephemeral Nostr keypair for the visit.
- The key is not backed up or reused across visits.
- Gift wraps include a short NIP-40 expiry.
- Relays apply a stricter retention policy.
- On exit, the device deletes the ephemeral key and local plaintext/cache.
- The UI states that relay deletion is best effort and recipient copies may remain.

### Circle

- Maximum three members in the MVP.
- Use a NIP-17 multi-recipient room.
- Every participant change creates a new room identifier and new message history boundary.
- There is no public member list or searchable circle directory.

### Support group

- Do not use a public NIP-29 group for confidential survivor messages.
- Membership is approved by the backend and enforced at the private relay.
- Message content remains application-encrypted.
- Member lists are not published as readable events.
- Removing or adding a member rotates the group encryption state.
- Detailed group cryptography requires a separate design review before implementation.

## 12. Counselor verification design

Credential documents travel over authenticated HTTPS to encrypted object storage and are reviewed by the partner organization. After approval, the organization signs a verification attestation containing only:

```json
{
  "v": 1,
  "type": "verification.attestation",
  "subject_pubkey": "hex public key",
  "issuer_pubkey": "trusted organization public key",
  "display_name": "Counselor Grace",
  "focus_areas": ["trauma-support", "legal-aid"],
  "license_confirmed": true,
  "issued_at": 0,
  "expires_at": 0,
  "attestation_id": "opaque-id"
}
```

The attestation contains no legal name, document name, document hash, license number, phone number, or organization case reference.

Before displaying a verified badge, clients must:

1. verify the event signature;
2. confirm that the issuer key belongs to a trusted organization;
3. confirm the subject key matches the counselor;
4. check expiry;
5. check revocation state.

The exact event kind for an independently verifiable attestation remains an open design decision. Until a kind is selected and interoperability is justified, the attestation may be transported privately as a NIP-17 typed payload and remain authoritative in the backend.

## 13. Relay policy requirements

Private relays must:

- require TLS (`wss://`);
- support NIP-42 authentication;
- reject unauthenticated sensitive subscriptions and writes;
- restrict filters so users cannot enumerate arbitrary recipients;
- verify all event IDs and signatures;
- accept only allowlisted kinds and tag shapes;
- enforce event and content size limits;
- rate-limit by authenticated identity, connection, and network source;
- prevent late or replayed control events;
- honor expiry and apply server-side retention deletion;
- avoid logging event content, query filters, full public keys, and IP addresses longer than operationally necessary;
- expose health and operational metrics without user identifiers;
- support administrative revocation and incident response.

Two relays improve availability, not confidentiality. A client should publish to both and deduplicate received events by event ID.

## 14. Backend responsibilities

The FastAPI application remains authoritative for:

- single-use counselor and organization invitation codes;
- credential submission and review;
- trusted organization-key registry;
- attestation status and revocation;
- support-group admission and moderation authorization;
- resource content and verification;
- reports, blocks, and incident workflows;
- grants, wallet ledger, exchange-rate records, and payouts;
- generic push notifications;
- idempotency and operational audit records.

The API may observe that an operation occurred, but should not receive routine decrypted conversation content.

## 15. Logging and observability rules

Production logs must not contain:

- message content or encrypted event content;
- full public keys or conversation IDs;
- invite codes;
- credential filenames or document contents;
- phone numbers;
- Lightning invoices or NWC connection strings;
- push endpoints;
- exact resource searches or selected shelter locations.

Use redacted identifiers derived with a rotating server-side keyed hash when correlation is operationally necessary.

## 16. Open decisions before coding

The team must resolve:

1. Is the client responsible for all NIP-17 construction, or will an organization-owned service create messages for organization workflows?
2. Which relay implementation can enforce the required NIP-42 subscription and write policies?
3. What are the exact retention periods for account chats, guest chats, invitations, and delivery copies?
4. Will account message history synchronize across devices, or remain device-local in the MVP?
5. Which group-encryption design will be used when support groups exceed practical NIP-17 multi-recipient rooms?
6. Will counselor attestations need interoperability outside Resilience?
7. Which organization keys are trusted, and how are key rotation and compromise handled?
8. Which data must be retained for Kenyan regulatory, safeguarding, and payment obligations?
9. Does the MVP require Tor or another network-privacy option, or will the product explicitly document IP-metadata limitations?
10. What is the incident response procedure for a compromised counselor, organization key, relay, or wallet credential?

## 17. Security acceptance criteria for the first vertical slice

The first Nostr messaging milestone is complete only when:

- a survivor and counselor generate keys locally;
- neither private key appears in an API request, relay event, server log, or database;
- a NIP-17 message is encrypted on the sender device;
- both configured relays receive only valid gift wraps;
- the counselor decrypts and verifies the message locally;
- the API and relay cannot recover the plaintext;
- duplicate delivery from two relays renders once;
- invalid signatures, modified ciphertext, unexpected senders, expired events, and oversized events are rejected;
- a guest session loses access after its ephemeral key is deleted;
- automated tests cover success, tampering, replay, expiry, and relay outage cases.

