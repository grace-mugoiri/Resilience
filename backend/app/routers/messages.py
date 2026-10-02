from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.identity import Identity
from app.models.message import Conversation, DirectMessage
from app.schemas.message import (
    ConversationResponse,
    DirectMessageCreateRequest,
    DirectMessageResponse,
    StartConversationRequest,
)
from app.security import get_current_identity

router = APIRouter(prefix="/api/messages", tags=["messages"])


def _counterpart_id(conversation: Conversation, identity_id: str) -> str:
    return conversation.participant_b_id if conversation.participant_a_id == identity_id else conversation.participant_a_id


@router.get("", response_model=list[ConversationResponse])
def list_conversations(current: Identity = Depends(get_current_identity), db: Session = Depends(get_db)):
    conversations = (
        db.query(Conversation)
        .filter(or_(Conversation.participant_a_id == current.id, Conversation.participant_b_id == current.id))
        .all()
    )
    results = []
    for c in conversations:
        counterpart_id = _counterpart_id(c, current.id)
        counterpart = db.get(Identity, counterpart_id)
        last_message = (
            db.query(DirectMessage)
            .filter_by(conversation_id=c.id)
            .order_by(DirectMessage.created_at.desc())
            .first()
        )
        results.append(
            ConversationResponse(
                id=c.id,
                counterpart_identity_id=counterpart_id,
                counterpart_pseudonym=counterpart.pseudonym if counterpart else "Unknown",
                last_message_preview=(last_message.body[:80] if last_message else ""),
                last_message_at=last_message.created_at if last_message else None,
            )
        )
    return results


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
def start_conversation(
    payload: StartConversationRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    if payload.counterpart_identity_id == current.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot start a conversation with yourself")
    counterpart = db.get(Identity, payload.counterpart_identity_id)
    if counterpart is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipient not found")

    existing = (
        db.query(Conversation)
        .filter(
            or_(
                (Conversation.participant_a_id == current.id) & (Conversation.participant_b_id == counterpart.id),
                (Conversation.participant_a_id == counterpart.id) & (Conversation.participant_b_id == current.id),
            )
        )
        .one_or_none()
    )
    if existing is None:
        existing = Conversation(participant_a_id=current.id, participant_b_id=counterpart.id)
        db.add(existing)
        db.commit()
        db.refresh(existing)

    return ConversationResponse(
        id=existing.id,
        counterpart_identity_id=counterpart.id,
        counterpart_pseudonym=counterpart.pseudonym,
        last_message_preview="",
        last_message_at=None,
    )


def _get_owned_conversation(db: Session, conversation_id: str, identity_id: str) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    if identity_id not in (conversation.participant_a_id, conversation.participant_b_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a participant in this conversation")
    return conversation


@router.get("/{conversation_id}", response_model=list[DirectMessageResponse])
def list_messages(
    conversation_id: str, current: Identity = Depends(get_current_identity), db: Session = Depends(get_db)
):
    _get_owned_conversation(db, conversation_id, current.id)
    return (
        db.query(DirectMessage)
        .filter_by(conversation_id=conversation_id)
        .order_by(DirectMessage.created_at.asc())
        .all()
    )


@router.post("/{conversation_id}", response_model=DirectMessageResponse, status_code=status.HTTP_201_CREATED)
def post_message(
    conversation_id: str,
    payload: DirectMessageCreateRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    _get_owned_conversation(db, conversation_id, current.id)

    existing = db.query(DirectMessage).filter_by(client_message_id=payload.client_message_id).one_or_none()
    if existing is not None:
        return existing

    message = DirectMessage(
        conversation_id=conversation_id,
        sender_identity_id=current.id,
        body=payload.body,
        client_message_id=payload.client_message_id,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message
