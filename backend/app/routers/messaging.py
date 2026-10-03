"""Private relationship, safety, and counselor-presence operations.

Routine message content never passes through these endpoints. The API stores only keyed hashes for
circle and block relationships; a report contains message excerpts only when the reporter explicitly
chooses to attach them.
"""

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session

from app.auth.nip98 import NostrPubkey
from app.db.models import (
    BlockedPeer,
    CircleInvite,
    CounsellorAttestation,
    CounsellorAvailability,
    PrivateCircle,
    PrivateCircleMember,
    SafetyReport,
)
from app.db.session import get_db
from app.privacy.member_box import (
    membership_context,
    opaque_room_id,
    open_member_pubkey,
    seal_member_pubkey,
)
from app.relay.membership import blind_pubkey
from app.settings import Settings, get_settings

router = APIRouter(prefix="/v1", tags=["messaging controls"])
Db = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
HEX64 = r"^[0-9a-f]{64}$"


def _code_hash(settings: Settings, code: str) -> str:
    return hmac.new(
        settings.relay_policy_hmac_key.encode(), code.upper().encode(), hashlib.sha256
    ).hexdigest()


def _circle_for(db: Session, member_hash: str) -> PrivateCircle | None:
    return db.scalar(
        select(PrivateCircle)
        .join(PrivateCircleMember, PrivateCircleMember.circle_id == PrivateCircle.id)
        .where(
            PrivateCircleMember.member_hash == member_hash,
            PrivateCircleMember.active.is_(True),
            PrivateCircle.active.is_(True),
        )
    )


class CircleInviteOut(BaseModel):
    circle_id: uuid.UUID
    code: str
    expires_at: datetime


class CircleClaimIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=6, max_length=40)


class CircleClaimOut(BaseModel):
    circle_id: uuid.UUID
    inviter_pubkey: str


class CircleStatusOut(BaseModel):
    circle_id: uuid.UUID | None
    member_count: int
    owner: bool
    membership_revision: int | None = None


class CircleRecipientsOut(BaseModel):
    circle_id: uuid.UUID
    room_id: str
    membership_revision: int
    recipients: list[str]


@router.post("/circle/invites", status_code=status.HTTP_201_CREATED)
def create_circle_invite(caller: NostrPubkey, db: Db, settings: SettingsDep) -> CircleInviteOut:
    caller_hash = blind_pubkey(settings.relay_policy_hmac_key, caller)
    circle = _circle_for(db, caller_hash)
    if circle is None:
        circle = PrivateCircle(owner_hash=caller_hash)
        db.add(circle)
        db.flush()
        db.add(
            PrivateCircleMember(
                circle_id=circle.id,
                member_hash=caller_hash,
                member_box=seal_member_pubkey(
                    settings,
                    caller,
                    membership_context("circle", circle.id, caller_hash),
                ),
            )
        )
    if circle.owner_hash != caller_hash:
        raise HTTPException(403, "only the circle owner can invite members")
    members = db.scalar(
        select(func.count())
        .select_from(PrivateCircleMember)
        .where(
            PrivateCircleMember.circle_id == circle.id,
            PrivateCircleMember.active.is_(True),
        )
    )
    if int(members or 0) >= 3:
        raise HTTPException(409, "a circle can contain at most three people")
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = "".join(secrets.choice(alphabet) for _ in range(8))
    code = f"{code[:4]}-{code[4:]}"
    expires_at = datetime.now(UTC) + timedelta(hours=24)
    db.add(
        CircleInvite(
            circle_id=circle.id,
            code_hash=_code_hash(settings, code),
            inviter_pubkey=caller,
            expires_at=expires_at,
        )
    )
    db.commit()
    return CircleInviteOut(circle_id=circle.id, code=code, expires_at=expires_at)


