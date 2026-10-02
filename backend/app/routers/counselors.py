from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.counselor import CounselorProfile, VerificationStatus
from app.models.identity import Identity, IdentityRole
from app.schemas.counselor import (
    CounselorProfileCreateRequest,
    CounselorProfileResponse,
    CounselorProfileUpdateRequest,
)
from app.security import get_current_identity

router = APIRouter(prefix="/api/counselors", tags=["counselors"])


def _to_response(profile: CounselorProfile) -> CounselorProfileResponse:
    return CounselorProfileResponse(
        id=profile.id,
        identity_id=profile.identity_id,
        display_name=profile.display_name,
        bio=profile.bio,
        specialties=[s.strip() for s in profile.specialties.split(",") if s.strip()],
        languages=[l.strip() for l in profile.languages.split(",") if l.strip()],
        attesting_organization=profile.attesting_organization,
        verification_status=profile.verification_status,
        verification_updated_at=profile.verification_updated_at,
        verification_expires_at=profile.verification_expires_at,
        is_available=profile.is_available,
    )


@router.get("", response_model=list[CounselorProfileResponse])
def list_counselors(
    verification_status: VerificationStatus | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(CounselorProfile)
    if verification_status is not None:
        query = query.filter_by(verification_status=verification_status)
    return [_to_response(p) for p in query.all()]


@router.get("/{counselor_id}", response_model=CounselorProfileResponse)
def get_counselor(counselor_id: str, db: Session = Depends(get_db)):
    profile = db.get(CounselorProfile, counselor_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Counselor not found")
    return _to_response(profile)


@router.post("", response_model=CounselorProfileResponse, status_code=status.HTTP_201_CREATED)
def create_counselor_profile(
    payload: CounselorProfileCreateRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    if current.role != IdentityRole.COUNSELOR:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only counselor identities can create a counselor profile")
    if db.query(CounselorProfile).filter_by(identity_id=current.id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Profile already exists for this identity")

    profile = CounselorProfile(
        identity_id=current.id,
        display_name=payload.display_name,
        bio=payload.bio,
        specialties=",".join(payload.specialties),
        languages=",".join(payload.languages),
        attesting_organization=payload.attesting_organization,
        verification_status=VerificationStatus.PENDING,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _to_response(profile)


@router.patch("/{counselor_id}", response_model=CounselorProfileResponse)
def update_counselor_profile(
    counselor_id: str,
    payload: CounselorProfileUpdateRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    profile = db.get(CounselorProfile, counselor_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Counselor not found")
    if profile.identity_id != current.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own profile")

    if payload.bio is not None:
        profile.bio = payload.bio
    if payload.specialties is not None:
        profile.specialties = ",".join(payload.specialties)
    if payload.languages is not None:
        profile.languages = ",".join(payload.languages)
    if payload.is_available is not None:
        profile.is_available = payload.is_available

    db.commit()
    db.refresh(profile)
    return _to_response(profile)
