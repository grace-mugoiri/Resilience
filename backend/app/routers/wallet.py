from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.identity import Identity
from app.schemas.wallet import (
    MockWithdrawRequest,
    MockZapRequest,
    TransactionResponse,
    WalletConnectRequest,
    WalletResponse,
)
from app.security import get_current_identity
from app.services.payment_service import PaymentService, get_payment_service

router = APIRouter(prefix="/api/wallet", tags=["wallet"])


@router.get("", response_model=WalletResponse)
def get_wallet(
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
    payments: PaymentService = Depends(get_payment_service),
):
    wallet = payments.get_or_create_wallet(db, current.id)
    return wallet


@router.post("/connect", response_model=WalletResponse)
def connect_wallet(
    payload: WalletConnectRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
    payments: PaymentService = Depends(get_payment_service),
):
    return payments.connect(db, current.id, payload.public_address)


@router.post("/disconnect", response_model=WalletResponse)
def disconnect_wallet(
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
    payments: PaymentService = Depends(get_payment_service),
):
    return payments.disconnect(db, current.id)


@router.get("/transactions", response_model=list[TransactionResponse])
def list_transactions(
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
    payments: PaymentService = Depends(get_payment_service),
):
    return payments.list_transactions(db, current.id)


@router.post("/zap/mock", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def mock_zap(
    payload: MockZapRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
    payments: PaymentService = Depends(get_payment_service),
):
    try:
        return payments.mock_zap(db, current.id, payload.amount_sats, payload.memo, payload.from_label)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.post("/withdraw/mock", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def mock_withdraw(
    payload: MockWithdrawRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
    payments: PaymentService = Depends(get_payment_service),
):
    try:
        return payments.mock_withdraw(db, current.id, payload.amount_sats, f"Withdrawal to {payload.destination}")
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
