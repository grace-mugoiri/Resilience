import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.models import Donation, Organization
from app.donations.schemas import DonationOut


def get_donation(db: Session, donation_id: uuid.UUID, *, lock: bool = False) -> Donation:
    query = db.query(Donation).filter(Donation.id == donation_id)
    if lock:
        query = query.with_for_update()
    donation = query.one_or_none()
    if donation is None:
        raise LookupError("donation not found")
    return donation


def expire_if_needed(donation: Donation, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    expires_at = donation.invoice_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if donation.state == "PENDING" and expires_at <= now:
        donation.state = "EXPIRED"
        donation.invoice = None
        return True
    return False


def to_out(donation: Donation, organization: Organization) -> DonationOut:
    return DonationOut(
        id=donation.id,
        org_id=donation.org_id,
        organization_name=organization.name,
        amount_sat=donation.amount_sat,
        state=donation.state,
        invoice=donation.invoice if donation.state == "PENDING" else None,
        invoice_expires_at=donation.invoice_expires_at,
        created_at=donation.created_at,
        paid_at=donation.paid_at,
    )
