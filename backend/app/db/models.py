"""The whole data model. Note what is absent: no survivor table, no message table,
no IP column, no phone numbers. See docs/backend/ARCHITECTURE.md section 7."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

ORG_STATUSES = ("pending", "approved", "suspended")
REASON_CODES = ("transport", "pharmacy", "shelter", "food", "other")
DISBURSEMENT_STATES = (
    "CREATED",
    "INVOICE_ATTACHED",
    "PAYING",
    "PAID",
    "EXPIRED",
    "FAILED",
    "CANCELLED",
)


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = (CheckConstraint(_in("status", ORG_STATUSES), name="ck_org_status"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text)
    domain: Mapped[str] = mapped_column(Text, unique=True)
    nostr_pubkey: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(Text, default="pending", server_default="pending")
    nip05_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    per_payment_cap_sat: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    daily_cap_sat: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CounsellorProfile(Base):
    """A counsellor's signed kind 0 profile, kept verbatim. One per key, as on Nostr: a newer
    profile replaces the older one."""

    __tablename__ = "counsellor_profiles"

    counsellor_pubkey: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    raw: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RosterEvent(Base):
    """A signed kind 30000 roster, kept verbatim as the source of truth."""

    __tablename__ = "roster_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    raw: Mapped[dict] = mapped_column(JSONB)


class CounsellorAttestation(Base):
    __tablename__ = "counsellor_attestations"

    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    counsellor_pubkey: Mapped[str] = mapped_column(String(64), primary_key=True)
    roster_event_id: Mapped[str] = mapped_column(ForeignKey("roster_events.event_id"))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class Disbursement(Base):
    __tablename__ = "disbursements"
    __table_args__ = (
        UniqueConstraint("org_id", "idempotency_key", name="uq_disbursement_idempotency"),
        CheckConstraint(_in("state", DISBURSEMENT_STATES), name="ck_disbursement_state"),
        CheckConstraint(_in("reason_code", REASON_CODES), name="ck_disbursement_reason"),
        CheckConstraint("amount_sat > 0", name="ck_disbursement_amount_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    idempotency_key: Mapped[str] = mapped_column(Text)
    request_hash: Mapped[str] = mapped_column(String(64))
    amount_sat: Mapped[int] = mapped_column(Integer)
    amount_kes: Mapped[int] = mapped_column(Integer)
    rate_source: Mapped[str] = mapped_column(Text)
    reason_code: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(Text, default="CREATED", server_default="CREATED")
    payment_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    invoice: Mapped[str | None] = mapped_column(Text)  # deleted once the payment is final
    invoice_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_pubkey: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DisbursementTransition(Base):
    __tablename__ = "disbursement_transitions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    disbursement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("disbursements.id", ondelete="CASCADE")
    )
    from_state: Mapped[str | None] = mapped_column(Text)
    to_state: Mapped[str] = mapped_column(Text)
    actor_pubkey: Mapped[str] = mapped_column(String(64))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SeenAuthEvent(Base):
    """NIP-98 replay protection: an auth event id may be used once."""

    __tablename__ = "seen_auth_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
