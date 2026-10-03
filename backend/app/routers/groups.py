"""Opaque support-group membership management for relay admission."""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.nip98 import NostrPubkey
from app.auth.org import require_org_operation
from app.db.models import (
    Organization,
    SupportGroup,
    SupportGroupJoinRequest,
    SupportGroupMembership,
)
from app.db.session import get_db
from app.relay.membership import blind_pubkey
from app.settings import Settings, get_settings

router = APIRouter(prefix="/v1/orgs/{org_id}/support-groups", tags=["support-groups"])
member_router = APIRouter(prefix="/v1/support-groups", tags=["support-groups"])
Db = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
HexPubkey = Annotated[str, Path(pattern=r"^[0-9a-f]{64}$")]
CreateKey = Annotated[str, Depends(require_org_operation("groups", "group:create:{org_id}"))]
MemberKey = Annotated[str, Depends(require_org_operation("groups", "group:member:{group_id}"))]


class GroupOut(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    active: bool
    slug: str | None = None
    title: str | None = None
    description: str | None = None
    access: str = "request"
    leader_name: str | None = None
    organization_name: str | None = None


class GroupCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9-]{2,80}$")
    title: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    access: Literal["open", "request"] = "request"
    leader_name: str | None = Field(default=None, max_length=80)


class MembershipIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["member", "moderator"] = "member"
    expires_at: datetime | None = None


class MembershipOut(BaseModel):
    group_id: uuid.UUID
    role: str
    active: bool
    expires_at: datetime | None


def _group(db: Session, org_id: uuid.UUID, group_id: uuid.UUID) -> SupportGroup:
    group = db.get(SupportGroup, group_id)
    if group is None or group.org_id != org_id or not group.active:
        raise HTTPException(404, "support group not found")
    return group


@router.post("", status_code=status.HTTP_201_CREATED)
def create_group(org_id: uuid.UUID, body: GroupCreateIn, _key: CreateKey, db: Db) -> GroupOut:
    group = SupportGroup(org_id=org_id, **body.model_dump())
    db.add(group)
    db.commit()
    return GroupOut.model_validate(group, from_attributes=True)


@router.put("/{group_id}/members/{pubkey}")
def put_member(
    org_id: uuid.UUID,
    group_id: uuid.UUID,
    pubkey: HexPubkey,
    body: MembershipIn,
    _key: MemberKey,
    db: Db,
    settings: SettingsDep,
) -> MembershipOut:
    _group(db, org_id, group_id)
    if body.expires_at is not None and body.expires_at <= datetime.now(UTC):
        raise HTTPException(422, "membership expiry must be in the future")
    member_hash = blind_pubkey(settings.relay_policy_hmac_key, pubkey)
    member = db.get(SupportGroupMembership, (group_id, member_hash))
    if member is None:
        member = SupportGroupMembership(group_id=group_id, member_hash=member_hash)
        db.add(member)
    member.role = body.role
    member.member_box = None
    member.expires_at = body.expires_at
    member.active = True
    db.commit()
    return MembershipOut(
        group_id=group_id, role=member.role, active=member.active, expires_at=member.expires_at
    )


class JoinOut(BaseModel):
    group_id: uuid.UUID
    status: Literal["pending", "approved", "rejected"]
    role: str | None = None


@member_router.get("")
def public_groups(db: Db) -> list[GroupOut]:
    rows = db.execute(
        select(SupportGroup, Organization.name)
        .join(Organization, Organization.id == SupportGroup.org_id)
        .where(SupportGroup.active.is_(True), Organization.status == "approved")
        .order_by(SupportGroup.created_at)
    ).all()
    return [
        GroupOut(
            id=group.id,
            org_id=group.org_id,
            active=group.active,
            slug=group.slug,
            title=group.title,
            description=group.description,
            access=group.access,
            leader_name=group.leader_name,
            organization_name=org_name,
        )
        for group, org_name in rows
    ]


def _join_state(db: Session, group: SupportGroup, member_hash: str) -> JoinOut:
    member = db.get(SupportGroupMembership, (group.id, member_hash))
    if member is not None and member.active:
        return JoinOut(group_id=group.id, status="approved", role=member.role)
    request = db.scalar(
        select(SupportGroupJoinRequest).where(
            SupportGroupJoinRequest.group_id == group.id,
            SupportGroupJoinRequest.member_hash == member_hash,
        )
    )
    return JoinOut(
        group_id=group.id,
        status=request.status if request is not None else "rejected",
    )


