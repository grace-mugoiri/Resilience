from enum import Enum

from pydantic import BaseModel, Field


class QueuedMessageTarget(str, Enum):
    GROUP = "group"
    DIRECT = "direct"


class QueuedMessage(BaseModel):
    client_message_id: str = Field(min_length=1, max_length=64)
    target: QueuedMessageTarget
    target_id: str  # group_id or conversation_id
    body: str = Field(min_length=1, max_length=4000)


class SyncRequest(BaseModel):
    messages: list[QueuedMessage]


class SyncResultItem(BaseModel):
    client_message_id: str
    accepted: bool
    server_id: str | None = None
    reason: str | None = None


class SyncResponse(BaseModel):
    results: list[SyncResultItem]
    synced_at: str
