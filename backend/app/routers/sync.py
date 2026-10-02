from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.group import GroupMembership, GroupMessage, MembershipStatus
from app.models.identity import Identity
from app.models.message import Conversation, DirectMessage
from app.schemas.sync import QueuedMessageTarget, SyncRequest, SyncResponse, SyncResultItem
from app.security import get_current_identity

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("", response_model=SyncResponse)
def sync_queued_messages(
    payload: SyncRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    """Replays messages queued while the client was offline.

    Idempotent on `client_message_id`: replaying the same queued item twice
    (e.g. because the client retried a sync that actually succeeded) never
    creates a duplicate message.
    """
    results: list[SyncResultItem] = []

    for item in payload.messages:
        if item.target == QueuedMessageTarget.GROUP:
            existing = db.query(GroupMessage).filter_by(client_message_id=item.client_message_id).one_or_none()
            if existing is not None:
                results.append(SyncResultItem(client_message_id=item.client_message_id, accepted=True, server_id=existing.id))
                continue
            membership = db.query(GroupMembership).filter_by(group_id=item.target_id, identity_id=current.id).first()
            is_member = membership is not None and membership.status == MembershipStatus.APPROVED
            if not is_member:
                results.append(
                    SyncResultItem(client_message_id=item.client_message_id, accepted=False, reason="Not a group member")
                )
                continue
            message = GroupMessage(
                group_id=item.target_id,
                sender_identity_id=current.id,
                sender_pseudonym=current.pseudonym,
                body=item.body,
                client_message_id=item.client_message_id,
            )
            db.add(message)
            db.commit()
            db.refresh(message)
            results.append(SyncResultItem(client_message_id=item.client_message_id, accepted=True, server_id=message.id))

        else:  # DIRECT
            existing = db.query(DirectMessage).filter_by(client_message_id=item.client_message_id).one_or_none()
            if existing is not None:
                results.append(SyncResultItem(client_message_id=item.client_message_id, accepted=True, server_id=existing.id))
                continue
            conversation = db.get(Conversation, item.target_id)
            if conversation is None or current.id not in (
                conversation.participant_a_id,
                conversation.participant_b_id,
            ):
                results.append(
                    SyncResultItem(client_message_id=item.client_message_id, accepted=False, reason="Conversation not found")
                )
                continue
            message = DirectMessage(
                conversation_id=item.target_id,
                sender_identity_id=current.id,
                body=item.body,
                client_message_id=item.client_message_id,
            )
            db.add(message)
            db.commit()
            db.refresh(message)
            results.append(SyncResultItem(client_message_id=item.client_message_id, accepted=True, server_id=message.id))

    return SyncResponse(results=results, synced_at=datetime.now(timezone.utc).isoformat())
