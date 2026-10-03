"""The public directory of verified organisations and their counsellors."""

import time
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.nip98 import NostrPubkey
from app.auth.org import require_org_manager
from app.db.models import (
    CounsellorEnrollment,
    CounsellorInvite,
    Organization,
    OrganizationOperationalKey,
)
from app.db.session import get_db
from app.directory.nip05 import DomainError, normalize_domain
from app.directory.operational_keys import (
    OperationalKeyError,
    parse_authorization,
    parse_revocation,
)
from app.directory.profile import ProfileError, parse_profile
from app.directory.roster import RosterError, parse_roster
from app.directory.schemas import (
    CounsellorCounts,
    CounsellorOut,
    CounsellorsOut,
    EnrollmentCounts,
    OperationalKeyOut,
    OrganizationAccessOut,
    OrganizationDashboardOut,
    OrgApplication,
    OrgOut,
)
from app.directory.service import (
    authorize_operational_key,
    counsellor_of,
    counsellors_of,
    get_org,
    operational_key_for_roster,
    revoke_operational_key,
    store_profile,
    store_roster,
)
from app.enrollment.service import promote_rostered_enrollments

router = APIRouter(prefix="/v1/orgs", tags=["directory"])
Db = Annotated[Session, Depends(get_db)]
OrgManager = Annotated[str, Depends(require_org_manager)]


@router.post("", status_code=status.HTTP_201_CREATED)
def apply(body: OrgApplication, pubkey: NostrPubkey, db: Db) -> OrgOut:
    """An organisation applies, signing the request with its own key (NIP-98).
    That key becomes its identity. An admin approves it after the NIP-05 check."""
    try:
        domain = normalize_domain(body.domain)
    except DomainError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    org = Organization(
        name=body.name.strip(),
        domain=domain,
        nostr_pubkey=pubkey,
        directory_visibility=body.directory_visibility,
        focus_areas=body.focus_areas,
    )
    db.add(org)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "this domain or key has already applied") from exc
    return OrgOut.of(org)


@router.get("")
def list_approved(db: Db, response: Response) -> list[OrgOut]:
    """Public. Survivors never authenticate, so the server cannot tell who is reading."""
    response.headers["Cache-Control"] = "public, max-age=60"
    orgs = db.scalars(
        select(Organization).where(Organization.status == "approved").order_by(Organization.name)
    ).all()
    return [OrgOut.of(org) for org in orgs]


@router.get("/me")
def my_organization(pubkey: NostrPubkey, db: Db) -> OrganizationAccessOut:
    """Return pending or approved organization state to its root or active operational key."""
    root_org = db.scalar(select(Organization).where(Organization.nostr_pubkey == pubkey))
    if root_org is not None:
        return OrganizationAccessOut(
            organization=OrgOut.of(root_org), actor="root", operational_key=None
        )

    now = datetime.now(UTC)
    rows = db.execute(
        select(Organization, OrganizationOperationalKey)
        .join(
            OrganizationOperationalKey,
            OrganizationOperationalKey.org_id == Organization.id,
        )
        .where(
            OrganizationOperationalKey.pubkey == pubkey,
            OrganizationOperationalKey.valid_from <= now,
            OrganizationOperationalKey.expires_at > now,
            OrganizationOperationalKey.revoked_at.is_(None),
        )
    ).all()
    if not rows:
        raise HTTPException(404, "organisation not found")
    if len(rows) != 1:
        raise HTTPException(409, "operational key is associated with multiple organisations")
    org, key = rows[0]
    return OrganizationAccessOut(
        organization=OrgOut.of(org),
        actor="operational",
        operational_key=_operational_key_out(key),
    )


@router.get("/{org_id}/dashboard")
def organization_dashboard(
    org_id: uuid.UUID,
    _manager: OrgManager,
    db: Db,
) -> OrganizationDashboardOut:
    """Small, non-sensitive summary for the organization portal."""
    org = get_org(db, org_id)
    enrollment_counts = EnrollmentCounts()
    for enrollment_status, count in db.execute(
        select(CounsellorEnrollment.status, func.count())
        .where(CounsellorEnrollment.org_id == org_id)
        .group_by(CounsellorEnrollment.status)
    ):
        setattr(enrollment_counts, enrollment_status, count)

    counsellor_counts = CounsellorCounts()
    if org.status == "approved":
        for counsellor in counsellors_of(db, org).counsellors:
            setattr(
                counsellor_counts,
                counsellor.status,
                getattr(counsellor_counts, counsellor.status) + 1,
            )
    active_invites = db.scalar(
        select(func.count())
        .select_from(CounsellorInvite)
        .where(
            CounsellorInvite.org_id == org_id,
            CounsellorInvite.used_at.is_(None),
            CounsellorInvite.expires_at > datetime.now(UTC),
        )
    )
    return OrganizationDashboardOut(
        organization=OrgOut.of(org),
        active_invites=active_invites or 0,
        enrollments=enrollment_counts,
        counsellors=counsellor_counts,
    )


