import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import Organization


class OrgApplication(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=120)
    domain: str = Field(min_length=3, max_length=253)
    # This consent is deliberately required: public kind-30000 p tags reveal the
    # organization-to-counselor association. Private discovery is not in this MVP.
    directory_visibility: Literal["public"]


class OrgOut(BaseModel):
    id: uuid.UUID
    name: str
    domain: str
    nostr_pubkey: str
    nip05: str  # what a client checks itself: _@<domain>
    status: str
    directory_visibility: Literal["public"]
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
            directory_visibility=org.directory_visibility,
            nip05_verified_at=org.nip05_verified_at,
        )


CounsellorStatus = Literal["verified", "expired", "removed"]


class CounsellorProfileOut(BaseModel):
    """What the counsellor says about herself, read from her signed kind 0 event."""

    name: str
    about: str | None
    specialties: list[str]
    languages: list[str]
    response_time: str | None


class CounsellorOut(BaseModel):
    pubkey: str
    # verified: on the organisation's newest roster, which has not expired.
    # expired:  still on the newest roster, but the organisation let it lapse.
    # removed:  left off the organisation's newest roster.
    status: CounsellorStatus
    verified_until: datetime | None  # the roster's expiration; null once removed
    profile: CounsellorProfileOut | None
    # The signed kind 0 event itself, so the client can check the counsellor's signature.
    profile_event: dict | None
    available: bool = True
    working_hours: str | None = None
    availability_event: dict | None = None


class CounsellorsOut(BaseModel):
    organization: OrgOut
    # The signed roster itself, so the client can verify the organisation's signature
    # instead of trusting this server.
    roster: dict | None
    # Root-signed event authorizing the key that signed `roster`.
    roster_key_authorization: dict | None
    # Root-signed cancellation of the roster signer, if it has been revoked.
    roster_key_revocation: dict | None
    counsellors: list[CounsellorOut]


class OperationalKeyOut(BaseModel):
    pubkey: str
    scopes: list[str]
    valid_from: datetime
    expires_at: datetime
    revoked_at: datetime | None
    authorization_event: dict
    revocation_event: dict | None


class OrganizationAccessOut(BaseModel):
    organization: OrgOut
    actor: Literal["root", "operational"]
    operational_key: OperationalKeyOut | None


class EnrollmentCounts(BaseModel):
    draft: int = 0
    under_review: int = 0
    more_information: int = 0
    approved: int = 0
    rejected: int = 0


class CounsellorCounts(BaseModel):
    verified: int = 0
    expired: int = 0
    removed: int = 0


class OrganizationDashboardOut(BaseModel):
    organization: OrgOut
    active_invites: int
    enrollments: EnrollmentCounts
    counsellors: CounsellorCounts
