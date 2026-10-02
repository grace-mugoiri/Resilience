"""Prototype session handling.

MOCK / STUB: this is intentionally not production authentication. Sessions
are opaque bearer tokens held in an in-memory dict, so they reset whenever
the server restarts and are not shared across multiple backend workers. A
real deployment would replace this with signed, expiring tokens (or a
Nostr-native auth scheme keyed off the identity's keypair) issued and
verified statelessly.
"""

import hashlib
import secrets
import uuid

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.identity import Identity

_SESSIONS: dict[str, str] = {}  # token -> identity_id


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def create_session(identity_id: str) -> str:
    token = secrets.token_urlsafe(24)
    _SESSIONS[token] = identity_id
    return token


def generate_recovery_phrase() -> str:
    words = [uuid.uuid4().hex[:4] for _ in range(6)]
    return "-".join(words)


def get_current_identity(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Identity:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing session token")
    token = authorization.removeprefix("Bearer ").strip()
    identity_id = _SESSIONS.get(token)
    if not identity_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    identity = db.get(Identity, identity_id)
    if not identity:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Identity no longer exists")
    return identity
