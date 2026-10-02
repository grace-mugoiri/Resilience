import base64
import hashlib
import hmac
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import (
    CounsellorAttestation,
    CounsellorEnrollment,
    CounsellorInvite,
    CounsellorProfile,
    Organization,
)
from app.directory.profile import ProfileError, parse_profile, profile_details
from app.directory.service import counsellor_of, ts
from app.enrollment.schemas import EnrollmentOut, InviteCreated
from app.settings import Settings


def _code_hash(code: str, settings: Settings) -> str:
    return hmac.new(
        settings.counselor_invite_hmac_key.encode(),
        code.strip().upper().encode(),
        hashlib.sha256,
    ).hexdigest()


def create_invite(
    db: Session,
    org: Organization,
    creator_pubkey: str,
    recipient_pubkey: str,
    expires_in_hours: int,
    settings: Settings,
) -> InviteCreated:
    random_part = base64.b32encode(secrets.token_bytes(18)).decode().rstrip("=")
    code = "RS-" + "-".join(random_part[index : index + 5] for index in range(0, 30, 5))
    expires_at = datetime.now(UTC) + timedelta(hours=expires_in_hours)
    invite = CounsellorInvite(
        org_id=org.id,
        code_hash=_code_hash(code, settings),
        credential_recipient_pubkey=recipient_pubkey,
        created_by_pubkey=creator_pubkey,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()
    return InviteCreated(
        id=invite.id,
        code=code,
        organization_id=org.id,
        credential_recipient_pubkey=recipient_pubkey,
        expires_at=expires_at,
    )


def claim_invite(
    db: Session,
    code: str,
    counsellor_pubkey: str,
    profile_event: dict,
    settings: Settings,
) -> CounsellorEnrollment:
    invite = db.scalars(
        select(CounsellorInvite)
        .where(CounsellorInvite.code_hash == _code_hash(code, settings))
        .with_for_update()
    ).one_or_none()
    now = datetime.now(UTC)
    if invite is None or invite.used_at is not None or invite.expires_at <= now:
        raise HTTPException(404, "invite is invalid, expired, or already used")
    org = db.get(Organization, invite.org_id)
    if org is None or org.status != "approved":
        raise HTTPException(409, "inviting organisation is not approved")
    try:
        parsed = parse_profile(profile_event, counsellor_pubkey, int(time.time()))
    except ProfileError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc
    invite.used_at = now
    invite.used_by_pubkey = counsellor_pubkey
    enrollment = CounsellorEnrollment(
        org_id=invite.org_id,
        invite_id=invite.id,
        counsellor_pubkey=counsellor_pubkey,
        profile_event_id=parsed.event_id,
        profile_event=profile_event,
    )
    db.add(enrollment)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "this counsellor already has an application") from exc
    return enrollment


def enrollment_for_counsellor(
    db: Session, enrollment_id: uuid.UUID, pubkey: str, lock: bool = False
) -> CounsellorEnrollment:
    query = select(CounsellorEnrollment).where(CounsellorEnrollment.id == enrollment_id)
    enrollment = db.scalars(query.with_for_update() if lock else query).one_or_none()
    if enrollment is None or enrollment.counsellor_pubkey != pubkey:
        raise HTTPException(404, "counsellor application not found")
    return enrollment


def enrollment_for_org(
    db: Session, org_id: uuid.UUID, enrollment_id: uuid.UUID, lock: bool = False
) -> CounsellorEnrollment:
    query = select(CounsellorEnrollment).where(
        CounsellorEnrollment.id == enrollment_id,
        CounsellorEnrollment.org_id == org_id,
    )
    enrollment = db.scalars(query.with_for_update() if lock else query).one_or_none()
    if enrollment is None:
        raise HTTPException(404, "counsellor application not found")
    return enrollment


def update_profile(
    db: Session, enrollment: CounsellorEnrollment, profile_event: dict
) -> CounsellorEnrollment:
    if enrollment.status in {"approved", "rejected"}:
        raise HTTPException(409, "a decided application cannot be edited")
    try:
        parsed = parse_profile(profile_event, enrollment.counsellor_pubkey, int(time.time()))
    except ProfileError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc
    current = parse_profile(
        enrollment.profile_event, enrollment.counsellor_pubkey, int(time.time())
    )
    if parsed.created_at <= current.created_at:
        raise HTTPException(409, "a profile as new or newer is already stored")
    enrollment.profile_event_id = parsed.event_id
    enrollment.profile_event = profile_event
    db.commit()
    return enrollment


