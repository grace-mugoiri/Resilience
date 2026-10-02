import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TransactionStatus(str, enum.Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"


class TransactionDirection(str, enum.Enum):
    INCOMING = "incoming"
    OUTGOING = "outgoing"


def _uuid() -> str:
    return uuid.uuid4().hex


class WalletAccount(Base):
    """MOCK wallet. Holds only a public identifier and a mock sat balance —
    never a private key or seed phrase, which stay client-side in a real
    implementation. See PaymentService."""

    __tablename__ = "wallet_accounts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    identity_id: Mapped[str] = mapped_column(ForeignKey("identities.id"), unique=True)
    connected: Mapped[bool] = mapped_column(default=False)
    public_address: Mapped[str] = mapped_column(String, default="")
    balance_sats: Mapped[int] = mapped_column(Integer, default=0)
    connected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    wallet_id: Mapped[str] = mapped_column(ForeignKey("wallet_accounts.id"))
    direction: Mapped[TransactionDirection] = mapped_column(Enum(TransactionDirection))
    amount_sats: Mapped[int] = mapped_column(Integer)
    status: Mapped[TransactionStatus] = mapped_column(Enum(TransactionStatus), default=TransactionStatus.PENDING)
    memo: Mapped[str] = mapped_column(String, default="")
    counterparty_label: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
