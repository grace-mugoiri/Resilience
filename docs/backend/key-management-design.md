# Resilience key-management design

Status: draft for implementation review  
Depends on: [Threat model and event design](./threat-model-and-event-design.md)

## 1. Purpose

This document defines the lifecycle and trust boundaries for every cryptographic key used by Resilience. It covers:

- survivor and counselor Nostr identities;
- guest identities;
- local vault encryption and PIN unlock;
- backup and restoration;
- organization signing;
- backend service identities;
- relay authentication and administration;
- wallet and notification secrets;
- rotation, revocation, compromise, and deletion.

The design follows one primary rule:

> Survivor and counselor Nostr private keys are generated, used, encrypted, backed up, and restored on the user's device. The API and relays never receive them.

## 2. Key inventory

| Key or secret | Owner | Lifetime | Storage | Primary use |
|---|---|---:|---|---|
| Account Nostr keypair | Survivor/counselor | Long-lived | Encrypted device vault | Identity, signing, NIP-17/NIP-44 |
| Guest Nostr keypair | Guest session | Until exit/timeout | Memory or temporary encrypted session storage | One guest conversation |
| Gift-wrap keypair | Message sender | One wrapper | Memory only | NIP-59 outer event |
| Vault data-encryption key (VDEK) | Device installation | Until local clear/rekey | Wrapped in IndexedDB | Encrypt private local data |
| PIN-derived wrapping key | User/session | Unlock operation only | Never stored | Wrap/unwrap local key material |
| Device-bound Web Crypto key | Browser profile/device | Device installation | Non-extractable CryptoKey in IndexedDB | Add device-bound protection |
| Backup mnemonic | Account owner | Account lifetime | Written offline by user | Recover account key |
| Organization root signing key | Partner organization | Years | Offline/HSM | Authorize operational organization keys |
| Organization attestation key | Partner organization | Months | KMS/HSM-backed signer | Counselor attestations and revocations |
| Backend service Nostr key | Resilience service | Months | KMS/secret manager | Explicit service-authored Nostr events only |
| Relay identity key | Relay operator | Long-lived | Relay host secret manager | Relay identity/administration where required |
| NWC connection secret | Wallet integration | Per connection | Backend secret manager | NIP-47 wallet communication |
| VAPID private key | Notification service | Rotatable | Backend secret manager | Web Push signing |
| Database field-encryption key | Backend | Rotatable | KMS | Protect selected operational fields |

Keys must never be reused across these roles.

## 3. Account identity key

### Generation

The PWA generates a cryptographically random 32-byte secp256k1 secret using the browser cryptographic random-number generator or an audited Nostr library that uses it.

Requirements:

- generation occurs only in a secure browser context (`https:` or localhost);
- the secret is never represented in application logs, analytics, URLs, exceptions, or network requests;
- the public key is derived locally;
- the application verifies that the secret is in the valid secp256k1 scalar range;
- test and production builds use the same audited primitive, not custom elliptic-curve code;
- production builds disable source-map publication unless access is restricted.

### Use

The account secret may be unlocked in memory to:

- sign Nostr events;
- derive NIP-44 conversation keys;
- create NIP-17 seals;
- authenticate to a relay with NIP-42;
- authenticate selected HTTP requests using a reviewed NIP-98-style flow.

It must not be sent to FastAPI, a relay, an error tracker, a remote signer operated by Resilience, or a wallet provider.

### Public-key identifiers

- Protocol and database comparisons use lowercase 64-character hexadecimal public keys.
- `npub` is display/export encoding only.
- The UI normally displays a nickname rather than `npub` or hex.
- Full public keys must not appear in routine server logs.

## 4. Local encrypted vault

### Contents

The encrypted device vault may contain:

- account private key;
- local message database keys;
- cached decrypted conversation state;
- local records;
- contact and conversation metadata;
- trusted organization-key cache;
- user preferences that reveal sensitive behavior.

Public resources and non-sensitive application configuration do not require vault encryption.

### Storage

