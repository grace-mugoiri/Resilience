"""Anonymous donations settled directly to an organization's NIP-47 wallet."""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Donation, Organization
from app.db.session import get_db
from app.donations.schemas import DonationCreate, DonationOut
from app.donations.service import expire_if_needed, get_donation, to_out
from app.nwc.client import NwcClient, NwcError, get_nwc_client
from app.nwc.service import credentials
from app.payments.contracts import InvoiceDecodeError
from app.payments.invoice import parse_invoice
from app.settings import Settings, get_settings

router = APIRouter(tags=["donations"])
Db = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
ClientDep = Annotated[NwcClient, Depends(get_nwc_client)]


def _org(db: Session, org_id: uuid.UUID) -> Organization:
    organization = db.get(Organization, org_id)
    if organization is None or organization.status != "approved":
        raise HTTPException(404, "organisation not found")
    return organization


@router.post(
    "/v1/orgs/{org_id}/donations",
    response_model=DonationOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_donation(
    org_id: uuid.UUID,
    body: DonationCreate,
    db: Db,
    settings: SettingsDep,
    client: ClientDep,
) -> DonationOut:
    """Create a short-lived invoice without collecting a donor account, name, or email."""
    organization = _org(db, org_id)
    if not settings.donation_min_sat <= body.amount_sat <= settings.donation_max_sat:
        raise HTTPException(
            422,
            f"amount must be between {settings.donation_min_sat} and "
            f"{settings.donation_max_sat} sats",
        )
    try:
        _connection, wallet = credentials(db, settings, org_id)
        result = await client.request(
            wallet,
            "make_invoice",
            {
                "amount": body.amount_sat * 1000,
                "description": f"Donation to {organization.name} via Resilience",
                "expiry": 600,
            },
        )
        invoice = str(result["invoice"])
        details = parse_invoice(invoice, settings.lightning_network)
        if details.amount_msat != body.amount_sat * 1000:
            raise NwcError("wallet returned an invoice with the wrong amount")
        donation = Donation(
            org_id=org_id,
            amount_sat=body.amount_sat,
            payment_hash=details.payment_hash,
            invoice=invoice,
            invoice_expires_at=datetime.fromtimestamp(details.expires_at, UTC),
        )
        db.add(donation)
        db.commit()
        db.refresh(donation)
        return to_out(donation, organization)
    except LookupError as exc:
        db.rollback()
        raise HTTPException(409, "this organisation has not connected a donation wallet") from exc
    except (NwcError, InvoiceDecodeError, KeyError, IntegrityError) as exc:
        db.rollback()
        if isinstance(exc, IntegrityError):
            raise HTTPException(409, "wallet reused an existing payment request") from exc
        raise HTTPException(502, "could not create a Lightning donation invoice") from exc


@router.get("/v1/donations/{donation_id}", response_model=DonationOut)
async def donation_status(
    donation_id: uuid.UUID,
    response: Response,
    db: Db,
    settings: SettingsDep,
    client: ClientDep,
) -> DonationOut:
    """Poll an opaque donation id. Pending invoices are reconciled against the org wallet."""
    try:
        donation = get_donation(db, donation_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    organization = _org(db, donation.org_id)
    if expire_if_needed(donation):
        db.commit()
    elif donation.state == "PENDING":
        try:
            _connection, wallet = credentials(db, settings, donation.org_id)
            result = await client.request(
                wallet,
                "lookup_invoice",
                {"payment_hash": donation.payment_hash},
            )
            if result.get("settled_at") or result.get("preimage"):
                donation = get_donation(db, donation_id, lock=True)
                if donation.state == "PENDING":
                    donation.state = "PAID"
                    donation.paid_at = datetime.now(UTC)
                    donation.invoice = None
                db.commit()
        except (LookupError, NwcError):
            # A transient wallet outage must not turn a valid invoice into a failure.
            db.rollback()
    response.headers["Cache-Control"] = "no-store"
    return to_out(donation, organization)
