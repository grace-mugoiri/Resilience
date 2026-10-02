"""Shared helpers for directory tests: signed requests, fake websites, approved orgs."""

import json
import secrets
import time
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.models import Organization, OrganizationOperationalKey
from app.db.session import get_engine
from app.nostr.events import pubkey_of, sign_event
from tests.conftest import auth_header

BASE = "https://api.example.test"
ORG_SECRET = "0a" * 32
ORG_PUBKEY = pubkey_of(ORG_SECRET)
OPERATIONAL_SECRET = "0b" * 32
OPERATIONAL_PUBKEY = pubkey_of(OPERATIONAL_SECRET)
COUNSELLORS = [pubkey_of(f"{i:02x}" * 32) for i in range(1, 5)]


def sensitive_tags(client, scope: str, secret: str) -> list[list[str]]:
    body = json.dumps({"scope": scope}).encode()
    path = "/v1/auth/challenges"
    headers = auth_header(
        BASE + path,
        "POST",
        body,
        secret,
        extra_tags=[["client_nonce", secrets.token_hex(8)]],
    )
    headers["Content-Type"] = "application/json"
    response = client.post(path, content=body, headers=headers)
    assert response.status_code == 201
    return [["scope", scope], ["challenge", response.json()["challenge"]]]


def signed_post(client, path: str, payload, secret: str, created_at: int | None = None):
    body = b"" if payload is None else json.dumps(payload).encode()
    extra_tags = []
    if "/v1/admin/orgs/" in path and path.endswith(("/approve", "/suspend")):
        org_id = path.split("/")[4]
        action = path.rsplit("/", 1)[1]
        scope = f"admin:org:{action}:{org_id}"
        extra_tags = sensitive_tags(client, scope, secret)
    headers = auth_header(
        BASE + path,
        "POST",
        body,
        secret,
        created_at=created_at,
        extra_tags=extra_tags,
    )
    headers["Content-Type"] = "application/json"
    return client.post(path, content=body, headers=headers)


def signed_get(client, path: str, secret: str):
    return client.get(path, headers=auth_header(BASE + path, "GET", secret=secret))


def nostr_json(pubkey: str) -> tuple[int, bytes]:
    return 200, json.dumps({"names": {"_": pubkey}}).encode()


def approved_org(
    domain: str = "wangu.org",
    pubkey: str = ORG_PUBKEY,
    scopes: list[str] | None = None,
) -> uuid.UUID:
    with Session(get_engine()) as db:
        org = Organization(
            name="Wangu Centre",
            domain=domain,
            nostr_pubkey=pubkey,
            status="approved",
            nip05_verified_at=datetime.now(UTC),
            directory_visibility="public",
        )
        db.add(org)
        db.flush()
        now = int(time.time())
        authorization = operational_authorization(created_at=now - 3600, scopes=scopes)
        db.add(
            OrganizationOperationalKey(
                org_id=org.id,
                pubkey=OPERATIONAL_PUBKEY,
                authorization_event_id=authorization["id"],
                authorization_event=authorization,
                scopes=scopes or ["roster"],
                valid_from=datetime.fromtimestamp(now - 3600, UTC),
                expires_at=datetime.fromtimestamp(now + 30 * 86400, UTC),
            )
        )
        db.commit()
        return org.id


def operational_authorization(
    operational_pubkey: str = OPERATIONAL_PUBKEY,
    root_secret: str = ORG_SECRET,
    created_at: int | None = None,
    expires_in: int = 30 * 86400,
    scopes: list[str] | None = None,
) -> dict:
    now = int(time.time()) if created_at is None else created_at
    tags = [
        ["d", f"resilience:org-operations:{operational_pubkey}"],
        ["p", operational_pubkey],
        ["valid_from", str(now)],
        ["expiration", str(now + expires_in)],
        *[["scope", scope] for scope in (scopes or ["roster"])],
    ]
    return sign_event(root_secret, 30382, tags, "", created_at=now)


def operational_revocation(
    operational_pubkey: str = OPERATIONAL_PUBKEY,
    root_secret: str = ORG_SECRET,
    created_at: int | None = None,
) -> dict:
    now = int(time.time()) if created_at is None else created_at
    tags = [
        ["d", f"resilience:org-operations-revocation:{operational_pubkey}"],
        ["p", operational_pubkey],
    ]
    return sign_event(root_secret, 30383, tags, "", created_at=now)


def roster_event(
    members: list[str],
    secret: str = OPERATIONAL_SECRET,
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
