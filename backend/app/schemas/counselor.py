from datetime import datetime

from pydantic import BaseModel, Field

from app.models.counselor import VerificationStatus


class CounselorProfileCreateRequest(BaseModel):
    display_name: str = Field(min_length=2, max_length=64)
    bio: str = Field(default="", max_length=2000)
    specialties: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    attesting_organization: str = Field(default="", max_length=120)


class CounselorProfileUpdateRequest(BaseModel):
    bio: str | None = Field(default=None, max_length=2000)
    specialties: list[str] | None = None
    languages: list[str] | None = None
    is_available: bool | None = None


class CounselorProfileResponse(BaseModel):
    id: str
    identity_id: str
    display_name: str
    bio: str
    specialties: list[str]
    languages: list[str]
    attesting_organization: str
    verification_status: VerificationStatus
    verification_updated_at: datetime
    verification_expires_at: datetime | None
    is_available: bool

    model_config = {"from_attributes": True}