@router.post("/circle/invites/claim")
def claim_circle_invite(
    body: CircleClaimIn, caller: NostrPubkey, db: Db, settings: SettingsDep
) -> CircleClaimOut:
    invite = db.scalar(
        select(CircleInvite)
        .where(CircleInvite.code_hash == _code_hash(settings, body.code))
        .with_for_update()
    )
    now = datetime.now(UTC)
    if invite is None or invite.used_at is not None or invite.expires_at <= now:
        raise HTTPException(404, "invite is invalid, expired, or already used")
    if invite.inviter_pubkey is None or invite.inviter_pubkey == caller:
        raise HTTPException(409, "invite cannot be claimed by its creator")
    caller_hash = blind_pubkey(settings.relay_policy_hmac_key, caller)
    if _circle_for(db, caller_hash) is not None:
        raise HTTPException(409, "this identity already belongs to a circle")
    count = db.scalar(
        select(func.count())
        .select_from(PrivateCircleMember)
        .where(
            PrivateCircleMember.circle_id == invite.circle_id,
            PrivateCircleMember.active.is_(True),
        )
    )
    if int(count or 0) >= 3:
        raise HTTPException(409, "the circle is full")
    db.add(
        PrivateCircleMember(
            circle_id=invite.circle_id,
            member_hash=caller_hash,
            member_box=seal_member_pubkey(
                settings,
                caller,
                membership_context("circle", invite.circle_id, caller_hash),
            ),
        )
    )
    circle = db.get(PrivateCircle, invite.circle_id)
    assert circle is not None
    circle.membership_revision += 1
    inviter = invite.inviter_pubkey
    invite.used_at = now
    invite.inviter_pubkey = None
    db.commit()
    return CircleClaimOut(circle_id=invite.circle_id, inviter_pubkey=inviter)


@router.get("/circle")
def circle_status(caller: NostrPubkey, db: Db, settings: SettingsDep) -> CircleStatusOut:
    caller_hash = blind_pubkey(settings.relay_policy_hmac_key, caller)
    circle = _circle_for(db, caller_hash)
    if circle is None:
        return CircleStatusOut(circle_id=None, member_count=0, owner=False)
    count = db.scalar(
        select(func.count())
        .select_from(PrivateCircleMember)
        .where(
            PrivateCircleMember.circle_id == circle.id,
            PrivateCircleMember.active.is_(True),
        )
    )
    return CircleStatusOut(
        circle_id=circle.id,
        member_count=int(count or 0),
        owner=circle.owner_hash == caller_hash,
        membership_revision=circle.membership_revision,
    )


@router.put("/circle/routing-key", response_model=CircleStatusOut)
def refresh_circle_routing_key(
    caller: NostrPubkey, db: Db, settings: SettingsDep
) -> CircleStatusOut:
    """Reissue the caller's encrypted routing key after a server-key migration."""
    caller_hash = blind_pubkey(settings.relay_policy_hmac_key, caller)
    circle = _circle_for(db, caller_hash)
    if circle is None:
        raise HTTPException(404, "circle not found")
    member = db.get(PrivateCircleMember, (circle.id, caller_hash))
    assert member is not None
    member.member_box = seal_member_pubkey(
        settings,
        caller,
        membership_context("circle", circle.id, caller_hash),
    )
    count = db.scalar(
        select(func.count())
        .select_from(PrivateCircleMember)
        .where(
            PrivateCircleMember.circle_id == circle.id,
            PrivateCircleMember.active.is_(True),
        )
    )
    db.commit()
    return CircleStatusOut(
        circle_id=circle.id,
        member_count=int(count or 0),
        owner=circle.owner_hash == caller_hash,
        membership_revision=circle.membership_revision,
    )


@router.get("/circle/recipients")
def circle_recipients(
    caller: NostrPubkey,
    db: Db,
    settings: SettingsDep,
    response: Response,
) -> CircleRecipientsOut:
    caller_hash = blind_pubkey(settings.relay_policy_hmac_key, caller)
    circle = _circle_for(db, caller_hash)
    if circle is None:
        raise HTTPException(404, "circle not found")
    members = db.scalars(
        select(PrivateCircleMember).where(
            PrivateCircleMember.circle_id == circle.id,
            PrivateCircleMember.active.is_(True),
        )
    ).all()
    try:
        recipients = [
            open_member_pubkey(
                settings,
                member.member_box or "",
                membership_context("circle", circle.id, member.member_hash),
            )
            for member in members
            if member.member_hash != caller_hash
        ]
    except ValueError as exc:
        raise HTTPException(409, "circle routing keys must be reissued") from exc
    response.headers["Cache-Control"] = "no-store"
    return CircleRecipientsOut(
        circle_id=circle.id,
        room_id=opaque_room_id(settings, "circle", circle.id, circle.membership_revision),
        membership_revision=circle.membership_revision,
        recipients=recipients,
    )


