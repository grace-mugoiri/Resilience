"""Minimal NIP-01 event helpers: compute ids, verify and sign Schnorr signatures."""

import hashlib
import json
import time
from typing import Any

from coincurve import PrivateKey, PublicKeyXOnly

HEX = frozenset("0123456789abcdef")


def _is_hex(value: Any, length: int) -> bool:
    return isinstance(value, str) and len(value) == length and set(value) <= HEX


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def serialize(pubkey: str, created_at: int, kind: int, tags: list, content: str) -> bytes:
    return json.dumps(
        [0, pubkey, created_at, kind, tags, content], separators=(",", ":"), ensure_ascii=False
    ).encode()


def compute_id(event: dict) -> str:
    raw = serialize(
        event["pubkey"], event["created_at"], event["kind"], event["tags"], event["content"]
    )
    return hashlib.sha256(raw).hexdigest()


def is_well_formed(event: Any) -> bool:
    if not isinstance(event, dict):
        return False
    tags = event.get("tags")
    return (
        _is_hex(event.get("id"), 64)
        and _is_hex(event.get("pubkey"), 64)
        and _is_hex(event.get("sig"), 128)
        and _is_int(event.get("created_at"))
        and _is_int(event.get("kind"))
        and isinstance(event.get("content"), str)
        and isinstance(tags, list)
        and all(isinstance(t, list) and all(isinstance(x, str) for x in t) for t in tags)
    )


def verify_event(event: Any) -> bool:
    """True only if the event is well formed, its id matches its content and the signature holds."""
    if not is_well_formed(event):
        return False
    try:
        if compute_id(event) != event["id"]:
            return False
        key = PublicKeyXOnly(bytes.fromhex(event["pubkey"]))
        return key.verify(bytes.fromhex(event["sig"]), bytes.fromhex(event["id"]))
    except Exception:  # noqa: BLE001 - any parsing failure simply means "not valid"
        return False


def pubkey_of(secret_hex: str) -> str:
    return PrivateKey(bytes.fromhex(secret_hex)).public_key_xonly.format().hex()


def sign_event(
    secret_hex: str, kind: int, tags: list, content: str, created_at: int | None = None
) -> dict:
    """Sign an event. Used by scripts and tests; the server itself never holds user keys."""
    event = {
        "pubkey": pubkey_of(secret_hex),
        "created_at": int(time.time()) if created_at is None else created_at,
        "kind": kind,
        "tags": tags,
        "content": content,
    }
    event["id"] = compute_id(event)
    sig = PrivateKey(bytes.fromhex(secret_hex)).sign_schnorr(bytes.fromhex(event["id"]))
    event["sig"] = sig.hex()
    return event


def has_nul(event: dict) -> bool:
    """PostgreSQL JSONB cannot store U+0000, so events carrying it are refused up front."""
    strings = [event["content"], *(x for tag in event["tags"] for x in tag)]
    return any("\x00" in value for value in strings)


def first_tag(event: dict, name: str) -> str | None:
    for tag in event.get("tags", []):
        if len(tag) >= 2 and tag[0] == name:
            return tag[1]
    return None
