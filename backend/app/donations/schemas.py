import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DonationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_sat: int = Field(gt=0)


class DonationOut(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    organization_name: str
    amount_sat: int
    state: Literal["PENDING", "PAID", "EXPIRED"]
    invoice: str | None
    invoice_expires_at: datetime
    created_at: datetime
    paid_at: datetime | None
