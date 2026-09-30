from pydantic import BaseModel

class NostrEvent(BaseModel):
    id: str
    pubkey: str
    created_at: int
    kind: int
    tags: list[list[str]]
    content: str
    sig: str
