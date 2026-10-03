"""Disbursement rules. The API records requests, approvals and payment proof; it never pays.

Who does what:

- an active counsellor of the organisation creates a request (approval one) and later attaches
  the survivor's invoice
- a second person holding the organisation's `payments` key approves it (approval two)
- the `payments` key holder pays from the organisation's wallet, marks the payment as under way,
  and submits the preimage the wallet returned
"""

import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import (
    CounsellorAttestation,
    Disbursement,
    DisbursementApproval,
    DisbursementTransition,
    Organization,
    OrganizationOperationalKey,
)
from app.db.session import get_engine
from app.directory.service import ts
from app.payments.contracts import ALLOWED_TRANSITIONS, InvoiceDetails
from app.payments.schemas import DisbursementIn, DisbursementLimits, DisbursementOut
from app.settings import Settings

SYSTEM_ACTOR_PUBKEY = "0" * 64
# Every state except these still holds part of the daily cap. FAILED counts, because a failed
# payment can be retried with a new invoice.
RELEASED_STATES = ("EXPIRED", "CANCELLED")
CREATED_TTL = timedelta(hours=24)
# Limits reset at midnight in Kenya, where the organisations work, not at midnight UTC.
CAP_TIMEZONE = ZoneInfo("Africa/Nairobi")


class DisbursementError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def load_org(db: Session, org_id: uuid.UUID, *, lock: bool = False) -> Organization:
    query = select(Organization).where(Organization.id == org_id)
    org = db.scalars(query.with_for_update() if lock else query).one_or_none()
    if org is None:
        raise DisbursementError(404, "organisation not found")
    return org


def is_active_counsellor(db: Session, org_id: uuid.UUID, pubkey: str) -> bool:
    attestation = db.get(CounsellorAttestation, (org_id, pubkey))
    now = datetime.now(UTC)
    return bool(
        attestation
        and attestation.active
        and (attestation.expires_at is None or attestation.expires_at > now)
    )


def is_payment_key(db: Session, org_id: uuid.UUID, pubkey: str) -> bool:
    key = db.get(OrganizationOperationalKey, (org_id, pubkey))
    now = datetime.now(UTC)
    return bool(
        key
        and "payments" in key.scopes
        and key.valid_from <= now < key.expires_at
        and key.revoked_at is None
    )


def approval_count(db: Session, item: Disbursement) -> int:
    count = db.scalar(
        select(func.count())
        .select_from(DisbursementApproval)
        .where(DisbursementApproval.disbursement_id == item.id)
    )
    return int(count or 0)


def to_out(db: Session, item: Disbursement, settings: Settings) -> DisbursementOut:
    count = approval_count(db, item)
    return DisbursementOut(
        id=item.id,
        org_id=item.org_id,
        amount_sat=item.amount_sat,
        amount_kes=item.amount_kes,
        rate_source=item.rate_source,
        reason_code=item.reason_code,
        note=item.note,
        state=item.state,
        approval_count=count,
        approvals_required=settings.disbursement_approval_threshold,
        ready=count >= settings.disbursement_approval_threshold,
        payment_hash=item.payment_hash,
        invoice=item.invoice,
        invoice_expires_at=item.invoice_expires_at,
        created_by_pubkey=item.created_by_pubkey,
        created_at=item.created_at,
        updated_at=item.updated_at,
        paid_at=item.paid_at,
    )


