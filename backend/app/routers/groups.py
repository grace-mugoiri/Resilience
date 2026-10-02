from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.group import Group, GroupMembership, GroupMessage, MembershipStatus
from app.models.identity import Identity
from app.schemas.group import (
    GroupJoinResponse,
    GroupMessageCreateRequest,
    GroupMessageResponse,
    GroupResponse,
)
from app.security import get_current_identity

router = APIRouter(prefix="/api/groups", tags=["groups"])


def _membership(db: Session, group_id: str, identity_id: str) -> GroupMembership | None:
    return db.query(GroupMembership).filter_by(group_id=group_id, identity_id=identity_id).one_or_none()


def _to_response(db: Session, group: Group, identity_id: str) -> GroupResponse:
    membership = _membership(db, group.id, identity_id)
    return GroupResponse(
        id=group.id, name=group.name, description=group.description, topic=group.topic,
        member_count=group.member_count, facilitator_name=group.facilitator_name,
        requires_approval=group.requires_approval,
        rules=[r.strip() for r in group.rules.split("\n") if r.strip()],
        is_member=membership is not None and membership.status == MembershipStatus.APPROVED,
        is_pending=membership is not None and membership.status == MembershipStatus.PENDING,
    )


@router.get("", response_model=list[GroupResponse])
def list_groups(
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    return [_to_response(db, g, current.id) for g in db.query(Group).all()]


@router.get("/{group_id}", response_model=GroupResponse)
def get_group(group_id: str, current: Identity = Depends(get_current_identity), db: Session = Depends(get_db)):
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")
    return _to_response(db, group, current.id)


@router.post("/{group_id}/join", response_model=GroupJoinResponse)
def join_group(group_id: str, current: Identity = Depends(get_current_identity), db: Session = Depends(get_db)):
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")

    membership = _membership(db, group_id, current.id)
    if membership is None:
        new_status = MembershipStatus.PENDING if group.requires_approval else MembershipStatus.APPROVED
        db.add(GroupMembership(group_id=group_id, identity_id=current.id, status=new_status))
        if new_status == MembershipStatus.APPROVED:
            group.member_count += 1
        db.commit()
        membership_status = new_status
    else:
        membership_status = membership.status

    return GroupJoinResponse(
        group_id=group_id,
        joined=membership_status == MembershipStatus.APPROVED,
        pending=membership_status == MembershipStatus.PENDING,
        member_count=group.member_count,
    )


def _require_membership(db: Session, group_id: str, identity_id: str) -> None:
    membership = _membership(db, group_id, identity_id)
    if membership is None or membership.status != MembershipStatus.APPROVED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Join the group to view its messages")


@router.get("/{group_id}/messages", response_model=list[GroupMessageResponse])
def list_group_messages(
    group_id: str, current: Identity = Depends(get_current_identity), db: Session = Depends(get_db)
):
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")
    _require_membership(db, group_id, current.id)
    return (
        db.query(GroupMessage)
        .filter_by(group_id=group_id)
        .order_by(GroupMessage.created_at.asc())
        .all()
    )


@router.post("/{group_id}/messages", response_model=GroupMessageResponse, status_code=status.HTTP_201_CREATED)
def post_group_message(
    group_id: str,
    payload: GroupMessageCreateRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")
    _require_membership(db, group_id, current.id)

    existing = db.query(GroupMessage).filter_by(client_message_id=payload.client_message_id).one_or_none()
    if existing is not None:
        return existing  # idempotent replay from the offline queue

    message = GroupMessage(
        group_id=group_id,
        sender_identity_id=current.id,
        sender_pseudonym=current.pseudonym,
        body=payload.body,
        client_message_id=payload.client_message_id,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message
