# Client key storage and encrypted messaging

Resilience performs identity and messaging cryptography in the PWA. FastAPI and the relays never
receive an account PIN, mnemonic, private key, vault key, or plaintext message.

## Account vault

`src/security/vault.ts` implements the device vault:

- standard 12-word NIP-06 backup and deterministic account key;
- Argon2id PIN derivation;
- random 256-bit vault data-encryption key;
- a non-extractable Web Crypto device key stored by IndexedDB;
- two-layer VDEK wrapping with AES-256-GCM and purpose-bound associated data;
- encrypted account key and encrypted temporary backup words;
- in-memory unlock, explicit lock, PIN re-wrapping, guest-key deletion and clear-device deletion.

The four-digit PIN remains a convenience factor with limited entropy. The device-bound key makes a
copied IndexedDB vault less useful, but this does not protect an already unlocked or compromised
device.

## Private messages

`src/messaging/` implements:

- NIP-17 kind 14 rumors;
- NIP-44 v2 encryption;
- NIP-59 kind 13 seals and fresh-key kind 1059 gift wraps;
- one separately encrypted wrapper for each recipient and the sender archive;
- outer NIP-40 expiration tags;
- signature, recipient, timestamp, expiration, rumor-hash, sender and payload validation;
- a typed, size-limited Resilience payload;
- NIP-42 authentication through signed relay challenges;
- an encrypted-event-only IndexedDB outbox;
- independent delivery state, exponential retry and reconnect for every configured relay;
- persistent replay tracking and in-session duplicate suppression.

The client downloads `/v1/config`, verifies its platform signature, and refuses fewer than two
distinct relay URLs. Call `createMessagingClient`, unlock an identity, then call `start` and `send`.
Never place a private key in React state, localStorage, sessionStorage, a URL, or an HTTP request.

## Remaining UI wiring

The protocol service deliberately accepts recipient public keys rather than screen names. Counselor,
circle and group screens must resolve the verified key from the signed directory or membership
state before calling `send`. They must not use a display name as an identity.

