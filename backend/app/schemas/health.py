from datetime import datetime

from pydantic import BaseModel, Field


class HealthRecordCreateRequest(BaseModel):
    record_type: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(default="", max_length=4000)


class ActiveShare(BaseModel):
    share_id: str
    counselor_identity_id: str
    pseudonym: str


class HealthRecordResponse(BaseModel):
    id: str
    record_type: str
    title: str
    body: str
    created_at: datetime
    shared_with: list[ActiveShare] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class HealthShareCreateRequest(BaseModel):
    record_id: str
    counselor_identity_id: str


class HealthShareResponse(BaseModel):
    id: str
    record_id: str
    shared_with_identity_id: str
    granted_at: datetime
    revoked_at: datetime | None

    model_config = {"from_attributes": True}