@router.delete("/circle/{circle_id}/members/{peer_pubkey}")
def remove_circle_member(
    circle_id: uuid.UUID,
    peer_pubkey: Annotated[str, Field(pattern=HEX64)],
    caller: NostrPubkey,
    db: Db,
    settings: SettingsDep,
) -> CircleStatusOut:
    circle = db.get(PrivateCircle, circle_id)
    caller_hash = blind_pubkey(settings.relay_policy_hmac_key, caller)
    peer_hash = blind_pubkey(settings.relay_policy_hmac_key, peer_pubkey)
    if circle is None or not circle.active:
        raise HTTPException(404, "circle not found")
    if caller_hash != circle.owner_hash and caller_hash != peer_hash:
        raise HTTPException(403, "only the owner can remove another member")
    member = db.get(PrivateCircleMember, (circle_id, peer_hash))
    if member is None or not member.active:
        raise HTTPException(404, "circle member not found")
    member.active = False
    circle.membership_revision += 1
    db.commit()
    count = db.scalar(
        select(func.count())
        .select_from(PrivateCircleMember)
        .where(
            PrivateCircleMember.circle_id == circle.id,
            PrivateCircleMember.active.is_(True),
        )
    )
    return CircleStatusOut(
        circle_id=circle.id,
        member_count=int(count or 0),
        owner=circle.owner_hash == caller_hash,
        membership_revision=circle.membership_revision,
    )


class BlockOut(BaseModel):
    blocked_pubkey: str
    active: bool


@router.put("/blocks/{peer_pubkey}")
def block_peer(
    peer_pubkey: Annotated[str, Field(pattern=HEX64)],
    caller: NostrPubkey,
    db: Db,
    settings: SettingsDep,
) -> BlockOut:
    if caller == peer_pubkey:
        raise HTTPException(422, "an identity cannot block itself")
    key = (
        blind_pubkey(settings.relay_policy_hmac_key, caller),
        blind_pubkey(settings.relay_policy_hmac_key, peer_pubkey),
    )
    record = db.get(BlockedPeer, key)
    if record is None:
        record = BlockedPeer(blocker_hash=key[0], blocked_hash=key[1])
        db.add(record)
    record.active = True
    db.commit()
    return BlockOut(blocked_pubkey=peer_pubkey, active=True)


@router.delete("/blocks/{peer_pubkey}")
def unblock_peer(
    peer_pubkey: Annotated[str, Field(pattern=HEX64)],
    caller: NostrPubkey,
    db: Db,
    settings: SettingsDep,
) -> BlockOut:
    key = (
        blind_pubkey(settings.relay_policy_hmac_key, caller),
        blind_pubkey(settings.relay_policy_hmac_key, peer_pubkey),
    )
    record = db.get(BlockedPeer, key)
    if record is not None:
        record.active = False
        db.commit()
    return BlockOut(blocked_pubkey=peer_pubkey, active=False)


class ReportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject_pubkey: str = Field(pattern=HEX64)
    reason: Literal["harassment", "personal_details", "impersonation", "spam", "other"]
    evidence: list[str] | None = Field(default=None, max_length=5)


class ReportOut(BaseModel):
    id: uuid.UUID
    status: str
    created_at: datetime


@router.post("/reports", status_code=status.HTTP_201_CREATED)
def create_report(body: ReportIn, caller: NostrPubkey, db: Db, settings: SettingsDep) -> ReportOut:
    evidence = None
    if body.evidence is not None:
        evidence = [line.strip()[:2000] for line in body.evidence if line.strip()]
    report = SafetyReport(
        reporter_hash=blind_pubkey(settings.relay_policy_hmac_key, caller),
        subject_pubkey=body.subject_pubkey,
        reason=body.reason,
        evidence=evidence,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return ReportOut(id=report.id, status=report.status, created_at=report.created_at)


class AvailabilityIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    available: bool
    working_hours: str | None = Field(default=None, max_length=120)


class AvailabilityOut(BaseModel):
    available: bool
    working_hours: str | None
    updated_at: datetime


@router.put("/counselors/me/availability")
def set_availability(
    body: AvailabilityIn, caller: NostrPubkey, request: Request, db: Db
) -> AvailabilityOut:
    now = datetime.now(UTC)
    is_counsellor = db.scalar(
        select(
            exists().where(
                CounsellorAttestation.counsellor_pubkey == caller,
                CounsellorAttestation.active.is_(True),
                or_(
                    CounsellorAttestation.expires_at.is_(None),
                    CounsellorAttestation.expires_at > now,
                ),
            )
        )
    )
    if not is_counsellor:
        raise HTTPException(403, "only a currently verified counselor can publish availability")
    record = db.get(CounsellorAvailability, caller)
    if record is None:
        record = CounsellorAvailability(
            counsellor_pubkey=caller, auth_event=request.state.nostr_event
        )
        db.add(record)
    record.available = body.available
    record.working_hours = body.working_hours
    record.auth_event = request.state.nostr_event
    db.commit()
    db.refresh(record)
    return AvailabilityOut(
        available=record.available,
        working_hours=record.working_hours,
        updated_at=record.updated_at,
    )