- Store encrypted records and wrapped keys in IndexedDB.
- Do not store private keys, mnemonics, plaintext messages, NWC strings, or decrypted vault material in `localStorage`, `sessionStorage`, cookies, service-worker caches, or URL state.
- Use authenticated encryption so modification is detected.
- Every encrypted record includes a schema version and unique nonce.
- Nonces must never repeat for the same encryption key.
- Associated data binds ciphertext to the account, record type, record ID, and schema version.

### Key hierarchy

```text
User PIN ──memory-hard KDF──> PIN wrapping key ─┐
                                               ├─> unwrap VDEK
Device-bound non-extractable key ──────────────┘

VDEK ──authenticated encryption──> account key + local private data
```

The VDEK is a random 256-bit key generated on the device. Changing the PIN re-wraps the VDEK; it does not require re-encrypting every local record.

### Cryptographic primitives

Preferred primitives:

- PIN KDF: Argon2id from a maintained, audited browser/WASM package, calibrated per device;
- vault encryption: XChaCha20-Poly1305 or AES-256-GCM from a maintained audited implementation;
- random values: `crypto.getRandomValues`;
- Nostr key operations: maintained Nostr/secp256k1 library;
- export encryption: NIP-49 when a strong password-protected `ncryptsec` export is offered.

Do not implement cryptographic primitives directly.

Parameter choices must be benchmarked on the lowest supported phone. The KDF should consume meaningful memory and take approximately 500–1,000 ms without making unlock unusable. Exact parameters are an implementation decision recorded with test results.

## 5. Four-digit PIN security

A four-digit PIN has only 10,000 possibilities. A memory-hard KDF slows guessing but cannot turn it into a high-entropy password.

Therefore:

- the PIN is a convenience unlock factor, not an account-recovery secret;
- the vault also uses a device-bound, non-extractable Web Crypto key where supported;
- WebAuthn/user verification should protect high-risk actions where platform support permits;
- failed attempts use increasing delays and trigger a user-visible warning;
- application rate limits are defense in depth and must not be described as protection against a fully copied browser profile;
- the product must not claim that a four-digit PIN alone resists a capable offline attacker;
- users may optionally configure a longer passphrase in a later release.

The team must test whether the chosen PWA/browser platforms reliably preserve non-extractable CryptoKeys through normal updates and whether device transfer copies them. A recovery flow must never depend on the device key.

## 6. Unlock and lock lifecycle

### Unlock

1. Load wrapped vault metadata from IndexedDB.
2. Normalize user input as required by the selected KDF/export format.
3. Derive the PIN wrapping key.
4. Combine it with the device-bound operation to unwrap the VDEK.
5. Decrypt the account key only when a signing or decryption operation needs it.
6. Record no PIN or secret values in state persistence, telemetry, logs, or crash reports.

### Lock

Lock immediately when:

- the user presses Exit;
- the configured inactivity timer expires;
- the page becomes hidden or the device locks, according to the product safety setting;
- the user signs out;
- a key or vault integrity check fails.

On lock:

- remove plaintext keys from application state;
- terminate active relay subscriptions associated with the unlocked identity where practical;
- clear decrypted message views and search indexes;
- clear clipboard data written by Resilience where platform APIs permit;
- navigate to the decoy or safety-entry screen as specified by the product flow.

JavaScript cannot guarantee that garbage-collected memory is zeroed. Implementations should minimize secret lifetime and avoid unnecessary copies rather than claim guaranteed memory erasure.

## 7. Backup and recovery

### Decision for MVP

The current product design uses 12 backup words. If retained, implement them as a standard BIP-39 mnemonic and derive account `0` using the NIP-06 path:

```text
m/44'/1237'/0'/0/0
```

NIP-06 is currently marked `unrecommended` in favor of a single `nsec`. This is an explicit interoperability tradeoff. Before production, product and security owners must choose one of:

1. retain the 12-word NIP-06 flow for familiar recovery UX;
2. replace it with direct `nsec` backup;
3. offer a strong-password NIP-49 `ncryptsec` export;
4. support more than one export format while clearly explaining each.

