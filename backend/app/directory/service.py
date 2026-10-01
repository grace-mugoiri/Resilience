import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import CounsellorAttestation, CounsellorProfile, Organization, RosterEvent
from app.directory.nip05 import Fetcher, make_fetcher
from app.directory.profile import ParsedProfile, ProfileError, profile_details
from app.directory.roster import ParsedRoster, RosterError
from app.directory.schemas import (
    CounsellorOut,
    CounsellorProfileOut,
    CounsellorsOut,
    CounsellorStatus,
    OrgOut,
)
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


_STATUS_ORDER: dict[str, int] = {"verified": 0, "expired": 1, "removed": 2}


def _status(attestation: CounsellorAttestation, now: datetime) -> CounsellorStatus:
    if not attestation.active:
        return "removed"
    if attestation.expires_at is not None and attestation.expires_at <= now:
        return "expired"
    return "verified"


def _counsellor_out(
    attestation: CounsellorAttestation, profile_raw: dict | None, now: datetime
) -> CounsellorOut:
    status = _status(attestation, now)
    profile = None
    if profile_raw is not None:
        # Stored profiles were validated on the way in; read them with the same rules.
        details = profile_details(profile_raw["content"])
        profile = CounsellorProfileOut(**details.__dict__)
    return CounsellorOut(
        pubkey=attestation.counsellor_pubkey,
        status=status,
        verified_until=None if status == "removed" else attestation.expires_at,
        profile=profile,
        profile_event=profile_raw,
    )


def _sort_key(counsellor: CounsellorOut) -> tuple:
    name = counsellor.profile.name.casefold() if counsellor.profile else ""
    return (_STATUS_ORDER[counsellor.status], counsellor.profile is None, name, counsellor.pubkey)


def counsellors_of(db: Session, org: Organization) -> CounsellorsOut:
    """Everyone the organisation has ever listed, each with a status, so a survivor already
    talking to a counsellor sees "removed" or "expired" instead of the counsellor vanishing."""
    now = datetime.now(UTC)
    rows = db.execute(
        select(CounsellorAttestation, CounsellorProfile.raw)
        .outerjoin(
            CounsellorProfile,
            CounsellorProfile.counsellor_pubkey == CounsellorAttestation.counsellor_pubkey,
        )
        .where(CounsellorAttestation.org_id == org.id)
    ).all()
    counsellors = sorted(
        (_counsellor_out(attestation, raw, now) for attestation, raw in rows), key=_sort_key
    )
    raw = db.scalar(
        select(RosterEvent.raw)
        .where(RosterEvent.org_id == org.id)
        .order_by(RosterEvent.created_at.desc())
        .limit(1)
    )
    return CounsellorsOut(organization=OrgOut.of(org), roster=raw, counsellors=counsellors)


def store_profile(db: Session, org: Organization, profile: ParsedProfile, raw: dict) -> None:
    """Store a counsellor's profile. Only a currently verified counsellor of an approved
    organisation may publish one here. Caller holds the org row lock."""
    if org.status != "approved":
        raise ProfileError(409, "organisation is not approved")
    attestation = db.get(CounsellorAttestation, (org.id, profile.pubkey))
    if attestation is None or _status(attestation, datetime.now(UTC)) != "verified":
        raise ProfileError(
            403, "only a counsellor on the organisation's current roster can do this"
        )

    current = db.scalars(
        select(CounsellorProfile)
        .where(CounsellorProfile.counsellor_pubkey == profile.pubkey)
        .with_for_update()
    ).one_or_none()
    if current is not None and current.event_id == profile.event_id:
        return  # the same profile sent again: nothing to do
    if current is not None and ts(profile.created_at) <= current.created_at:
        raise ProfileError(409, "a profile as new or newer is already stored")
    if current is None:
        db.add(
            CounsellorProfile(
                counsellor_pubkey=profile.pubkey,
                event_id=profile.event_id,
                created_at=ts(profile.created_at),
                raw=raw,
            )
        )
    else:
        current.event_id = profile.event_id
        current.created_at = ts(profile.created_at)
        current.raw = raw
    db.flush()


def counsellor_of(db: Session, org: Organization, pubkey: str) -> CounsellorOut:
    attestation = db.get(CounsellorAttestation, (org.id, pubkey))
    if attestation is None:
        raise HTTPException(404, "counsellor not found")
    raw = db.scalar(
        select(CounsellorProfile.raw).where(CounsellorProfile.counsellor_pubkey == pubkey)
    )
    return _counsellor_out(attestation, raw, datetime.now(UTC))
