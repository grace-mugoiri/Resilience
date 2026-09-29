import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import CounsellorAttestation, Organization, RosterEvent
from app.directory.nip05 import Fetcher, make_fetcher
from app.directory.roster import ParsedRoster, RosterError
from app.directory.schemas import CounsellorsOut
from app.settings import Settings, get_settings


def get_nip05_fetcher(settings: Annotated[Settings, Depends(get_settings)]) -> Fetcher:
    return make_fetcher(settings)


Nip05Fetcher = Annotated[Callable[[str], tuple[int, bytes]], Depends(get_nip05_fetcher)]


def ts(seconds: int) -> datetime:
    return datetime.fromtimestamp(seconds, UTC)


def get_org(db: Session, org_id: uuid.UUID, lock: bool = False) -> Organization:
    query = select(Organization).where(Organization.id == org_id)
    org = db.scalars(query.with_for_update() if lock else query).one_or_none()
    if org is None:
        raise HTTPException(404, "organisation not found")
    return org


def store_roster(db: Session, org: Organization, roster: ParsedRoster, raw: dict) -> None:
    """Make `roster` the organisation's current list. Caller holds the org row lock."""
    if org.status != "approved":
        raise RosterError(409, "organisation is not approved")
    latest = db.execute(
        select(RosterEvent.event_id, RosterEvent.created_at)
        .where(RosterEvent.org_id == org.id)
        .order_by(RosterEvent.created_at.desc())
        .limit(1)
    ).one_or_none()
    if latest is not None and latest.event_id == roster.event_id:
        return  # the current roster sent again: nothing to do
    if latest is not None and ts(roster.created_at) <= latest.created_at:
        raise RosterError(409, "a roster as new or newer is already stored")

    db.add(
        RosterEvent(
            event_id=roster.event_id, org_id=org.id, created_at=ts(roster.created_at), raw=raw
        )
    )
    db.flush()
    if roster.members:
        stmt = insert(CounsellorAttestation).values(
            [
                {
                    "org_id": org.id,
                    "counsellor_pubkey": key,
                    "roster_event_id": roster.event_id,
                    "issued_at": ts(roster.created_at),
                    "expires_at": ts(roster.expires_at),
                    "active": True,
                }
                for key in roster.members
            ]
        )
        db.execute(
            stmt.on_conflict_do_update(
                index_elements=["org_id", "counsellor_pubkey"],
                set_={
                    "roster_event_id": stmt.excluded.roster_event_id,
                    "issued_at": stmt.excluded.issued_at,
                    "expires_at": stmt.excluded.expires_at,
                    "active": True,
                },
            )
        )
    # Anyone left off the newest roster stops being trusted.
    db.execute(
        update(CounsellorAttestation)
        .where(
            CounsellorAttestation.org_id == org.id,
            CounsellorAttestation.counsellor_pubkey.not_in(roster.members),
        )
        .values(active=False)
    )


def counsellors_of(db: Session, org: Organization) -> CounsellorsOut:
    now = datetime.now(UTC)
    keys = db.scalars(
        select(CounsellorAttestation.counsellor_pubkey)
        .where(
            CounsellorAttestation.org_id == org.id,
            CounsellorAttestation.active.is_(True),
            or_(CounsellorAttestation.expires_at.is_(None), CounsellorAttestation.expires_at > now),
        )
        .order_by(CounsellorAttestation.counsellor_pubkey)
    ).all()
    raw = db.scalar(
        select(RosterEvent.raw)
        .where(RosterEvent.org_id == org.id)
        .order_by(RosterEvent.created_at.desc())
        .limit(1)
    )
    return CounsellorsOut(org_id=org.id, roster=raw, counsellors=list(keys))
