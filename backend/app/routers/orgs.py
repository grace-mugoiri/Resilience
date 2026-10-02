"""The public directory of verified organisations and their counsellors."""

import time
import uuid
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.nip98 import NostrPubkey
from app.db.models import Organization
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
    CounsellorOut,
    CounsellorsOut,
    OperationalKeyOut,
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
