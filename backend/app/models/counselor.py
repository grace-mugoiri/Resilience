import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class VerificationStatus(str, enum.Enum):
    """External attestation status.

    Resilience does not itself license or professionally verify counselors.
    This models a status asserted by a trusted external organization
    (e.g. a licensing body or partner NGO) — see VerificationService.
    """

    VERIFIED = "verified"
    PENDING = "pending"
    EXPIRED = "expired"
    REVOKED = "revoked"


def _uuid() -> str:
    return uuid.uuid4().hex


class CounselorProfile(Base):
    __tablename__ = "counselor_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    identity_id: Mapped[str] = mapped_column(ForeignKey("identities.id"), unique=True)
    display_name: Mapped[str] = mapped_column(String)
    bio: Mapped[str] = mapped_column(Text, default="")
    specialties: Mapped[str] = mapped_column(Text, default="")  # comma-separated for prototype
    languages: Mapped[str] = mapped_column(Text, default="")
    attesting_organization: Mapped[str] = mapped_column(String, default="")
    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus), default=VerificationStatus.PENDING
    )
    verification_updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    verification_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_available: Mapped[bool] = mapped_column(default=True)
