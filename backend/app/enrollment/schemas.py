import base64
import binascii
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.directory.schemas import CounsellorProfileOut

HEX_KEY = r"^[0-9a-f]{64}$"


class InviteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    credential_recipient_pubkey: str = Field(pattern=HEX_KEY)
    expires_in_hours: int = Field(default=168, ge=1, le=168)


class InviteCreated(BaseModel):
    id: uuid.UUID
    code: str
    organization_id: uuid.UUID
    credential_recipient_pubkey: str
    expires_at: datetime


class InviteOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    credential_recipient_pubkey: str
    expires_at: datetime
    used_at: datetime | None
    created_at: datetime


class EnrollmentClaim(BaseModel):
    model_config = ConfigDict(extra="forbid")

    invite_code: str = Field(min_length=20, max_length=80)
    profile_event: dict


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile_event: dict


class EncryptedCredential(BaseModel):
    """Opaque hybrid ciphertext. The API never receives a filename or plaintext document."""

    model_config = ConfigDict(extra="forbid")

    v: Literal[1]
    algorithm: Literal["aes-256-gcm+nip44-v2"]
    recipient_pubkey: str = Field(pattern=HEX_KEY)
    wrapped_key: str = Field(min_length=16, max_length=2048)
    iv: str = Field(min_length=16, max_length=24)
    ciphertext: str = Field(min_length=24, max_length=12_000_000)
    media_type: Literal["application/pdf", "image/jpeg", "image/png"]

    @field_validator("wrapped_key")
    @classmethod
    def nip44_v2_payload(cls, value: str) -> str:
        try:
            raw = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("ciphertext must be canonical base64") from exc
        if len(raw) < 99 or raw[0] != 2:
            raise ValueError("wrapped_key must have a NIP-44 v2 envelope")
        return value

    @field_validator("iv")
    @classmethod
    def aes_gcm_iv(cls, value: str) -> str:
        try:
            raw = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("iv must be canonical base64") from exc
        if len(raw) != 12:
            raise ValueError("iv must be a 12-byte AES-GCM nonce")
        return value

    @field_validator("ciphertext")
    @classmethod
    def aes_gcm_ciphertext(cls, value: str) -> str:
        try:
            raw = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("ciphertext must be canonical base64") from exc
        if len(raw) < 17:
            raise ValueError("ciphertext must contain AES-GCM data and an authentication tag")
        if len(raw) > 8 * 1024 * 1024:
            raise ValueError("encrypted credential is larger than 8 MiB")
        return value


class CredentialSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")

    documents: list[EncryptedCredential] = Field(min_length=1, max_length=5)


class ReviewDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str | None = Field(default=None, max_length=500)


EnrollmentStatus = Literal["draft", "under_review", "more_information", "approved", "rejected"]
DirectoryStatus = Literal["verified", "expired", "removed"]


class EnrollmentOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str
    counsellor_pubkey: str
    status: EnrollmentStatus
    directory_status: DirectoryStatus | None
    credential_recipient_pubkey: str
    profile: CounsellorProfileOut
    profile_event: dict
    encrypted_credentials: list[EncryptedCredential] | None
    review_message: str | None
    submitted_at: datetime | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