def submit_credentials(
    db: Session, enrollment: CounsellorEnrollment, documents: list[dict]
) -> CounsellorEnrollment:
    if enrollment.status not in {"draft", "more_information"}:
        raise HTTPException(409, "credentials cannot be submitted in this application state")
    invite = db.get(CounsellorInvite, enrollment.invite_id)
    assert invite is not None
    if any(doc["recipient_pubkey"] != invite.credential_recipient_pubkey for doc in documents):
        raise HTTPException(422, "every document must be encrypted to the invitation review key")
    enrollment.encrypted_credentials = documents
    enrollment.status = "under_review"
    enrollment.review_message = None
    enrollment.submitted_at = datetime.now(UTC)
    db.commit()
    return enrollment


def decide(
    db: Session,
    enrollment: CounsellorEnrollment,
    reviewer_pubkey: str,
    decision: str,
    message: str | None,
) -> CounsellorEnrollment:
    if enrollment.status != "under_review":
        raise HTTPException(409, "only an application under review can be decided")
    clean_message = message.strip() if message else None
    if decision == "more_information" and not clean_message:
        raise HTTPException(422, "a message is required when requesting more information")
    enrollment.status = decision
    enrollment.review_message = clean_message
    enrollment.reviewed_by_pubkey = reviewer_pubkey
    enrollment.reviewed_at = datetime.now(UTC)
    # Once a reviewer decides, or requests a replacement, the server no longer needs ciphertext.
    enrollment.encrypted_credentials = None
    if decision == "approved":
        promote_profile_if_rostered(db, enrollment)
    db.commit()
    return enrollment


def promote_profile_if_rostered(db: Session, enrollment: CounsellorEnrollment) -> bool:
    """Publish the already-signed profile only after both review approval and a roster listing."""
    if enrollment.status != "approved":
        return False
    attestation = db.get(CounsellorAttestation, (enrollment.org_id, enrollment.counsellor_pubkey))
    now = datetime.now(UTC)
    if (
        attestation is None
        or not attestation.active
        or (attestation.expires_at is not None and attestation.expires_at <= now)
    ):
        return False
    parsed = parse_profile(enrollment.profile_event, enrollment.counsellor_pubkey, int(time.time()))
    current = db.get(CounsellorProfile, enrollment.counsellor_pubkey)
    if current is None:
        db.add(
            CounsellorProfile(
                counsellor_pubkey=enrollment.counsellor_pubkey,
                event_id=parsed.event_id,
                created_at=ts(parsed.created_at),
                raw=enrollment.profile_event,
            )
        )
    elif current.created_at < ts(parsed.created_at):
        current.event_id = parsed.event_id
        current.created_at = ts(parsed.created_at)
        current.raw = enrollment.profile_event
    db.flush()
    return True


def promote_rostered_enrollments(
    db: Session, org_id: uuid.UUID, counsellor_pubkeys: list[str]
) -> None:
    if not counsellor_pubkeys:
        return
    enrollments = db.scalars(
        select(CounsellorEnrollment).where(
            CounsellorEnrollment.org_id == org_id,
            CounsellorEnrollment.counsellor_pubkey.in_(counsellor_pubkeys),
            CounsellorEnrollment.status == "approved",
        )
    ).all()
    for enrollment in enrollments:
        promote_profile_if_rostered(db, enrollment)


def enrollment_out(db: Session, enrollment: CounsellorEnrollment) -> EnrollmentOut:
    org = db.get(Organization, enrollment.org_id)
    invite = db.get(CounsellorInvite, enrollment.invite_id)
    assert org is not None and invite is not None
    details = profile_details(enrollment.profile_event["content"])
    directory_status = None
    try:
        directory_status = counsellor_of(db, org, enrollment.counsellor_pubkey).status
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    return EnrollmentOut(
        id=enrollment.id,
        organization_id=org.id,
        organization_name=org.name,
        counsellor_pubkey=enrollment.counsellor_pubkey,
        status=enrollment.status,
        directory_status=directory_status,
        credential_recipient_pubkey=invite.credential_recipient_pubkey,
        profile=details.__dict__,
        profile_event=enrollment.profile_event,
        encrypted_credentials=enrollment.encrypted_credentials,
        review_message=enrollment.review_message,
        submitted_at=enrollment.submitted_at,
        reviewed_at=enrollment.reviewed_at,
        created_at=enrollment.created_at,
        updated_at=enrollment.updated_at,
    )
