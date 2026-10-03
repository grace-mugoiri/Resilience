"""Privacy-minimizing disbursement records with challenge-bound multi-party approval."""

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.nip98 import NostrPubkey
from app.auth.scoped import require_scoped_authorization
from app.db.models import (
    CounsellorAttestation,
    Disbursement,
    DisbursementApproval,
    DisbursementTransition,
    Organization,
    OrganizationOperationalKey,
)
from app.db.session import get_db
from app.settings import Settings, get_settings

router = APIRouter(tags=["disbursements"])
Db = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
CreateActor = Annotated[str, Depends(require_scoped_authorization("disbursement:create:{org_id}"))]
ApproveActor = Annotated[
    str, Depends(require_scoped_authorization("disbursement:approve:{disbursement_id}"))
]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=120)]


class DisbursementIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount_sat: int = Field(gt=0)
    amount_kes: int = Field(gt=0)
    rate_source: str = Field(min_length=1, max_length=120)
    reason_code: Literal["transport", "pharmacy", "shelter", "food", "other"]
    note: str | None = Field(default=None, max_length=500)


class DisbursementOut(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    amount_sat: int
    amount_kes: int
    rate_source: str
    reason_code: str
    note: str | None
    created_by_pubkey: str
    state: str
    approval_count: int
    approvals_required: int
    ready: bool
    created_at: datetime


def _active_counsellor(db: Session, org_id: uuid.UUID, pubkey: str) -> bool:
    attestation = db.get(CounsellorAttestation, (org_id, pubkey))
    now = datetime.now(UTC)
    return bool(
        attestation
        and attestation.active
        and (attestation.expires_at is None or attestation.expires_at > now)
    )


def _payment_key(db: Session, org_id: uuid.UUID, pubkey: str) -> bool:
    key = db.get(OrganizationOperationalKey, (org_id, pubkey))
    now = datetime.now(UTC)
    return bool(
        key
        and "payments" in key.scopes
        and key.valid_from <= now < key.expires_at
        and key.revoked_at is None
    )


def _out(db: Session, row: Disbursement, settings: Settings) -> DisbursementOut:
    count = db.scalar(
        select(func.count())
        .select_from(DisbursementApproval)
        .where(DisbursementApproval.disbursement_id == row.id)
    )
    approval_count = int(count or 0)
    return DisbursementOut(
        id=row.id,
        org_id=row.org_id,
        amount_sat=row.amount_sat,
        amount_kes=row.amount_kes,
        rate_source=row.rate_source,
        reason_code=row.reason_code,
        note=row.note,
        created_by_pubkey=row.created_by_pubkey,
        state=row.state,
        approval_count=approval_count,
        approvals_required=settings.disbursement_approval_threshold,
        ready=approval_count >= settings.disbursement_approval_threshold,
        created_at=row.created_at,
    )


@router.post(
    "/v1/orgs/{org_id}/disbursements",
    status_code=status.HTTP_201_CREATED,
    response_model=DisbursementOut,
)
def create_disbursement(
    org_id: uuid.UUID,
    body: DisbursementIn,
    request: Request,
    actor: CreateActor,
    idempotency_key: IdempotencyKey,
    db: Db,
    settings: SettingsDep,
) -> DisbursementOut:
    org = db.get(Organization, org_id)
    if org is None or org.status != "approved":
        raise HTTPException(404, "organisation not found")
    if not _active_counsellor(db, org_id, actor):
        raise HTTPException(403, "an active counsellor may create this request")
    canonical = json.dumps(body.model_dump(), sort_keys=True, separators=(",", ":")).encode()
    request_hash = hashlib.sha256(canonical).hexdigest()
    existing = db.scalar(
        select(Disbursement).where(
            Disbursement.org_id == org_id,
            Disbursement.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.request_hash != request_hash:
            raise HTTPException(409, "idempotency key was already used for another request")
        return _out(db, existing, settings)
    if org.per_payment_cap_sat and body.amount_sat > org.per_payment_cap_sat:
        raise HTTPException(422, "amount exceeds the organization per-payment cap")
    if org.daily_cap_sat:
        day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        used = db.scalar(
            select(func.coalesce(func.sum(Disbursement.amount_sat), 0)).where(
                Disbursement.org_id == org_id,
                Disbursement.created_at >= day_start,
                Disbursement.state.not_in(("EXPIRED", "FAILED", "CANCELLED")),
            )
        )
        if int(used or 0) + body.amount_sat > org.daily_cap_sat:
            raise HTTPException(422, "amount exceeds the organization daily cap")
    row = Disbursement(
        org_id=org_id,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        amount_sat=body.amount_sat,
        amount_kes=body.amount_kes,
        rate_source=body.rate_source,
        reason_code=body.reason_code,
        note=body.note.strip() if body.note and body.note.strip() else None,
        created_by_pubkey=actor,
    )
    db.add(row)
    db.flush()
    db.add_all(
        [
            DisbursementApproval(
                disbursement_id=row.id,
                actor_pubkey=actor,
                auth_event_id=request.state.nostr_event["id"],
            ),
            DisbursementTransition(
                disbursement_id=row.id,
                from_state=None,
                to_state="CREATED",
                actor_pubkey=actor,
            ),
        ]
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "disbursement was created concurrently; retry safely") from exc
    return _out(db, row, settings)


@router.get("/v1/orgs/{org_id}/disbursements", response_model=list[DisbursementOut])
def list_disbursements(
    org_id: uuid.UUID,
    actor: NostrPubkey,
    db: Db,
    settings: SettingsDep,
    state: Annotated[
        Literal[
            "CREATED",
            "INVOICE_ATTACHED",
            "PAYING",
            "PAID",
            "EXPIRED",
            "FAILED",
            "CANCELLED",
        ]
        | None,
        Query(),
    ] = None,
) -> list[DisbursementOut]:
    """List support requests without ever storing or returning a survivor identity."""
    query = select(Disbursement).where(Disbursement.org_id == org_id)
    if _payment_key(db, org_id, actor):
        pass
    elif _active_counsellor(db, org_id, actor):
        query = query.where(Disbursement.created_by_pubkey == actor)
    else:
        raise HTTPException(403, "active counsellor or organization payments key required")
    if state is not None:
        query = query.where(Disbursement.state == state)
    rows = db.scalars(query.order_by(Disbursement.created_at.desc())).all()
    return [_out(db, row, settings) for row in rows]


@router.post("/v1/disbursements/{disbursement_id}/approve", response_model=DisbursementOut)
def approve_disbursement(
    disbursement_id: uuid.UUID,
    request: Request,
    actor: ApproveActor,
    db: Db,
    settings: SettingsDep,
) -> DisbursementOut:
    row = db.get(Disbursement, disbursement_id)
    if row is None:
        raise HTTPException(404, "disbursement not found")
    if row.state != "CREATED":
        raise HTTPException(409, "only a created disbursement can be approved")
    if actor == row.created_by_pubkey:
        raise HTTPException(403, "approval must come from a second person")
    if not _payment_key(db, row.org_id, actor):
        raise HTTPException(403, "an active organization payments key must approve")
    approval = DisbursementApproval(
        disbursement_id=row.id,
        actor_pubkey=actor,
        auth_event_id=request.state.nostr_event["id"],
    )
    db.add(approval)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # An already recorded actor approval is idempotent, but another event reusing an auth
        # id is not. NIP-98 and challenge replay checks normally reject it before this point.
        existing = db.get(DisbursementApproval, (row.id, actor))
        if existing is None:
            raise HTTPException(409, "approval conflict") from exc
    return _out(db, row, settings)


@router.get("/v1/disbursements/{disbursement_id}", response_model=DisbursementOut)
def get_disbursement(
    disbursement_id: uuid.UUID,
    actor: NostrPubkey,
    db: Db,
    settings: SettingsDep,
) -> DisbursementOut:
    row = db.get(Disbursement, disbursement_id)
    if row is None:
        raise HTTPException(404, "disbursement not found")
    if actor != row.created_by_pubkey and not _payment_key(db, row.org_id, actor):
        raise HTTPException(403, "not authorized for this disbursement")
    return _out(db, row, settings)
