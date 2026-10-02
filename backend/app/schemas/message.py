from datetime import datetime

from pydantic import BaseModel, Field


class ConversationResponse(BaseModel):
    id: str
    counterpart_identity_id: str
    counterpart_pseudonym: str
    last_message_preview: str = ""
    last_message_at: datetime | None = None

    model_config = {"from_attributes": True}


class DirectMessageCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    client_message_id: str = Field(min_length=1, max_length=64)


class DirectMessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_identity_id: str
    body: str
    client_message_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class StartConversationRequest(BaseModel):
    counterpart_identity_id: str
