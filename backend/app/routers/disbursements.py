"""Non-custodial emergency disbursements: two-person approval, then invoice, payment and proof."""

import uuid
from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.nip98 import NostrPubkey
from app.auth.scoped import require_scoped_authorization
from app.db.session import get_db
from app.payments.contracts import InvoiceDecodeError
from app.payments.invoice import parse_invoice
from app.payments.schemas import (
    DisbursementIn,
    DisbursementOut,
    InvoiceAttach,
    PaymentProof,
    State,
)
from app.payments.service import (
    DisbursementError,
    approve_disbursement,
    can_read,
    cancel_disbursement,
    create_disbursement,
    get_disbursement,
    list_disbursements,
    mark_paying,
    submit_preimage,
    to_out,
)
from app.payments.service import attach_invoice as service_attach_invoice
from app.settings import Settings, get_settings

router = APIRouter(tags=["disbursements"])
Db = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
CreateActor = Annotated[str, Depends(require_scoped_authorization("disbursement:create:{org_id}"))]
ApproveActor = Annotated[
    str, Depends(require_scoped_authorization("disbursement:approve:{disbursement_id}"))
]
IdempotencyKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=8, max_length=120, pattern=r"^[A-Za-z0-9._~-]+$"),
]


def fail(db: Session, exc: Exception) -> NoReturn:
    db.rollback()
    if isinstance(exc, DisbursementError):
        raise HTTPException(exc.status_code, exc.detail) from exc
    if isinstance(exc, InvoiceDecodeError):
        raise HTTPException(409, str(exc)) from exc
    if isinstance(exc, IntegrityError):
        raise HTTPException(409, "request conflicts with an existing disbursement; retry") from exc
    raise exc


@router.post(
    "/v1/orgs/{org_id}/disbursements",
    status_code=status.HTTP_201_CREATED,
    response_model=DisbursementOut,
)
def create(
    org_id: uuid.UUID,
    body: DisbursementIn,
    request: Request,
    response: Response,
    actor: CreateActor,
    idempotency_key: IdempotencyKey,
    db: Db,
    settings: SettingsDep,
) -> DisbursementOut:
    try:
        item, created = create_disbursement(
            db, org_id, actor, request.state.nostr_event["id"], body, idempotency_key
        )
        db.commit()
    except (DisbursementError, IntegrityError) as exc:
        fail(db, exc)
    if not created:
        response.status_code = status.HTTP_200_OK
    return to_out(db, item, settings)


@router.get("/v1/orgs/{org_id}/disbursements", response_model=list[DisbursementOut])
def list_items(
    org_id: uuid.UUID,
    actor: NostrPubkey,
    db: Db,
    settings: SettingsDep,
    state: State | None = None,
) -> list[DisbursementOut]:
    try:
        return [to_out(db, row, settings) for row in list_disbursements(db, org_id, actor, state)]
    except DisbursementError as exc:
        fail(db, exc)


@router.post("/v1/disbursements/{disbursement_id}/approve", response_model=DisbursementOut)
def approve(
    disbursement_id: uuid.UUID,
    request: Request,
    actor: ApproveActor,
    db: Db,
    settings: SettingsDep,
) -> DisbursementOut:
    try:
        item = get_disbursement(db, disbursement_id, lock=True)
        approve_disbursement(db, item, actor, request.state.nostr_event["id"])
        db.commit()
    except (DisbursementError, IntegrityError) as exc:
        fail(db, exc)
    return to_out(db, item, settings)


@router.get("/v1/disbursements/{disbursement_id}", response_model=DisbursementOut)
def read(
    disbursement_id: uuid.UUID, actor: NostrPubkey, db: Db, settings: SettingsDep
) -> DisbursementOut:
    try:
        item = get_disbursement(db, disbursement_id)
    except DisbursementError as exc:
        fail(db, exc)
    if not can_read(db, item, actor):
        raise HTTPException(403, "not authorized for this disbursement")
    return to_out(db, item, settings)


@router.post("/v1/disbursements/{disbursement_id}/invoice", response_model=DisbursementOut)
def add_invoice(
    disbursement_id: uuid.UUID,
    body: InvoiceAttach,
    actor: NostrPubkey,
    db: Db,
    settings: SettingsDep,
) -> DisbursementOut:
    try:
        item = get_disbursement(db, disbursement_id, lock=True)
        details = parse_invoice(body.invoice, settings.lightning_network)
        item = service_attach_invoice(db, item, actor, body.invoice, details, settings)
        db.commit()
    except (DisbursementError, InvoiceDecodeError, IntegrityError) as exc:
        fail(db, exc)
    return to_out(db, item, settings)


@router.post("/v1/disbursements/{disbursement_id}/paying", response_model=DisbursementOut)
def begin_payment(
    disbursement_id: uuid.UUID, actor: NostrPubkey, db: Db, settings: SettingsDep
) -> DisbursementOut:
    try:
        item = mark_paying(db, get_disbursement(db, disbursement_id, lock=True), actor)
        db.commit()
    except (DisbursementError, IntegrityError) as exc:
        fail(db, exc)
    return to_out(db, item, settings)


@router.post("/v1/disbursements/{disbursement_id}/proof", response_model=DisbursementOut)
def payment_proof(
    disbursement_id: uuid.UUID,
    body: PaymentProof,
    actor: NostrPubkey,
    db: Db,
    settings: SettingsDep,
) -> DisbursementOut:
    try:
        item = get_disbursement(db, disbursement_id, lock=True)
        item = submit_preimage(db, item, actor, body.preimage)
        db.commit()
    except (DisbursementError, IntegrityError) as exc:
        fail(db, exc)
    return to_out(db, item, settings)


@router.post("/v1/disbursements/{disbursement_id}/cancel", response_model=DisbursementOut)
def cancel(
    disbursement_id: uuid.UUID, actor: NostrPubkey, db: Db, settings: SettingsDep
) -> DisbursementOut:
    try:
        item = cancel_disbursement(db, get_disbursement(db, disbursement_id, lock=True), actor)
        db.commit()
    except (DisbursementError, IntegrityError) as exc:
        fail(db, exc)
    return to_out(db, item, settings)
