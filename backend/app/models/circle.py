import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


class CircleMember(Base):
    """A trusted contact the survivor has explicitly added to their Circle."""

    __tablename__ = "circle_members"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_identity_id: Mapped[str] = mapped_column(ForeignKey("identities.id"))
    member_identity_id: Mapped[str] = mapped_column(ForeignKey("identities.id"))
    label: Mapped[str] = mapped_column(String, default="")
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
