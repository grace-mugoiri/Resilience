import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text, default="")
    topic: Mapped[str] = mapped_column(String, default="")
    member_count: Mapped[int] = mapped_column(default=0)
    facilitator_name: Mapped[str] = mapped_column(String, default="")
    requires_approval: Mapped[bool] = mapped_column(default=False)
    rules: Mapped[str] = mapped_column(Text, default="")  # newline-separated for prototype simplicity
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MembershipStatus:
    APPROVED = "approved"
    PENDING = "pending"


class GroupMembership(Base):
    __tablename__ = "group_memberships"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"))
    identity_id: Mapped[str] = mapped_column(ForeignKey("identities.id"))
    status: Mapped[str] = mapped_column(String, default=MembershipStatus.APPROVED)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class GroupMessage(Base):
    __tablename__ = "group_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"))
    sender_identity_id: Mapped[str] = mapped_column(ForeignKey("identities.id"))
    sender_pseudonym: Mapped[str] = mapped_column(String)
    body: Mapped[str] = mapped_column(Text)
    client_message_id: Mapped[str] = mapped_column(String, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