Do not invent a proprietary word-to-key derivation.

### Backup display

- Generate words on the device.
- Display only after the user explicitly requests backup.
- Require PIN/WebAuthn re-verification.
- Blur until press-and-hold.
- Do not provide clipboard copy by default.
- Warn against screenshots and cloud notes.
- Verify selected word positions before marking the account backed up.
- Store only `backup_confirmed_at`, never the words.

### Restore

- Parse and validate entirely on the device.
- Derive the key and show the expected public identifier before committing.
- Create a new device vault and VDEK.
- Never send the mnemonic, `nsec`, `ncryptsec` password, or derived private key to the backend.
- Restore relay-delivered encrypted messages only where the relay still retains them and the account key can decrypt them.
- Clearly state that device-local records not included in an encrypted backup cannot be restored.

### NIP-49 export

If implemented, NIP-49 must use a strong passphrase rather than the four-digit app PIN. The encrypted `ncryptsec` value must not be published to relays or uploaded automatically; NIP-49 warns that collecting encrypted private keys enables large-scale cracking attempts.

## 8. Guest keys

- Generate a new random Nostr keypair per guest visit or conversation, according to the final UX decision.
- Never derive a guest key from device identity, account identity, nickname, timestamp, or invite code.
- Keep it in memory where possible.
- If offline/background delivery requires temporary persistence, store it only inside the encrypted temporary vault with an explicit expiry.
- Do not back it up, sync it, or associate it with an account public key.
- Delete local guest key material on Exit, timeout, clear, or conversation end.
- Publish short expiry tags and configure relay retention, while acknowledging that remote deletion is not guaranteed.

Reusing a guest nickname does not reuse the key.

## 9. Per-message gift-wrap keys

NIP-59 requires a newly generated random wrapper keypair for each recipient wrapper.

For each private message:

1. construct one unsigned rumor;
2. create and sign the seal with the account or guest identity key;
3. generate a fresh wrapper keypair;
4. wrap separately for each recipient;
5. discard the wrapper private key immediately after signing;
6. create a separate wrapped copy for the sender when local/multi-device history requires it.

Wrapper keys must never be persisted or reused.

## 10. Organization keys

### Hierarchy

Each trusted partner organization should have:

- an offline root key;
- one or more online operational attestation keys;
- an emergency revocation procedure.

The root key authorizes operational keys. Operational keys sign counselor verification attestations and revocations. Credential-review staff do not receive raw signing keys.

### Storage

- Root key: offline hardware device or HSM, used rarely.
- Operational key: cloud KMS/HSM or isolated signer service.
- Development keys: separate and unmistakably non-production.
- Never place production keys directly in source control, Docker images, `.env` committed to Git, database rows, or ordinary application logs.

### Trust registry

The Resilience client ships or securely retrieves a signed registry containing:

- organization public key;
- authorized operational keys;
- validity window;
- status;
- key purpose;
- revocation information.

The API database is not sufficient proof by itself. Clients must verify the registry signature and attestation signature before displaying a verification badge.

## 11. Backend service keys

The FastAPI service may need Nostr keys for narrowly defined service events. It must not use one global key for every purpose.

Recommended separation:

- notification-wakeup service key, if Nostr wakeups are used;
- organization-workflow transport key;
- relay-health/test key;
- no backend key for signing on behalf of survivors or counselors.

Every service key has:

- an owner and purpose;
- environment separation;
- allowed event kinds;
- allowed recipient/relay scope;
- creation, activation, expiry, rotation, and revocation dates;
- KMS or secrets-manager reference;
- audit logging that excludes plaintext content and secret material.

The Python `nostr-sdk` may load a service signer through a controlled adapter. User keys must never be loaded into it on the server.

## 12. Relay authentication keys

For survivor and counselor clients, NIP-42 authentication uses the currently unlocked account or guest identity to sign the ephemeral authentication event. Relays must:

- verify the challenge and relay URL;
- enforce a narrow timestamp window;
- reject reuse across connections;
- never store or broadcast kind `22242` authentication events;
- authorize subscriptions and writes independently of successful signature verification.

