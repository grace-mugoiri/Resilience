import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


class HealthRecord(Base):
    """DEMONSTRATION ONLY. Represents a record the survivor controls locally.

    The prototype stores fictional/demo field values server-side purely to
    drive the UI; it does not implement real encryption-at-rest and must
    never hold genuine medical data. See ARCHITECTURE.md for the intended
    client-side-encrypted design this stands in for.
    """

    __tablename__ = "health_records"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_identity_id: Mapped[str] = mapped_column(ForeignKey("identities.id"))
    record_type: Mapped[str] = mapped_column(String)  # e.g. "injury_note", "medication", "appointment"
    title: Mapped[str] = mapped_column(String)
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class HealthShare(Base):
    """A consent grant sharing one record with one counselor. Revocable."""

    __tablename__ = "health_shares"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    record_id: Mapped[str] = mapped_column(ForeignKey("health_records.id"))
    shared_with_identity_id: Mapped[str] = mapped_column(ForeignKey("identities.id"))
    granted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