def request_digest(body: DisbursementIn) -> str:
    encoded = json.dumps(body.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def _transition(
    db: Session, item: Disbursement, actor: str, to_state: str, **changes
) -> Disbursement:
    old = item.state
    if to_state not in ALLOWED_TRANSITIONS.get(old, frozenset()):
        raise DisbursementError(409, f"cannot move disbursement from {old} to {to_state}")
    values = {"state": to_state, "updated_at": func.now(), **changes}
    result = db.execute(
        update(Disbursement)
        .where(Disbursement.id == item.id, Disbursement.state == old)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        raise DisbursementError(409, "disbursement changed; reload and retry")
    db.add(
        DisbursementTransition(
            disbursement_id=item.id, from_state=old, to_state=to_state, actor_pubkey=actor
        )
    )
    db.flush()
    db.refresh(item)
    return item


def create_disbursement(
    db: Session,
    org_id: uuid.UUID,
    actor: str,
    auth_event_id: str,
    body: DisbursementIn,
    idempotency_key: str,
) -> tuple[Disbursement, bool]:
    # Locking the organisation row serialises creates, so two requests can't both fit the cap.
    org = load_org(db, org_id, lock=True)
    if org.status != "approved":
        raise DisbursementError(404, "organisation not found")
    if not is_active_counsellor(db, org.id, actor):
        raise DisbursementError(403, "an active counsellor may create this request")
    digest = request_digest(body)
    existing = db.scalars(
        select(Disbursement).where(
            Disbursement.org_id == org.id, Disbursement.idempotency_key == idempotency_key
        )
    ).one_or_none()
    if existing is not None:
        if existing.request_hash != digest:
            raise DisbursementError(409, "idempotency key was already used for another request")
        return existing, False

    # Unset limits block spending. A new organisation can't pay anything until an admin sets them.
    if org.per_payment_cap_sat <= 0 or org.daily_cap_sat <= 0:
        raise DisbursementError(409, "disbursement limits are not configured for this organisation")
    if body.amount_sat > org.per_payment_cap_sat:
        raise DisbursementError(422, "amount exceeds the organization per-payment cap")
    day_start = (
        datetime.now(CAP_TIMEZONE)
        .replace(hour=0, minute=0, second=0, microsecond=0)
        .astimezone(UTC)
    )
    reserved = db.scalar(
        select(func.coalesce(func.sum(Disbursement.amount_sat), 0)).where(
            Disbursement.org_id == org.id,
            Disbursement.created_at >= day_start,
            Disbursement.state.not_in(RELEASED_STATES),
        )
    )
    if int(reserved or 0) + body.amount_sat > org.daily_cap_sat:
        raise DisbursementError(422, "amount exceeds the organization daily cap")

    item = Disbursement(
        org_id=org.id,
        idempotency_key=idempotency_key,
        request_hash=digest,
        amount_sat=body.amount_sat,
        amount_kes=body.amount_kes,
        rate_source=body.rate_source,
        reason_code=body.reason_code,
        note=body.note.strip() if body.note and body.note.strip() else None,
        created_by_pubkey=actor,
    )
    db.add(item)
    db.flush()
    db.add_all(
        [
            DisbursementApproval(
                disbursement_id=item.id, actor_pubkey=actor, auth_event_id=auth_event_id
            ),
            DisbursementTransition(
                disbursement_id=item.id, from_state=None, to_state="CREATED", actor_pubkey=actor
            ),
        ]
    )
    db.flush()
    db.refresh(item)
    return item, True


def get_disbursement(
    db: Session, disbursement_id: uuid.UUID, *, lock: bool = False
) -> Disbursement:
    query = select(Disbursement).where(Disbursement.id == disbursement_id)
    item = db.scalars(query.with_for_update() if lock else query).one_or_none()
    if item is None:
        raise DisbursementError(404, "disbursement not found")
    return item


def approve_disbursement(
    db: Session, item: Disbursement, actor: str, auth_event_id: str
) -> Disbursement:
    if item.state != "CREATED":
        raise DisbursementError(409, "only a created disbursement can be approved")
    if actor == item.created_by_pubkey:
        raise DisbursementError(403, "approval must come from a second person")
    if not is_payment_key(db, item.org_id, actor):
        raise DisbursementError(403, "an active organization payments key must approve")
    if db.get(DisbursementApproval, (item.id, actor)) is not None:
        return item  # approving twice is harmless
    db.add(
        DisbursementApproval(
            disbursement_id=item.id, actor_pubkey=actor, auth_event_id=auth_event_id
        )
    )
    try:
        db.flush()
    except IntegrityError as exc:
        raise DisbursementError(409, "approval conflict") from exc
    return item


def can_read(db: Session, item: Disbursement, actor: str) -> bool:
    return actor == item.created_by_pubkey or is_payment_key(db, item.org_id, actor)


def require_approved_org(db: Session, item: Disbursement, action: str) -> None:
    if load_org(db, item.org_id).status != "approved":
        raise DisbursementError(409, f"organisation must be approved to {action}")


def attach_invoice(
    db: Session,
    item: Disbursement,
    actor: str,
    invoice: str,
    details: InvoiceDetails,
    settings: Settings,
) -> Disbursement:
    # The counsellor who knows the survivor brings her invoice; nobody else can redirect the money.
    if actor != item.created_by_pubkey or not is_active_counsellor(db, item.org_id, actor):
        raise DisbursementError(
            403, "only the counsellor who made the request can attach an invoice"
        )
    require_approved_org(db, item, "attach a payment invoice")
    if item.state in {"INVOICE_ATTACHED", "PAYING"} and item.invoice == invoice:
        return item
    if approval_count(db, item) < settings.disbursement_approval_threshold:
        raise DisbursementError(409, "the request needs a second approval before an invoice")
    if details.amount_msat != item.amount_sat * 1000:
        raise DisbursementError(409, "invoice amount must exactly match amount_sat")
    if item.payment_hash == details.payment_hash and item.state == "FAILED":
        raise DisbursementError(409, "retry requires a new invoice")
    conflict = db.scalars(
        select(Disbursement.id).where(
            Disbursement.payment_hash == details.payment_hash, Disbursement.id != item.id
        )
    ).first()
    if conflict is not None:
        raise DisbursementError(409, "invoice payment hash has already been used")
    try:
        return _transition(
            db,
            item,
            actor,
            "INVOICE_ATTACHED",
            invoice=invoice,
            payment_hash=details.payment_hash,
            invoice_expires_at=ts(details.expires_at),
            paid_at=None,
        )
    except IntegrityError as exc:
        raise DisbursementError(409, "invoice payment hash has already been used") from exc


def require_payment_key(db: Session, item: Disbursement, actor: str) -> None:
    if not is_payment_key(db, item.org_id, actor):
        raise DisbursementError(403, "an active organization payments key must do this")


def mark_paying(db: Session, item: Disbursement, actor: str) -> Disbursement:
    require_payment_key(db, item, actor)
    require_approved_org(db, item, "start a payment")
    if item.state == "PAYING":
        return item
    if item.state != "INVOICE_ATTACHED":
        raise DisbursementError(409, "only an attached invoice can enter PAYING")
    if item.invoice_expires_at is None or item.invoice_expires_at <= datetime.now(UTC):
        raise DisbursementError(409, "invoice has expired")
    return _transition(db, item, actor, "PAYING")


def submit_preimage(db: Session, item: Disbursement, actor: str, preimage: str) -> Disbursement:
    # No organisation-status check: a payment already under way must still be recordable after a
    # suspension, so the suspension can't hide its outcome.
    require_payment_key(db, item, actor)
    if item.payment_hash != hashlib.sha256(bytes.fromhex(preimage)).hexdigest():
        raise DisbursementError(409, "preimage does not match this invoice payment hash")
    if item.state == "PAID":
        return item
    if item.state != "PAYING":
        raise DisbursementError(409, "payment must be marked PAYING before submitting proof")
    return _transition(db, item, actor, "PAID", invoice=None, paid_at=datetime.now(UTC))


def cancel_disbursement(db: Session, item: Disbursement, actor: str) -> Disbursement:
    creator = actor == item.created_by_pubkey and is_active_counsellor(db, item.org_id, actor)
    if not creator and not is_payment_key(db, item.org_id, actor):
        raise DisbursementError(403, "only the requesting counsellor or a payments key can cancel")
    if item.state == "CANCELLED":
        return item
    if item.state not in {"CREATED", "INVOICE_ATTACHED", "FAILED"}:
        raise DisbursementError(409, f"cannot cancel a disbursement in {item.state}")
    return _transition(db, item, actor, "CANCELLED", invoice=None)


def list_disbursements(
    db: Session, org_id: uuid.UUID, actor: str, state: str | None = None
) -> list[Disbursement]:
    """A payments key sees the organisation's requests; a counsellor sees only her own."""
    query = select(Disbursement).where(Disbursement.org_id == org_id)
    if not is_payment_key(db, org_id, actor):
        if not is_active_counsellor(db, org_id, actor):
            raise DisbursementError(403, "not authorized for this organisation's disbursements")
        query = query.where(Disbursement.created_by_pubkey == actor)
    if state is not None:
        query = query.where(Disbursement.state == state)
    return list(db.scalars(query.order_by(Disbursement.created_at.desc()).limit(100)).all())


def set_limits(db: Session, org_id: uuid.UUID, limits: DisbursementLimits) -> Organization:
    org = load_org(db, org_id, lock=True)
    org.per_payment_cap_sat = limits.per_payment_cap_sat
    org.daily_cap_sat = limits.daily_cap_sat
    db.flush()
    return org


def expire_disbursements(now: datetime | None = None) -> dict[str, int]:
    """Expire requests left unpaid for 24 hours and invoices that ran out. PAYING is left alone:
    without asking the wallet, nobody knows whether that payment went through."""
    current = now or datetime.now(UTC)
    counts = {"expired": 0}
    with Session(get_engine()) as db:
        due = db.scalars(
            select(Disbursement)
            .where(
                or_(
                    and_(
                        Disbursement.state == "CREATED",
                        Disbursement.created_at < current - CREATED_TTL,
                    ),
                    and_(
                        Disbursement.state == "INVOICE_ATTACHED",
                        Disbursement.invoice_expires_at <= current,
                    ),
                )
            )
            .with_for_update(skip_locked=True)
        ).all()
        for item in due:
            _transition(db, item, SYSTEM_ACTOR_PUBKEY, "EXPIRED", invoice=None)
            counts["expired"] += 1
        db.commit()
    return counts
