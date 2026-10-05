"""Non-custodial emergency disbursements: two-person approval, then invoice, payment and proof."""

import re
import uuid
from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.nip98 import NostrPubkey
from app.auth.scoped import require_scoped_authorization
from app.db.session import get_db
from app.nwc.client import (
    NwcClient,
    NwcError,
    NwcRemoteError,
    NwcTransportError,
    get_nwc_client,
)
from app.nwc.service import credentials as wallet_credentials
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
    mark_failed,
    mark_paying,
    require_payment_key,
    submit_preimage,
    to_out,
)
from app.payments.service import attach_invoice as service_attach_invoice
from app.settings import Settings, get_settings

router = APIRouter(tags=["disbursements"])
Db = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
NwcClientDep = Annotated[NwcClient, Depends(get_nwc_client)]
CreateActor = Annotated[str, Depends(require_scoped_authorization("disbursement:create:{org_id}"))]
ApproveActor = Annotated[
    str, Depends(require_scoped_authorization("disbursement:approve:{disbursement_id}"))
]
PayActor = Annotated[
    str, Depends(require_scoped_authorization("disbursement:pay:{disbursement_id}"))
]
ReconcileActor = Annotated[
    str, Depends(require_scoped_authorization("disbursement:reconcile:{disbursement_id}"))
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


@router.post("/v1/disbursements/{disbursement_id}/pay-with-wallet", response_model=DisbursementOut)
async def pay_with_connected_wallet(
    disbursement_id: uuid.UUID,
    actor: PayActor,
    db: Db,
    settings: SettingsDep,
    client: NwcClientDep,
) -> DisbursementOut:
    """Pay once through NWC. A timeout stays PAYING because retrying could pay twice."""
    try:
        item = get_disbursement(db, disbursement_id, lock=True)
        if item.state == "PAYING":
            raise DisbursementError(
                409,
                "payment is already in progress or has an unknown outcome; use reconciliation",
            )
        item = mark_paying(db, item, actor)
        if not item.invoice:
            raise DisbursementError(409, "disbursement has no payable invoice")
        invoice = item.invoice
        _connection, wallet = wallet_credentials(db, settings, item.org_id)
        db.commit()
    except (DisbursementError, LookupError, IntegrityError) as exc:
        if isinstance(exc, LookupError):
            db.rollback()
            raise HTTPException(409, str(exc)) from exc
        fail(db, exc)

    try:
        result = await client.request(wallet, "pay_invoice", {"invoice": invoice})
        preimage = str(result["preimage"]).lower()
        if re.fullmatch(r"[0-9a-f]{64}", preimage) is None:
            raise NwcTransportError("wallet returned an invalid payment preimage")
    except NwcRemoteError as exc:
        try:
            item = mark_failed(db, get_disbursement(db, disbursement_id, lock=True), actor)
            db.commit()
        except (DisbursementError, IntegrityError) as transition_exc:
            fail(db, transition_exc)
        raise HTTPException(502, str(exc)) from exc
    except (NwcTransportError, NwcError, KeyError) as exc:
        db.rollback()
        raise HTTPException(
            504,
            "wallet outcome is unknown; do not retry payment, use reconciliation",
        ) from exc

    try:
        item = submit_preimage(
            db,
            get_disbursement(db, disbursement_id, lock=True),
            actor,
            preimage,
        )
        db.commit()
        return to_out(db, item, settings)
    except (DisbursementError, IntegrityError) as exc:
        fail(db, exc)


@router.post("/v1/disbursements/{disbursement_id}/reconcile-wallet", response_model=DisbursementOut)
async def reconcile_connected_wallet(
    disbursement_id: uuid.UUID,
    actor: ReconcileActor,
    db: Db,
    settings: SettingsDep,
    client: NwcClientDep,
) -> DisbursementOut:
    try:
        item = get_disbursement(db, disbursement_id)
        require_payment_key(db, item, actor)
        if item.state != "PAYING":
            return to_out(db, item, settings)
        _connection, wallet = wallet_credentials(db, settings, item.org_id)
        invoice = item.invoice
        if not invoice:
            raise DisbursementError(409, "payment has no invoice to reconcile")
    except (DisbursementError, LookupError) as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(409, str(exc)) from exc
        fail(db, exc)

    try:
        result = await client.request(wallet, "lookup_invoice", {"invoice": invoice})
    except NwcError as exc:
        raise HTTPException(502, str(exc)) from exc
    state = result.get("state")
    try:
        item = get_disbursement(db, disbursement_id, lock=True)
        if state == "settled" and result.get("preimage"):
            preimage = str(result["preimage"]).lower()
            if re.fullmatch(r"[0-9a-f]{64}", preimage) is None:
                raise DisbursementError(502, "wallet returned an invalid payment preimage")
            item = submit_preimage(db, item, actor, preimage)
        elif state == "failed":
            item = mark_failed(db, item, actor)
        db.commit()
        return to_out(db, item, settings)
    except (DisbursementError, IntegrityError) as exc:
        fail(db, exc)
