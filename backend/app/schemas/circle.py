from datetime import datetime

from pydantic import BaseModel, Field


class CircleMemberAddRequest(BaseModel):
    member_identity_id: str
    label: str = Field(default="", max_length=60)


class CircleMemberResponse(BaseModel):
    id: str
    member_identity_id: str
    pseudonym: str
    label: str
    added_at: datetime

    model_config = {"from_attributes": True}
