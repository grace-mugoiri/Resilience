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
DIRECTORY_VISIBILITIES = ("public",)
COUNSELLOR_ENROLLMENT_STATUSES = (
    "draft",
    "under_review",
    "more_information",
    "approved",
    "rejected",
)
REASON_CODES = ("transport", "pharmacy", "shelter", "food", "other")
GROUP_MEMBER_ROLES = ("member", "moderator")
GROUP_ACCESS_MODES = ("open", "request")
GROUP_JOIN_STATUSES = ("pending", "approved", "rejected")
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
    __table_args__ = (
        CheckConstraint(_in("status", ORG_STATUSES), name="ck_org_status"),
        CheckConstraint(
            _in("directory_visibility", DIRECTORY_VISIBILITIES),
            name="ck_org_directory_visibility",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text)
    domain: Mapped[str] = mapped_column(Text, unique=True)
    nostr_pubkey: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(Text, default="pending", server_default="pending")
    directory_visibility: Mapped[str] = mapped_column(
        Text, default="public", server_default="public"
    )
    focus_areas: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    nip05_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    per_payment_cap_sat: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    daily_cap_sat: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrganizationOperationalKey(Base):
    """A root-authorized online key. The root secret remains offline after authorizing it."""

    __tablename__ = "organization_operational_keys"

    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    pubkey: Mapped[str] = mapped_column(String(64), primary_key=True)
    authorization_event_id: Mapped[str] = mapped_column(String(64), unique=True)
    authorization_event: Mapped[dict] = mapped_column(JSONB)
    scopes: Mapped[list] = mapped_column(JSONB)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revocation_event: Mapped[dict | None] = mapped_column(JSONB)
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


class CounsellorInvite(Base):
    """A high-entropy, one-use invitation. Only its keyed hash is persisted."""

    __tablename__ = "counsellor_invites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    credential_recipient_pubkey: Mapped[str] = mapped_column(String(64))
    created_by_pubkey: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_by_pubkey: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CounsellorEnrollment(Base):
    """Counsellor-controlled application plus opaque, client-encrypted credentials."""

    __tablename__ = "counsellor_enrollments"
    __table_args__ = (
        UniqueConstraint("org_id", "counsellor_pubkey", name="uq_counsellor_enrollment_org_key"),
        CheckConstraint(
            _in("status", COUNSELLOR_ENROLLMENT_STATUSES),
            name="ck_counsellor_enrollment_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    invite_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("counsellor_invites.id", ondelete="RESTRICT"), unique=True
    )
    counsellor_pubkey: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(Text, default="draft", server_default="draft")
    profile_event_id: Mapped[str] = mapped_column(String(64))
    profile_event: Mapped[dict] = mapped_column(JSONB)
    encrypted_credentials: Mapped[list | None] = mapped_column(JSONB)
    review_message: Mapped[str | None] = mapped_column(Text)
    reviewed_by_pubkey: Mapped[str | None] = mapped_column(String(64))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RosterEvent(Base):
    """A signed kind 30000 roster, kept verbatim as the source of truth."""

    __tablename__ = "roster_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    signer_pubkey: Mapped[str | None] = mapped_column(String(64))
    key_authorization_event_id: Mapped[str | None] = mapped_column(String(64))
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


class DisbursementApproval(Base):
    """One signed approval per distinct actor. The creator's signed request is approval one."""

    __tablename__ = "disbursement_approvals"

    disbursement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("disbursements.id", ondelete="CASCADE"), primary_key=True
    )
    actor_pubkey: Mapped[str] = mapped_column(String(64), primary_key=True)
    auth_event_id: Mapped[str] = mapped_column(String(64), unique=True)
    approved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SupportGroup(Base):
    """A private-message room with public discovery copy and private membership."""

    __tablename__ = "support_groups"
    __table_args__ = (CheckConstraint(_in("access", GROUP_ACCESS_MODES), name="ck_group_access"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    slug: Mapped[str | None] = mapped_column(String(80), unique=True)
    title: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    access: Mapped[str] = mapped_column(Text, default="request", server_default="request")
    leader_name: Mapped[str | None] = mapped_column(String(80))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SupportGroupMembership(Base):
    """HMAC-blinded identities for policy plus server-encrypted keys for member-only delivery."""

    __tablename__ = "support_group_memberships"
    __table_args__ = (
        CheckConstraint(_in("role", GROUP_MEMBER_ROLES), name="ck_group_member_role"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("support_groups.id", ondelete="CASCADE"), primary_key=True
    )
    member_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    member_box: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text, default="member", server_default="member")
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SupportGroupJoinRequest(Base):
    __tablename__ = "support_group_join_requests"
    __table_args__ = (
        CheckConstraint(_in("status", GROUP_JOIN_STATUSES), name="ck_group_join_status"),
        UniqueConstraint("group_id", "member_hash", name="uq_group_join_member"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("support_groups.id", ondelete="CASCADE"), index=True
    )
    member_hash: Mapped[str] = mapped_column(String(64))
    member_box: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="pending", server_default="pending")
    reviewed_by_pubkey: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PrivateCircle(Base):
    """A circle is visible only through keyed hashes used by relay admission."""

    __tablename__ = "private_circles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_hash: Mapped[str] = mapped_column(String(64), unique=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PrivateCircleMember(Base):
    __tablename__ = "private_circle_members"

    circle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("private_circles.id", ondelete="CASCADE"), primary_key=True
    )
    member_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CircleInvite(Base):
    """One-use circle code. The inviter key is erased as soon as the code is claimed."""

    __tablename__ = "circle_invites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    circle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("private_circles.id", ondelete="CASCADE"), index=True
    )
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    inviter_pubkey: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BlockedPeer(Base):
    """Directionless relay deny rule stored only as HMAC-blinded public keys."""

    __tablename__ = "blocked_peers"

    blocker_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    blocked_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SafetyReport(Base):
    __tablename__ = "safety_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_hash: Mapped[str] = mapped_column(String(64), index=True)
    subject_pubkey: Mapped[str] = mapped_column(String(64), index=True)
    reason: Mapped[str] = mapped_column(String(80))
    evidence: Mapped[list | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(Text, default="open", server_default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CounsellorAvailability(Base):
    __tablename__ = "counsellor_availability"

    counsellor_pubkey: Mapped[str] = mapped_column(String(64), primary_key=True)
    available: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    working_hours: Mapped[str | None] = mapped_column(String(120))
    auth_event: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SeenAuthEvent(Base):
    """NIP-98 replay protection: an auth event id may be used once."""

    __tablename__ = "seen_auth_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class AuthorizationChallenge(Base):
    """A short-lived, one-use nonce hash bound to one caller and sensitive-operation scope."""

    __tablename__ = "authorization_challenges"

    nonce_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    pubkey: Mapped[str] = mapped_column(String(64), index=True)
    scope: Mapped[str] = mapped_column(String(160))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
