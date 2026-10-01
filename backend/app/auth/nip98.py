"""NIP-98 HTTP auth. Every write request carries
`Authorization: Nostr <base64 of a signed kind 27235 event>`. No accounts, no passwords."""

import base64
import binascii
import hashlib
import json
import time
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db
from app.nostr.events import first_tag, verify_event
from app.settings import Settings, get_settings

AUTH_KIND = 27235
BODY_METHODS = {"POST", "PUT", "PATCH"}
# Writes are single-use. Reads may repeat inside the window: two identical GETs in the same
# second produce the same event id, and replaying a read changes nothing.
SINGLE_USE_METHODS = BODY_METHODS | {"DELETE"}


def _reject(reason: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"nip98: {reason}",
        headers={"WWW-Authenticate": "Nostr"},
    )


def expected_url(settings: Settings, request: Request) -> str:
    """The URL the client signed: PUBLIC_API_BASE plus path and query, never request.url."""
    url = settings.public_api_base + request.url.path
    if request.url.query:
        url += "?" + request.url.query
    return url


def _decode_header(header: str | None) -> dict:
    if not header or not header.startswith("Nostr "):
        raise _reject("missing 'Authorization: Nostr <token>' header")
    try:
        return json.loads(base64.b64decode(header[len("Nostr ") :].strip(), validate=True))
    except (binascii.Error, ValueError, UnicodeDecodeError) as exc:
        raise _reject("token is not base64 JSON") from exc


def _mark_seen(db: Session, event_id: str) -> bool:
    result = db.execute(
        text("INSERT INTO seen_auth_events (event_id) VALUES (:id) ON CONFLICT DO NOTHING"),
        {"id": event_id},
    )
    db.commit()
    return result.rowcount == 1


async def require_nostr_auth(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    db: Annotated[Session, Depends(get_db)],
) -> str:
    """Returns the caller's hex pubkey, or raises 401."""
    event = _decode_header(request.headers.get("authorization"))

    if not verify_event(event):
        raise _reject("invalid event or signature")
    if event["kind"] != AUTH_KIND:
        raise _reject(f"kind must be {AUTH_KIND}")
    if abs(int(time.time()) - event["created_at"]) > settings.nip98_window_seconds:
        raise _reject("event is outside the time window")
    if first_tag(event, "u") != expected_url(settings, request):
        raise _reject("'u' tag does not match the request URL")
    if (first_tag(event, "method") or "").upper() != request.method:
        raise _reject("'method' tag does not match the request method")

    if request.method in BODY_METHODS:
        body_hash = hashlib.sha256(await request.body()).hexdigest()
        if first_tag(event, "payload") != body_hash:
            raise _reject("'payload' tag missing or does not match the body")

    # Checked last, so a rejected request never burns an event id.
    if request.method in SINGLE_USE_METHODS and not await run_in_threadpool(
        _mark_seen, db, event["id"]
    ):
        raise _reject("event already used")

    return event["pubkey"]


NostrPubkey = Annotated[str, Depends(require_nostr_auth)]