Authentication proves control of a key. It does not by itself grant permission to read every event for that key.

Relay administrative credentials and relay identity keys are infrastructure secrets and must be separate from Nostr user identities.

## 13. HTTP authentication

Where the API needs proof that a caller controls a Nostr key, use a reviewed NIP-98-compatible flow with additional application controls:

- HTTPS only;
- exact HTTP method and canonical URL binding;
- body hash for state-changing requests;
- short timestamp window;
- server-issued single-use nonce for sensitive operations;
- event ID and Schnorr signature validation;
- replay cache;
- authorization checked after authentication.

Do not accept a public key supplied in an unsigned header or JSON field as authentication.

High-risk operations such as credential submission, account migration, verification revocation, or payout approval require additional role-specific authorization.

## 14. Wallet and payment secrets

- Use a unique NWC connection secret for each wallet/client integration.
- Store NWC connection URIs only in a production secrets manager.
- Never expose an organization NWC secret to the PWA.
- Restrict wallet methods and budgets to the minimum necessary.
- Separate invoice creation, payment approval, and reconciliation permissions where the provider permits.
- Treat Lightning invoices, preimages, M-Pesa references, and phone numbers as sensitive.
- Rotate a connection immediately after suspected exposure.
- Keep the conventional ledger authoritative even when commands travel through NIP-47.

## 15. Rotation, revocation, and compromise

### User identity key

Nostr does not provide a universally trusted mechanism that safely invalidates a stolen identity key. Therefore:

- routine user-key rotation is not presented as transparent account recovery;
- a user who still controls the old key may sign an application migration notice;
- contacts must explicitly accept or obtain the replacement through a trusted application workflow;
- if compromise is suspected, create a new account key, stop using the old key, invalidate its backend sessions, and rebuild trusted relationships;
- the backend marks the old key compromised but cannot cryptographically prevent an attacker from signing as it outside Resilience;
- counselor verification for the old key is revoked and reissued only after organization review.

### Organization operational key

- Root-authorized revocation marks the key invalid from a defined time.
- Clients refresh the trust registry and refuse new attestations from revoked keys.
- Existing attestations are re-evaluated against revocation time.
- A replacement operational key is root-authorized and distributed through the signed registry.

### Backend or wallet key

- Disable the key at the provider/KMS.
- Stop affected workers.
- rotate dependent credentials;
- reconcile all operations during the exposure window;
- publish or distribute required revocations;
- follow the incident-response runbook.

## 16. Clear-device and sign-out behavior

### Sign out

- Lock and unload plaintext secrets.
- Disconnect authenticated relay sessions.
- Remove transient authentication state.
- Preserve the encrypted account vault only if the product explicitly supports returning login on that device.

### Clear everything from this phone

- Delete the wrapped VDEK and device-bound key first, cryptographically destroying access to encrypted local records.
- Delete the encrypted vault, IndexedDB databases, Cache Storage entries, service-worker private caches, and local application preferences.
- Unsubscribe push endpoints where connectivity permits.
- Clear backend device-session records through a best-effort authenticated request.
- Do not claim that messages already delivered to recipients or retained by relays were deleted.

Deletion order matters: removing the VDEK before bulk record cleanup prevents recoverable plaintext if cleanup is interrupted.

## 17. Browser and application hardening

Because user keys live in the PWA, cross-site scripting is equivalent to key compromise while the vault is unlocked.

Required controls:

- strict Content Security Policy without `unsafe-inline` or `unsafe-eval`;
- no third-party analytics, ad scripts, tag managers, or remotely injected UI code;
- dependency locking and automated vulnerability review;
- Trusted Types where supported;
- output encoding and sanitized rich content;
- no rendering of arbitrary HTML from Nostr events;
- service-worker update integrity and controlled activation;
- short unlock lifetime;
- sensitive-operation confirmation;
- redacted error reporting;
- security review for every dependency with access to signing or decrypted content.

## 18. Backend data model boundaries

The backend may store:

