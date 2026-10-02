"""Fail-closed event admission decisions shared by the gRPC server and unit tests."""

import time
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.db.models import CounsellorAttestation, SupportGroup, SupportGroupMembership
from app.relay.membership import blind_pubkey
from app.settings import Settings

ALLOWED_KINDS = frozenset({0, 1059, 21059, 30000, 30078, 30382, 30383})
STORED_GIFT_WRAP = 1059
EPHEMERAL_GIFT_WRAP = 21059


@dataclass(frozen=True)
class AdmissionEvent:
    pubkey: str
    created_at: int
    kind: int
    tags: list[list[str]]


@dataclass(frozen=True)
class AdmissionDecision:
    permit: bool
    message: str


def _single_tag(tags: list[list[str]], name: str) -> str | None:
    values = [tag[1] for tag in tags if len(tag) >= 2 and tag[0] == name]
    return values[0] if len(values) == 1 else None


def _hex_pubkey(value: str | None) -> bool:
    return value is not None and len(value) == 64 and set(value) <= set("0123456789abcdef")


def _active_counsellor(db: Session, pubkey: str, now: datetime) -> bool:
    return bool(
        db.scalar(
            select(
                exists().where(
                    CounsellorAttestation.counsellor_pubkey == pubkey,
                    CounsellorAttestation.active.is_(True),
                    or_(
                        CounsellorAttestation.expires_at.is_(None),
                        CounsellorAttestation.expires_at > now,
                    ),
                )
            )
        )
    )


def _share_active_group(
    db: Session, sender: str, recipient: str, settings: Settings, now: datetime
) -> bool:
    sender_hash = blind_pubkey(settings.relay_policy_hmac_key, sender)
    recipient_hash = blind_pubkey(settings.relay_policy_hmac_key, recipient)
    sender_member = SupportGroupMembership.__table__.alias("sender_member")
    recipient_member = SupportGroupMembership.__table__.alias("recipient_member")
    return bool(
        db.scalar(
            select(
                exists()
                .select_from(
                    sender_member.join(
                        recipient_member,
                        sender_member.c.group_id == recipient_member.c.group_id,
                    ).join(SupportGroup, SupportGroup.id == sender_member.c.group_id)
                )
                .where(
                    sender_member.c.member_hash == sender_hash,
                    recipient_member.c.member_hash == recipient_hash,
                    sender_member.c.active.is_(True),
                    recipient_member.c.active.is_(True),
                    SupportGroup.active.is_(True),
                    or_(sender_member.c.expires_at.is_(None), sender_member.c.expires_at > now),
                    or_(
                        recipient_member.c.expires_at.is_(None),
                        recipient_member.c.expires_at > now,
                    ),
                )
            )
        )
    )


def decide(
    db: Session,
    event: AdmissionEvent,
    authenticated_pubkey: str | None,
    settings: Settings,
    now_seconds: int | None = None,
) -> AdmissionDecision:
    """Authorize one relay write without inspecting encrypted content."""
    now_seconds = int(time.time()) if now_seconds is None else now_seconds
    now = datetime.fromtimestamp(now_seconds, UTC)
    if event.kind not in ALLOWED_KINDS:
        return AdmissionDecision(False, "blocked: event kind is not allowed")
    if not _hex_pubkey(authenticated_pubkey):
        return AdmissionDecision(False, "auth-required: NIP-42 authentication required")

    if event.kind not in {STORED_GIFT_WRAP, EPHEMERAL_GIFT_WRAP}:
        if authenticated_pubkey != event.pubkey:
            return AdmissionDecision(False, "restricted: authenticated key must sign metadata")
        return AdmissionDecision(True, "permitted metadata event")

    recipient = _single_tag(event.tags, "p")
    if not _hex_pubkey(recipient):
        return AdmissionDecision(False, "invalid: gift wrap needs exactly one recipient")
    expiration = _single_tag(event.tags, "expiration")
    if expiration is None or not expiration.isdigit():
        return AdmissionDecision(False, "invalid: gift wrap needs exactly one expiration")
    expires_at = int(expiration)
    max_seconds = (
        settings.guest_event_max_seconds
        if event.kind == EPHEMERAL_GIFT_WRAP
        else settings.account_event_max_seconds
    )
    if expires_at <= now_seconds or expires_at > now_seconds + max_seconds:
        return AdmissionDecision(False, "invalid: gift-wrap retention window is not allowed")

    # Guest wraps are ephemeral by their NIP-59 kind and are never persisted by the relay.
    if event.kind == EPHEMERAL_GIFT_WRAP:
        return AdmissionDecision(True, "permitted ephemeral guest gift wrap")
    assert recipient is not None and authenticated_pubkey is not None
    if recipient == authenticated_pubkey:
        return AdmissionDecision(True, "permitted sender backup copy")
    if _active_counsellor(db, authenticated_pubkey, now) or _active_counsellor(db, recipient, now):
        return AdmissionDecision(True, "permitted counsellor conversation")
    if _share_active_group(db, authenticated_pubkey, recipient, settings, now):
        return AdmissionDecision(True, "permitted support-group delivery")
    return AdmissionDecision(False, "restricted: sender and recipient have no active relationship")
