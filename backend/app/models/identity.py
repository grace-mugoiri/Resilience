import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IdentityRole(str, enum.Enum):
    SURVIVOR = "survivor"
    COUNSELOR = "counselor"


def _uuid() -> str:
    return uuid.uuid4().hex


class Identity(Base):
    """A pseudonymous account. No real name, email, or phone number is stored.

    Recovery is via a locally-held recovery phrase (mocked) rather than any
    personally identifying contact method — see NostrService for how the
    underlying keypair would map to a real Nostr identity.
    """

    __tablename__ = "identities"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    pseudonym: Mapped[str] = mapped_column(String, unique=True, index=True)
    role: Mapped[IdentityRole] = mapped_column(Enum(IdentityRole))
    npub: Mapped[str] = mapped_column(String, unique=True)
    avatar_seed: Mapped[str] = mapped_column(String)
    pin_hash: Mapped[str] = mapped_column(String)
    recovery_phrase_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
