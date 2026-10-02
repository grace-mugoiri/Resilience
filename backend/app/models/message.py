import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


class Conversation(Base):
    """A private 1:1 thread between two identities (survivor<->counselor or
    survivor<->circle member). Mocked as a direct row per pair; a real
    implementation would derive this from Nostr NIP-04/NIP-17 DM events."""

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    participant_a_id: Mapped[str] = mapped_column(ForeignKey("identities.id"))
    participant_b_id: Mapped[str] = mapped_column(ForeignKey("identities.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"))
    sender_identity_id: Mapped[str] = mapped_column(ForeignKey("identities.id"))
    body: Mapped[str] = mapped_column(Text)
    client_message_id: Mapped[str] = mapped_column(String, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
