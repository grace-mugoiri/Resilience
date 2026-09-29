"""The public directory of verified organisations and their counsellors."""

import time
import uuid
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.nip98 import NostrPubkey
from app.db.models import Organization
from app.db.session import get_db
from app.directory.nip05 import DomainError, normalize_domain
from app.directory.roster import RosterError, parse_roster
from app.directory.schemas import CounsellorsOut, OrgApplication, OrgOut
from app.directory.service import counsellors_of, get_org, store_roster

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
    org = Organization(name=body.name.strip(), domain=domain, nostr_pubkey=pubkey)
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
    """Takes the organisation's signed roster event. No NIP-98 header is needed: the event
    carries the organisation's own signature, and older rosters are refused."""
    org = get_org(db, org_id, lock=True)
    try:
        roster = parse_roster(event, org.nostr_pubkey, int(time.time()))
        store_roster(db, org, roster, event)
    except RosterError as exc:
        db.rollback()
        raise HTTPException(exc.status_code, exc.detail) from exc
    db.commit()
    return counsellors_of(db, org)
