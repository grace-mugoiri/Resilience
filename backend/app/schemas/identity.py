from datetime import datetime

from pydantic import BaseModel, Field

from app.models.identity import IdentityRole


class IdentityCreateRequest(BaseModel):
    role: IdentityRole
    pin: str = Field(min_length=4, max_length=8, pattern=r"^\d+$")
    pseudonym: str | None = Field(default=None, min_length=2, max_length=32)


class IdentityRestoreRequest(BaseModel):
    recovery_phrase: str = Field(min_length=1)
    pin: str = Field(min_length=4, max_length=8, pattern=r"^\d+$")


class IdentityLoginRequest(BaseModel):
    identity_id: str
    pin: str


class ChangePinRequest(BaseModel):
    current_pin: str
    new_pin: str = Field(min_length=4, max_length=8, pattern=r"^\d+$")


class IdentityResponse(BaseModel):
    id: str
    pseudonym: str
    role: IdentityRole
    npub: str
    avatar_seed: str
    created_at: datetime

    model_config = {"from_attributes": True}


class IdentityCreateResponse(BaseModel):
    identity: IdentityResponse
    recovery_phrase: str
    token: str


class IdentityAuthResponse(BaseModel):
    identity: IdentityResponse
    token: str