- account public key and opaque internal account ID;
- role and organization association;
- public-key status: active, replaced, compromised, blocked;
- accepted terms/version;
- verification and revocation records;
- relay authorization state;
- device push subscriptions, encrypted at rest;
- idempotency and replay records.

It must not store:

- user private keys;
- backup words;
- app PINs or PIN verifiers usable for offline checking;
- vault data-encryption keys;
- NIP-44 conversation keys;
- gift-wrap private keys;
- routine plaintext messages.

## 19. Key lifecycle states

```text
generated -> active -> locked -> active
                    -> replaced -> retired
                    -> compromised -> blocked
                    -> locally deleted
```

The backend's status is an application policy signal. It cannot invalidate signatures that are valid under the underlying Nostr key.

## 20. Implementation sequence

1. Select and test the browser Nostr/secp256k1 library.
2. Implement account and guest key generation with deterministic test vectors.
3. Implement the encrypted IndexedDB vault and key hierarchy.
4. Benchmark and select KDF parameters on low-end target devices.
5. Implement lock, auto-exit, and clear-device behavior.
6. Implement backup confirmation and restore entirely client-side.
7. Implement backend public-key registration and NIP-98 authentication.
8. Implement NIP-42 relay authentication.
9. Provision development organization and backend service keys.
10. Add rotation/revocation records and incident tests.
11. Perform an independent security review before production keys or real credentials are used.

## 21. Open decisions

1. Keep the existing 12-word NIP-06 backup UX, or move to `nsec`/NIP-49?
2. Which browsers and devices must support device-bound Web Crypto keys and WebAuthn?
3. Which audited Argon2id implementation meets PWA performance and supply-chain requirements?
4. What unlock duration and background-lock behavior best balance safety and message usability?
5. Will multiple devices share one account key, or will each device have a separately authorized identity?
6. Which KMS/HSM and organization signer workflow will be used?
7. Which events, if any, may the FastAPI service sign?
8. What user-facing process handles suspected account-key compromise?
9. What Kenyan legal or safeguarding rules affect key recovery, credential retention, and payment-key custody?

## 22. Acceptance criteria

Key management is ready for the messaging vertical slice only when automated tests demonstrate that:

- account and guest keys are generated from a cryptographically secure source;
- the account secret is encrypted before persistence;
- no private key, mnemonic, PIN, VDEK, or conversation key enters an HTTP request or log;
- a correct PIN plus device-bound key unlocks the vault;
- an incorrect PIN, modified ciphertext, wrong device key, or modified associated data fails closed;
- PIN change re-wraps the VDEK without changing the account public key;
- lock and auto-exit remove secrets from application state;
- backup restoration reproduces the expected public key without contacting the backend;
- guest key deletion makes retained guest ciphertext locally undecryptable;
- gift-wrap keys are unique per wrapper and never persisted;
- organization attestations validate only under active trusted keys;
- revoked organization keys and expired attestations are rejected;
- NIP-42 and HTTP authentication reject expired, replayed, malformed, and incorrectly targeted events;
- the backend test suite fails if any endpoint schema accepts a user private key or mnemonic field.

## 23. Normative references

- [NIP-06: Basic key derivation from mnemonic seed phrase](https://github.com/nostr-protocol/nips/blob/master/06.md)
- [NIP-42: Authentication of clients to relays](https://github.com/nostr-protocol/nips/blob/master/42.md)
- [NIP-44: Encrypted payloads](https://github.com/nostr-protocol/nips/blob/master/44.md)
- [NIP-46: Nostr remote signing](https://github.com/nostr-protocol/nips/blob/master/46.md)
- [NIP-47: Nostr Wallet Connect](https://github.com/nostr-protocol/nips/blob/master/47.md)
- [NIP-49: Private key encryption](https://github.com/nostr-protocol/nips/blob/master/49.md)
- [NIP-59: Gift wrap](https://github.com/nostr-protocol/nips/blob/master/59.md)
- [NIP-98: HTTP authentication](https://github.com/nostr-protocol/nips/blob/master/98.md)
