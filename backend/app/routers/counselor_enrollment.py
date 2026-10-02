"""Single-use counselor invitations and encrypted credential review."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.nip98 import NostrPubkey
from app.auth.org import require_org_key, require_org_operation
from app.auth.scoped import require_scoped_authorization
from app.db.models import CounsellorEnrollment
from app.db.session import get_db
from app.directory.service import get_org
from app.enrollment.schemas import (
    CredentialSubmission,
    EnrollmentClaim,
    EnrollmentOut,
    InviteCreate,
    InviteCreated,
    ProfileUpdate,
    ReviewDecision,
)
from app.enrollment.service import (
    claim_invite,
    create_invite,
    decide,
    enrollment_for_counsellor,
    enrollment_for_org,
    enrollment_out,
    submit_credentials,
    update_profile,
)
from app.settings import Settings, get_settings

router = APIRouter(tags=["counselor enrollment"])
Db = Annotated[Session, Depends(get_db)]
VerificationReader = Annotated[str, Depends(require_org_key("verification"))]
InviteWriter = Annotated[
    str,
    Depends(require_org_operation("verification", "counselor:invite:{org_id}")),
]
ReviewWriter = Annotated[
    str,
    Depends(require_org_operation("verification", "counselor:review:{org_id}")),
]
CredentialWriter = Annotated[
    str,
    Depends(require_scoped_authorization("counselor:credentials:{enrollment_id}")),
]


@router.post(
    "/v1/orgs/{org_id}/counselor-invites",
    status_code=status.HTTP_201_CREATED,
)
def post_invite(
    org_id: uuid.UUID,
    body: InviteCreate,
    reviewer: InviteWriter,
    db: Db,
    settings: Annotated[Settings, Depends(get_settings)],
) -> InviteCreated:
    """Return the invite code exactly once; only a keyed hash is persisted."""
    org = get_org(db, org_id)
    return create_invite(
        db,
        org,
        reviewer,
        body.credential_recipient_pubkey,
        body.expires_in_hours,
        settings,
    )


@router.post(
    "/v1/counselor-enrollments/claim",
    status_code=status.HTTP_201_CREATED,
)
def post_claim(
    body: EnrollmentClaim,
    counsellor: NostrPubkey,
    db: Db,
    settings: Annotated[Settings, Depends(get_settings)],
) -> EnrollmentOut:
    enrollment = claim_invite(db, body.invite_code, counsellor, body.profile_event, settings)
    return enrollment_out(db, enrollment)


@router.get("/v1/counselor-enrollments/{enrollment_id}")
def get_enrollment(enrollment_id: uuid.UUID, counsellor: NostrPubkey, db: Db) -> EnrollmentOut:
    return enrollment_out(db, enrollment_for_counsellor(db, enrollment_id, counsellor))


@router.put("/v1/counselor-enrollments/{enrollment_id}/profile")
def put_enrollment_profile(
    enrollment_id: uuid.UUID,
    body: ProfileUpdate,
    counsellor: NostrPubkey,
    db: Db,
) -> EnrollmentOut:
    enrollment = enrollment_for_counsellor(db, enrollment_id, counsellor, lock=True)
    return enrollment_out(db, update_profile(db, enrollment, body.profile_event))


@router.put("/v1/counselor-enrollments/{enrollment_id}/credentials")
def put_credentials(
    enrollment_id: uuid.UUID,
    body: CredentialSubmission,
    counsellor: CredentialWriter,
    db: Db,
) -> EnrollmentOut:
    enrollment = enrollment_for_counsellor(db, enrollment_id, counsellor, lock=True)
    documents = [document.model_dump() for document in body.documents]
    return enrollment_out(db, submit_credentials(db, enrollment, documents))


@router.get("/v1/orgs/{org_id}/counselor-enrollments")
def list_enrollments(
    org_id: uuid.UUID,
    _reviewer: VerificationReader,
    db: Db,
    enrollment_status: Annotated[
        Literal["draft", "under_review", "more_information", "approved", "rejected"] | None,
        Query(alias="status"),
    ] = None,
) -> list[EnrollmentOut]:
    query = select(CounsellorEnrollment).where(CounsellorEnrollment.org_id == org_id)
    if enrollment_status:
        query = query.where(CounsellorEnrollment.status == enrollment_status)
    enrollments = db.scalars(query.order_by(CounsellorEnrollment.created_at)).all()
    return [enrollment_out(db, enrollment) for enrollment in enrollments]


def _review(
    org_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    body: ReviewDecision,
    reviewer: str,
    db: Session,
    decision: str,
) -> EnrollmentOut:
    enrollment = enrollment_for_org(db, org_id, enrollment_id, lock=True)
    return enrollment_out(db, decide(db, enrollment, reviewer, decision, body.message))


@router.post("/v1/orgs/{org_id}/counselor-enrollments/{enrollment_id}/request-information")
def request_information(
    org_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    body: ReviewDecision,
    reviewer: ReviewWriter,
    db: Db,
) -> EnrollmentOut:
    return _review(org_id, enrollment_id, body, reviewer, db, "more_information")


@router.post("/v1/orgs/{org_id}/counselor-enrollments/{enrollment_id}/approve")
def approve_enrollment(
    org_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    body: ReviewDecision,
    reviewer: ReviewWriter,
    db: Db,
) -> EnrollmentOut:
    return _review(org_id, enrollment_id, body, reviewer, db, "approved")


@router.post("/v1/orgs/{org_id}/counselor-enrollments/{enrollment_id}/reject")
def reject_enrollment(
    org_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    body: ReviewDecision,
    reviewer: ReviewWriter,
    db: Db,
) -> EnrollmentOut:
    return _review(org_id, enrollment_id, body, reviewer, db, "rejected")