@router.get("/{org_id}/counsellors")
def list_counsellors(org_id: uuid.UUID, db: Db, response: Response) -> CounsellorsOut:
    org = get_org(db, org_id)
    if org.status != "approved":
        raise HTTPException(404, "organisation not found")
    response.headers["Cache-Control"] = "public, max-age=60"
    return counsellors_of(db, org)


@router.put("/{org_id}/roster")
def put_roster(org_id: uuid.UUID, db: Db, event: Annotated[dict, Body()]) -> CounsellorsOut:
    """Accept a roster signed by an active root-authorized operational key."""
    org = get_org(db, org_id, lock=True)
    try:
        signer = event.get("pubkey", "") if isinstance(event, dict) else ""
        roster = parse_roster(event, signer, int(time.time()))
        operational_key_for_roster(db, org, roster.signer_pubkey, roster.created_at)
        store_roster(db, org, roster, event)
        promote_rostered_enrollments(db, org.id, roster.members)
    except RosterError as exc:
        db.rollback()
        raise HTTPException(exc.status_code, exc.detail) from exc
    db.commit()
    return counsellors_of(db, org)


def _operational_key_out(key) -> OperationalKeyOut:
    return OperationalKeyOut(
        pubkey=key.pubkey,
        scopes=key.scopes,
        valid_from=key.valid_from,
        expires_at=key.expires_at,
        revoked_at=key.revoked_at,
        authorization_event=key.authorization_event,
        revocation_event=key.revocation_event,
    )


@router.get("/{org_id}/operational-keys")
def list_operational_keys(
    org_id: uuid.UUID,
    _manager: OrgManager,
    db: Db,
) -> list[OperationalKeyOut]:
    keys = db.scalars(
        select(OrganizationOperationalKey)
        .where(OrganizationOperationalKey.org_id == org_id)
        .order_by(OrganizationOperationalKey.created_at.desc())
    ).all()
    return [_operational_key_out(key) for key in keys]


@router.put("/{org_id}/operational-keys")
def put_operational_key(
    org_id: uuid.UUID, db: Db, event: Annotated[dict, Body()]
) -> OperationalKeyOut:
    """Register or rotate an online key using an authorization signed by the offline root."""
    org = get_org(db, org_id, lock=True)
    try:
        parsed = parse_authorization(event, org.nostr_pubkey, int(time.time()))
        key = authorize_operational_key(db, org, parsed, event)
    except OperationalKeyError as exc:
        db.rollback()
        raise HTTPException(exc.status_code, exc.detail) from exc
    db.commit()
    return _operational_key_out(key)


@router.put("/{org_id}/operational-keys/{pubkey}/revoke")
def revoke_key(
    org_id: uuid.UUID,
    pubkey: Annotated[str, Path(pattern=r"^[0-9a-f]{64}$")],
    db: Db,
    event: Annotated[dict, Body()],
) -> OperationalKeyOut:
    """Immediately disable an operational key using a root-signed revocation."""
    org = get_org(db, org_id, lock=True)
    try:
        parsed = parse_revocation(event, org.nostr_pubkey, int(time.time()))
        if parsed.operational_pubkey != pubkey:
            raise OperationalKeyError(400, "revocation p tag does not match the URL key")
        key = revoke_operational_key(db, org, parsed, event)
    except OperationalKeyError as exc:
        db.rollback()
        raise HTTPException(exc.status_code, exc.detail) from exc
    db.commit()
    return _operational_key_out(key)


@router.put("/{org_id}/counsellors/{pubkey}/profile")
def put_profile(
    org_id: uuid.UUID,
    pubkey: Annotated[str, Path(pattern=r"^[0-9a-f]{64}$")],
    db: Db,
    event: Annotated[dict, Body()],
) -> CounsellorOut:
    """Takes a counsellor's signed kind 0 profile. Like the roster, no NIP-98 header is needed:
    the event carries the counsellor's own signature, and older profiles are refused."""
    org = get_org(db, org_id, lock=True)
    try:
        profile = parse_profile(event, pubkey, int(time.time()))
        store_profile(db, org, profile, event)
    except ProfileError as exc:
        db.rollback()
        raise HTTPException(exc.status_code, exc.detail) from exc
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "profile changed at the same time; resend it") from exc
    db.commit()
    return counsellor_of(db, org, pubkey)
