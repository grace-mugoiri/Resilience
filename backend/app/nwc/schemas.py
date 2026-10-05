import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WalletConnectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    connection_uri: str = Field(min_length=80, max_length=4096)


class WalletConnectionOut(BaseModel):
    org_id: uuid.UUID
    wallet_pubkey: str
    client_pubkey: str
    relay_urls: list[str]
    lud16: str | None
    methods: list[str]
    network: str | None
    alias: str | None
    connected_at: datetime
    last_checked_at: datetime | None


class WalletBalanceOut(BaseModel):
    balance_msat: int
    balance_sat: int


class WalletInvoiceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount_sat: int = Field(gt=0, le=2_147_483_647)
    description: str = Field(default="Resilience payment", min_length=1, max_length=200)
    expiry_seconds: int = Field(default=600, ge=60, le=3600)


class WalletInvoiceOut(BaseModel):
    invoice: str
    payment_hash: str
    amount_sat: int
    expires_at: datetime
