"""Challenge-bound, scoped authorization layered on top of NIP-98."""

import hashlib
import re
import secrets
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.auth.nip98 import NostrPubkey
from app.db.models import AuthorizationChallenge
from app.db.session import get_db
from app.nostr.events import first_tag
from app.settings import Settings, get_settings

router = APIRouter(prefix="/v1/auth", tags=["authorization"])
Db = Annotated[Session, Depends(get_db)]
SCOPE_PATTERN = re.compile(
    r"^(admin:org:(approve|suspend):[0-9a-f-]{36}"
    r"|disbursement:(create|approve):[0-9a-f-]{36}"
    r"|group:(create|member):[0-9a-f-]{36})$"
)


class ChallengeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: str = Field(min_length=10, max_length=160)


class ChallengeOut(BaseModel):
    challenge: str
    scope: str
    expires_at: datetime


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


@router.post("/challenges", status_code=status.HTTP_201_CREATED)
def issue_challenge(
    body: ChallengeRequest,
    pubkey: NostrPubkey,
    db: Db,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ChallengeOut:
    if not SCOPE_PATTERN.fullmatch(body.scope):
        raise HTTPException(422, "unsupported sensitive-operation scope")
    nonce = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(seconds=settings.sensitive_challenge_seconds)
    db.add(
        AuthorizationChallenge(
            nonce_hash=_hash(nonce), pubkey=pubkey, scope=body.scope, expires_at=expires_at
        )
    )
    db.commit()
    return ChallengeOut(challenge=nonce, scope=body.scope, expires_at=expires_at)


def require_scoped_authorization(scope_template: str) -> Callable:
    async def dependency(request: Request, pubkey: NostrPubkey, db: Db) -> str:
        scope = scope_template.format(**request.path_params)
        event = request.state.nostr_event
        if first_tag(event, "scope") != scope:
            raise HTTPException(403, "sensitive authorization scope is missing or incorrect")
        challenge = first_tag(event, "challenge")
        if challenge is None:
            raise HTTPException(403, "sensitive authorization challenge is missing")
        now = datetime.now(UTC)
        result = db.execute(
            update(AuthorizationChallenge)
            .where(
                AuthorizationChallenge.nonce_hash == _hash(challenge),
                AuthorizationChallenge.pubkey == pubkey,
                AuthorizationChallenge.scope == scope,
                AuthorizationChallenge.expires_at > now,
                AuthorizationChallenge.used_at.is_(None),
            )
            .values(used_at=now)
        )
        db.commit()
        if result.rowcount != 1:
            raise HTTPException(
                403, "sensitive authorization challenge is invalid, expired, or used"
            )
        return pubkey

    return dependency
