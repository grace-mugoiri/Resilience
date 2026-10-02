import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import (
    CounsellorAttestation,
    CounsellorProfile,
    Organization,
    OrganizationOperationalKey,
    RosterEvent,
)
from app.directory.nip05 import Fetcher, make_fetcher
from app.directory.operational_keys import (
    OperationalKeyError,
    ParsedAuthorization,
    ParsedRevocation,
)
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
            event_id=roster.event_id,
            org_id=org.id,
            signer_pubkey=roster.signer_pubkey,
            key_authorization_event_id=operational_key_for_roster(
                db, org, roster.signer_pubkey, roster.created_at
            ).authorization_event_id,
            created_at=ts(roster.created_at),
            raw=raw,
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


def operational_key_for_roster(
    db: Session, org: Organization, pubkey: str, event_created_at: int
) -> OrganizationOperationalKey:
    key = db.get(OrganizationOperationalKey, (org.id, pubkey))
    event_time = ts(event_created_at)
    if (
        key is None
        or "roster" not in key.scopes
        or key.valid_from > event_time
        or key.expires_at <= event_time
        or (key.revoked_at is not None and key.revoked_at <= event_time)
    ):
        raise RosterError(403, "roster signer is not authorized for this event time")
    # A revoked key must never be able to submit an old, pre-revocation event later.
    if key.revoked_at is not None:
        raise RosterError(403, "roster signer has been revoked")
    return key


def authorize_operational_key(
    db: Session, org: Organization, authorization: ParsedAuthorization, raw: dict
) -> OrganizationOperationalKey:
    existing = db.get(OrganizationOperationalKey, (org.id, authorization.operational_pubkey))
    if existing is not None and existing.authorization_event_id == authorization.event_id:
        return existing
    if existing is not None:
        raise OperationalKeyError(
            409,
            "operational keys are single-authorization keys; rotate to a fresh key",
        )
    if existing is None:
        existing = OrganizationOperationalKey(
            org_id=org.id,
            pubkey=authorization.operational_pubkey,
            authorization_event_id=authorization.event_id,
            authorization_event=raw,
            scopes=authorization.scopes,
            valid_from=ts(authorization.valid_from),
            expires_at=ts(authorization.expires_at),
        )
        db.add(existing)
    db.flush()
    return existing


def revoke_operational_key(
    db: Session, org: Organization, revocation: ParsedRevocation, raw: dict
) -> OrganizationOperationalKey:
    key = db.get(OrganizationOperationalKey, (org.id, revocation.operational_pubkey))
    if key is None:
        raise OperationalKeyError(404, "operational key is not registered")
    revoked_at = ts(revocation.revoked_at)
    if key.revoked_at is not None:
        if key.revocation_event == raw:
            return key
        raise OperationalKeyError(409, "operational key is already revoked")
    if revoked_at < key.valid_from:
        raise OperationalKeyError(400, "revocation predates the authorization")
    key.revoked_at = revoked_at
    key.revocation_event = raw
    # Invalidate every attestation derived from the stolen key in this transaction.
    signed_rosters = select(RosterEvent.event_id).where(
        RosterEvent.org_id == org.id,
        RosterEvent.signer_pubkey == key.pubkey,
    )
    db.execute(
        update(CounsellorAttestation)
        .where(
            CounsellorAttestation.org_id == org.id,
            CounsellorAttestation.roster_event_id.in_(signed_rosters),
        )
        .values(active=False)
    )
    db.flush()
    return key


_STATUS_ORDER: dict[str, int] = {"verified": 0, "expired": 1, "removed": 2}


def _status(
    attestation: CounsellorAttestation,
    now: datetime,
    signer_revoked_at: datetime | None = None,
) -> CounsellorStatus:
    if not attestation.active or signer_revoked_at is not None:
        return "removed"
    if attestation.expires_at is not None and attestation.expires_at <= now:
        return "expired"
    return "verified"


def _counsellor_out(
    attestation: CounsellorAttestation,
    profile_raw: dict | None,
    now: datetime,
    signer_revoked_at: datetime | None = None,
) -> CounsellorOut:
    status = _status(attestation, now, signer_revoked_at)
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
        select(
            CounsellorAttestation,
            CounsellorProfile.raw,
            OrganizationOperationalKey.revoked_at,
        )
        .join(RosterEvent, RosterEvent.event_id == CounsellorAttestation.roster_event_id)
        .outerjoin(
            OrganizationOperationalKey,
            (OrganizationOperationalKey.org_id == RosterEvent.org_id)
            & (OrganizationOperationalKey.pubkey == RosterEvent.signer_pubkey),
        )
        .outerjoin(
            CounsellorProfile,
            CounsellorProfile.counsellor_pubkey == CounsellorAttestation.counsellor_pubkey,
        )
        .where(CounsellorAttestation.org_id == org.id)
    ).all()
    counsellors = sorted(
        (
            _counsellor_out(attestation, raw, now, revoked_at)
            for attestation, raw, revoked_at in rows
        ),
        key=_sort_key,
    )
    roster_row = db.execute(
        select(RosterEvent.raw, RosterEvent.key_authorization_event_id)
        .where(RosterEvent.org_id == org.id)
        .order_by(RosterEvent.created_at.desc())
        .limit(1)
    ).one_or_none()
    raw = roster_row.raw if roster_row else None
    authorization = None
    revocation = None
    if roster_row and roster_row.key_authorization_event_id:
        key_events = db.execute(
            select(
                OrganizationOperationalKey.authorization_event,
                OrganizationOperationalKey.revocation_event,
            ).where(
                OrganizationOperationalKey.authorization_event_id
                == roster_row.key_authorization_event_id
            )
        ).one_or_none()
        if key_events:
            authorization = key_events.authorization_event
            revocation = key_events.revocation_event
    return CounsellorsOut(
        organization=OrgOut.of(org),
        roster=raw,
        roster_key_authorization=authorization,
        roster_key_revocation=revocation,
        counsellors=counsellors,
    )


def _attestation_signer_revoked_at(
    db: Session, attestation: CounsellorAttestation
) -> datetime | None:
    return db.scalar(
        select(OrganizationOperationalKey.revoked_at)
        .join(
            RosterEvent,
            (RosterEvent.org_id == OrganizationOperationalKey.org_id)
            & (RosterEvent.signer_pubkey == OrganizationOperationalKey.pubkey),
        )
        .where(RosterEvent.event_id == attestation.roster_event_id)
    )


def store_profile(db: Session, org: Organization, profile: ParsedProfile, raw: dict) -> None:
    """Store a counsellor's profile. Only a currently verified counsellor of an approved
    organisation may publish one here. Caller holds the org row lock."""
    if org.status != "approved":
        raise ProfileError(409, "organisation is not approved")
    attestation = db.get(CounsellorAttestation, (org.id, profile.pubkey))
    if (
        attestation is None
        or _status(
            attestation,
            datetime.now(UTC),
            _attestation_signer_revoked_at(db, attestation) if attestation else None,
        )
        != "verified"
    ):
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
    return _counsellor_out(
        attestation,
        raw,
        datetime.now(UTC),
        _attestation_signer_revoked_at(db, attestation),
    )
