"""Authenticated encryption for private-room routing keys."""

import base64
import hashlib
import hmac
import os
import uuid

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.settings import Settings

PREFIX = "v1"


def membership_context(room_type: str, room_id: uuid.UUID, member_hash: str) -> str:
    return f"{room_type}:{room_id}:{member_hash}"


def opaque_room_id(
    settings: Settings, room_type: str, room_id: uuid.UUID, membership_revision: int
) -> str:
    """Return an opaque ID that changes whenever room membership changes."""
    material = f"{room_type}:{room_id}:{membership_revision}".encode()
    return hmac.new(settings.relay_policy_hmac_key.encode(), material, hashlib.sha256).hexdigest()


def _key(settings: Settings) -> bytes:
    return hashlib.sha256(
        b"resilience/member-box/v1\x00" + settings.membership_box_key.encode()
    ).digest()


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def seal_member_pubkey(settings: Settings, pubkey: str, context: str) -> str:
    """Encrypt a public routing key and bind it to one membership row."""
    nonce = os.urandom(12)
    ciphertext = AESGCM(_key(settings)).encrypt(nonce, pubkey.encode(), context.encode())
    return f"{PREFIX}.{_encode(nonce)}.{_encode(ciphertext)}"


def open_member_pubkey(settings: Settings, box: str, context: str) -> str:
    """Open a routing key only in the context where it was originally stored."""
    try:
        prefix, encoded_nonce, encoded_ciphertext = box.split(".", 2)
        if prefix != PREFIX:
            raise ValueError("unsupported member box version")
        plaintext = AESGCM(_key(settings)).decrypt(
            _decode(encoded_nonce), _decode(encoded_ciphertext), context.encode()
        )
        pubkey = plaintext.decode()
    except Exception as exc:
        raise ValueError("invalid member routing box") from exc
    if len(pubkey) != 64 or not set(pubkey) <= set("0123456789abcdef"):
        raise ValueError("member routing box does not contain a public key")
    return pubkey
