"""Models counselor verification as an external attestation.

IMPORTANT: Resilience is not itself a licensing or professional-verification
authority. In production, `attest` would be called by a trusted partner
organization's own credentialing pipeline (webhook, signed assertion, etc.),
not by the counselor or the platform. Here it's a plain mock method so the
prototype can demonstrate all four states (verified / pending / expired /
revoked) without any real credentialing integration.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.counselor import CounselorProfile, VerificationStatus


class VerificationService:
    def attest(
        self, db: Session, counselor_id: str, status: VerificationStatus, organization: str
    ) -> CounselorProfile:
        profile = db.get(CounselorProfile, counselor_id)
        if profile is None:
            raise ValueError("Counselor profile not found")
        profile.verification_status = status
        profile.attesting_organization = organization
        profile.verification_updated_at = datetime.utcnow()
        db.commit()
        db.refresh(profile)
        return profile


_service = VerificationService()


def get_verification_service() -> VerificationService:
    return _service
