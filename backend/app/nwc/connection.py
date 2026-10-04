"""Parse NWC URIs and encrypt their client secret for database storage."""

import base64
import hashlib
import os
import uuid
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.nostr.events import pubkey_of
from app.settings import Settings


class NwcConnectionError(ValueError):
    pass


@dataclass(frozen=True)
class NwcConnection:
    wallet_pubkey: str
    client_secret: str
    client_pubkey: str
    relays: list[str]
    lud16: str | None


def _hex32(value: str) -> bool:
    return len(value) == 64 and all(char in "0123456789abcdef" for char in value)


def parse_connection_uri(uri: str, settings: Settings) -> NwcConnection:
    if not isinstance(uri, str) or len(uri) > 4096:
        raise NwcConnectionError("invalid NWC connection URI")
    parsed = urlparse(uri)
    wallet_pubkey = (parsed.netloc or parsed.path.lstrip("/")).lower()
    query = parse_qs(parsed.query, keep_blank_values=True)
    secrets = query.get("secret", [])
    relays = list(dict.fromkeys(query.get("relay", [])))
    if parsed.scheme != "nostr+walletconnect" or not _hex32(wallet_pubkey):
        raise NwcConnectionError("NWC URI must contain a valid wallet service public key")
    if len(secrets) != 1 or not _hex32(secrets[0].lower()):
        raise NwcConnectionError("NWC URI must contain one valid client secret")
    if not relays or len(relays) > 5:
        raise NwcConnectionError("NWC URI must contain between one and five relays")
    for relay in relays:
        relay_url = urlparse(relay)
        allowed = {"wss"} if settings.app_env in {"prod", "production"} else {"ws", "wss"}
        if (
            relay_url.scheme not in allowed
            or not relay_url.hostname
            or relay_url.username
            or relay_url.password
            or relay_url.fragment
        ):
            raise NwcConnectionError("NWC relay URL is not allowed")
    secret = secrets[0].lower()
    return NwcConnection(
        wallet_pubkey=wallet_pubkey,
        client_secret=secret,
        client_pubkey=pubkey_of(secret),
        relays=relays,
        lud16=(query.get("lud16") or [None])[0],
    )


def _storage_key(settings: Settings) -> bytes:
    return hashlib.sha256(settings.nwc_storage_key.encode()).digest()


def seal_secret(settings: Settings, org_id: uuid.UUID, secret: str) -> str:
    nonce = os.urandom(12)
    ciphertext = AESGCM(_storage_key(settings)).encrypt(
        nonce, secret.encode(), f"resilience:nwc:{org_id}".encode()
    )
    return base64.urlsafe_b64encode(b"\x01" + nonce + ciphertext).decode()


def open_secret(settings: Settings, org_id: uuid.UUID, value: str) -> str:
    try:
        raw = base64.b64decode(value, altchars=b"-_", validate=True)
        if len(raw) < 30 or raw[0] != 1:
            raise ValueError
        plaintext = AESGCM(_storage_key(settings)).decrypt(
            raw[1:13], raw[13:], f"resilience:nwc:{org_id}".encode()
        )
        secret = plaintext.decode()
        if not _hex32(secret):
            raise ValueError
        return secret
    except Exception as exc:
        raise NwcConnectionError("stored NWC connection cannot be decrypted") from exc
