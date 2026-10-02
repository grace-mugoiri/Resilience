from datetime import datetime

from pydantic import BaseModel, Field


class GroupResponse(BaseModel):
    id: str
    name: str
    description: str
    topic: str
    member_count: int
    facilitator_name: str
    requires_approval: bool
    rules: list[str]
    is_member: bool = False
    is_pending: bool = False

    model_config = {"from_attributes": True}


class GroupJoinResponse(BaseModel):
    group_id: str
    joined: bool
    pending: bool
    member_count: int


class GroupMessageCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    client_message_id: str = Field(min_length=1, max_length=64)


class GroupMessageResponse(BaseModel):
    id: str
    group_id: str
    sender_identity_id: str
    sender_pseudonym: str
    body: str
    client_message_id: str
    created_at: datetime

    model_config = {"from_attributes": True}
