"""Opaque support-group membership management for relay admission."""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth.org import require_org_operation
from app.db.models import SupportGroup, SupportGroupMembership
from app.db.session import get_db
from app.relay.membership import blind_pubkey
from app.settings import Settings, get_settings

router = APIRouter(prefix="/v1/orgs/{org_id}/support-groups", tags=["support-groups"])
Db = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
HexPubkey = Annotated[str, Path(pattern=r"^[0-9a-f]{64}$")]
CreateKey = Annotated[str, Depends(require_org_operation("groups", "group:create:{org_id}"))]
MemberKey = Annotated[str, Depends(require_org_operation("groups", "group:member:{group_id}"))]


class GroupOut(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    active: bool


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
def create_group(org_id: uuid.UUID, _key: CreateKey, db: Db) -> GroupOut:
    group = SupportGroup(org_id=org_id)
    db.add(group)
    db.commit()
    return GroupOut(id=group.id, org_id=group.org_id, active=group.active)


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
    member.expires_at = body.expires_at
    member.active = True
    db.commit()
    return MembershipOut(
        group_id=group_id, role=member.role, active=member.active, expires_at=member.expires_at
    )


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
