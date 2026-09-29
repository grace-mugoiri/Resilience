import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import Organization


class OrgApplication(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=120)
    domain: str = Field(min_length=3, max_length=253)


class OrgOut(BaseModel):
    id: uuid.UUID
    name: str
    domain: str
    nostr_pubkey: str
    nip05: str  # what a client checks itself: _@<domain>
    status: str
    nip05_verified_at: datetime | None

    @classmethod
    def of(cls, org: Organization) -> "OrgOut":
        return cls(
            id=org.id,
            name=org.name,
            domain=org.domain,
            nostr_pubkey=org.nostr_pubkey,
            nip05=f"_@{org.domain}",
            status=org.status,
            nip05_verified_at=org.nip05_verified_at,
        )


class CounsellorsOut(BaseModel):
    org_id: uuid.UUID
    # The signed roster itself, so the client can verify the organisation's signature
    # instead of trusting this server.
    roster: dict | None
    counsellors: list[str]
