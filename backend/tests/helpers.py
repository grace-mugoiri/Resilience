"""Shared helpers for directory tests: signed requests, fake websites, approved orgs."""

import json
import time
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.models import Organization
from app.db.session import get_engine
from app.nostr.events import pubkey_of, sign_event
from tests.conftest import auth_header

BASE = "https://api.example.test"
ORG_SECRET = "0a" * 32
ORG_PUBKEY = pubkey_of(ORG_SECRET)
COUNSELLORS = [pubkey_of(f"{i:02x}" * 32) for i in range(1, 5)]


def signed_post(client, path: str, payload, secret: str, created_at: int | None = None):
    body = b"" if payload is None else json.dumps(payload).encode()
    headers = auth_header(BASE + path, "POST", body, secret, created_at=created_at)
    headers["Content-Type"] = "application/json"
    return client.post(path, content=body, headers=headers)


def signed_get(client, path: str, secret: str):
    return client.get(path, headers=auth_header(BASE + path, "GET", secret=secret))


def nostr_json(pubkey: str) -> tuple[int, bytes]:
    return 200, json.dumps({"names": {"_": pubkey}}).encode()


def approved_org(domain: str = "wangu.org", pubkey: str = ORG_PUBKEY) -> uuid.UUID:
    with Session(get_engine()) as db:
        org = Organization(
            name="Wangu Centre",
            domain=domain,
            nostr_pubkey=pubkey,
            status="approved",
            nip05_verified_at=datetime.now(UTC),
        )
        db.add(org)
        db.commit()
        return org.id


def roster_event(
    members: list[str],
    secret: str = ORG_SECRET,
    created_at: int | None = None,
    expires_in: int | None = 30 * 86400,
    kind: int = 30000,
    d: str = "verified-counsellors",
) -> dict:
    now = int(time.time())
    tags = [["d", d]] + [["p", key] for key in members]
    if expires_in is not None:
        tags.append(["expiration", str(now + expires_in)])
    return sign_event(secret, kind, tags, "", created_at=created_at or now)


def profile_event(
    secret: str,
    content: dict | str | None = None,
    created_at: int | None = None,
    kind: int = 0,
    tags: list | None = None,
) -> dict:
    if content is None:
        content = {
            "name": "grace",
            "display_name": "Counsellor Grace",
            "about": "Trauma-informed counsellor.",
            "specialties": ["Trauma support", "Legal aid"],
            "languages": ["English", "Kiswahili"],
            "response_time": "Usually replies within a few hours",
            "picture": "https://images.example/grace.jpg",
        }
    body = content if isinstance(content, str) else json.dumps(content)
    return sign_event(secret, kind, tags or [], body, created_at=created_at or int(time.time()))