@member_router.get("/{group_id}/membership")
def my_membership(
    group_id: uuid.UUID, caller: NostrPubkey, db: Db, settings: SettingsDep
) -> JoinOut:
    group = db.get(SupportGroup, group_id)
    if group is None or not group.active:
        raise HTTPException(404, "support group not found")
    return _join_state(db, group, blind_pubkey(settings.relay_policy_hmac_key, caller))


@member_router.post("/{group_id}/join")
def join_group(group_id: uuid.UUID, caller: NostrPubkey, db: Db, settings: SettingsDep) -> JoinOut:
    group = db.get(SupportGroup, group_id)
    if group is None or not group.active:
        raise HTTPException(404, "support group not found")
    member_hash = blind_pubkey(settings.relay_policy_hmac_key, caller)
    member = db.get(SupportGroupMembership, (group_id, member_hash))
    if member is not None and member.active:
        return JoinOut(group_id=group_id, status="approved", role=member.role)
    if group.access == "open":
        if member is None:
            member = SupportGroupMembership(group_id=group_id, member_hash=member_hash)
            db.add(member)
        member.active = True
        db.commit()
        return JoinOut(group_id=group_id, status="approved", role=member.role)
    request = db.scalar(
        select(SupportGroupJoinRequest)
        .where(
            SupportGroupJoinRequest.group_id == group_id,
            SupportGroupJoinRequest.member_hash == member_hash,
        )
        .with_for_update()
    )
    if request is None:
        # Kept only while the organisation reviews the request. It is erased on approval/rejection.
        request = SupportGroupJoinRequest(
            group_id=group_id, member_hash=member_hash, member_box=caller
        )
        db.add(request)
    elif request.status == "rejected":
        request.status = "pending"
        request.member_box = caller
        request.reviewed_at = None
        request.reviewed_by_pubkey = None
    db.commit()
    return JoinOut(group_id=group_id, status=request.status)


@member_router.delete("/{group_id}/membership")
def leave_group(group_id: uuid.UUID, caller: NostrPubkey, db: Db, settings: SettingsDep) -> JoinOut:
    member_hash = blind_pubkey(settings.relay_policy_hmac_key, caller)
    member = db.get(SupportGroupMembership, (group_id, member_hash))
    if member is None:
        raise HTTPException(404, "support-group membership not found")
    member.active = False
    db.commit()
    return JoinOut(group_id=group_id, status="rejected")


class JoinRequestOut(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    member_pubkey: str
    status: str
    created_at: datetime


@router.get("/{group_id}/join-requests")
def list_join_requests(
    org_id: uuid.UUID, group_id: uuid.UUID, _key: MemberKey, db: Db
) -> list[JoinRequestOut]:
    _group(db, org_id, group_id)
    requests = db.scalars(
        select(SupportGroupJoinRequest).where(
            SupportGroupJoinRequest.group_id == group_id,
            SupportGroupJoinRequest.status == "pending",
        )
    ).all()
    return [
        JoinRequestOut(
            id=item.id,
            group_id=item.group_id,
            member_pubkey=item.member_box,
            status=item.status,
            created_at=item.created_at,
        )
        for item in requests
    ]


@router.post("/{group_id}/join-requests/{request_id}/approve")
def approve_join_request(
    org_id: uuid.UUID,
    group_id: uuid.UUID,
    request_id: uuid.UUID,
    reviewer: MemberKey,
    db: Db,
) -> JoinOut:
    _group(db, org_id, group_id)
    request = db.get(SupportGroupJoinRequest, request_id)
    if request is None or request.group_id != group_id or request.status != "pending":
        raise HTTPException(404, "pending join request not found")
    member = db.get(SupportGroupMembership, (group_id, request.member_hash))
    if member is None:
        member = SupportGroupMembership(group_id=group_id, member_hash=request.member_hash)
        db.add(member)
    member.active = True
    request.status = "approved"
    request.reviewed_by_pubkey = reviewer
    request.reviewed_at = datetime.now(UTC)
    request.member_box = ""
    db.commit()
    return JoinOut(group_id=group_id, status="approved", role=member.role)


@router.delete("/{group_id}/members/{pubkey}")
def remove_member(
    org_id: uuid.UUID,
    group_id: uuid.UUID,
    pubkey: HexPubkey,
    _key: MemberKey,
    db: Db,
    settings: SettingsDep,
) -> MembershipOut:
    _group(db, org_id, group_id)
    member = db.get(
        SupportGroupMembership,
        (group_id, blind_pubkey(settings.relay_policy_hmac_key, pubkey)),
    )
    if member is None:
        raise HTTPException(404, "support-group member not found")
    member.active = False
    db.commit()
    return MembershipOut(
        group_id=group_id, role=member.role, active=member.active, expires_at=member.expires_at
    )
