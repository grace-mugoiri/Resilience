from datetime import datetime

from pydantic import BaseModel, Field

from app.models.wallet import TransactionDirection, TransactionStatus


class WalletConnectRequest(BaseModel):
    public_address: str = Field(min_length=4, max_length=200)


class WalletResponse(BaseModel):
    connected: bool
    public_address: str
    balance_sats: int
    connected_at: datetime | None

    model_config = {"from_attributes": True}


class TransactionResponse(BaseModel):
    id: str
    direction: TransactionDirection
    amount_sats: int
    status: TransactionStatus
    memo: str
    counterparty_label: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MockZapRequest(BaseModel):
    amount_sats: int = Field(gt=0, le=1_000_000)
    memo: str = Field(default="", max_length=200)
    from_label: str = Field(default="A supporter", max_length=80)


class MockWithdrawRequest(BaseModel):
    amount_sats: int = Field(gt=0, le=1_000_000)
    destination: str = Field(min_length=3, max_length=32, description="Mock M-Pesa number or payout handle")
