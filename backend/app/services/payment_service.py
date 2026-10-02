"""Abstraction over Bitcoin wallet connection and zap/support payments.

MOCK: no real Lightning node, Cashu mint, or on-chain wallet is involved.
Balances and transactions live in the prototype database and are updated
directly by this service. A real implementation would swap this module for
one backed by e.g. NWC (Nostr Wallet Connect) or a Lightning node RPC —
callers (routers) only ever see `WalletAccount` / `Transaction` rows, so the
swap doesn't touch the rest of the app.

Security note: this service never receives or stores a private key, seed
phrase, or Lightning node credential. `public_address` is exactly that —
public.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.wallet import Transaction, TransactionDirection, TransactionStatus, WalletAccount


class PaymentService:
    def get_or_create_wallet(self, db: Session, identity_id: str) -> WalletAccount:
        wallet = db.query(WalletAccount).filter_by(identity_id=identity_id).one_or_none()
        if wallet is None:
            wallet = WalletAccount(identity_id=identity_id)
            db.add(wallet)
            db.commit()
            db.refresh(wallet)
        return wallet

    def connect(self, db: Session, identity_id: str, public_address: str) -> WalletAccount:
        wallet = self.get_or_create_wallet(db, identity_id)
        wallet.connected = True
        wallet.public_address = public_address
        wallet.connected_at = datetime.utcnow()
        db.commit()
        db.refresh(wallet)
        return wallet

    def disconnect(self, db: Session, identity_id: str) -> WalletAccount:
        wallet = self.get_or_create_wallet(db, identity_id)
        wallet.connected = False
        wallet.public_address = ""
        db.commit()
        db.refresh(wallet)
        return wallet

    def list_transactions(self, db: Session, identity_id: str) -> list[Transaction]:
        wallet = self.get_or_create_wallet(db, identity_id)
        return (
            db.query(Transaction)
            .filter_by(wallet_id=wallet.id)
            .order_by(Transaction.created_at.desc())
            .all()
        )

    def mock_withdraw(self, db: Session, identity_id: str, amount_sats: int, memo: str) -> Transaction:
        wallet = self.get_or_create_wallet(db, identity_id)
        if not wallet.connected:
            raise ValueError("Wallet is not connected")
        if amount_sats > wallet.balance_sats:
            raise ValueError("Amount exceeds available balance")
        tx = Transaction(
            wallet_id=wallet.id,
            direction=TransactionDirection.OUTGOING,
            amount_sats=amount_sats,
            status=TransactionStatus.PENDING,
            memo=memo,
            counterparty_label="Withdrawal",
        )
        wallet.balance_sats -= amount_sats
        db.add(tx)
        db.commit()
        db.refresh(tx)
        return tx

    def mock_zap(
        self, db: Session, identity_id: str, amount_sats: int, memo: str, from_label: str
    ) -> Transaction:
        wallet = self.get_or_create_wallet(db, identity_id)
        if not wallet.connected:
            raise ValueError("Wallet is not connected")
        tx = Transaction(
            wallet_id=wallet.id,
            direction=TransactionDirection.INCOMING,
            amount_sats=amount_sats,
            status=TransactionStatus.SUCCESS,
            memo=memo,
            counterparty_label=from_label,
        )
        wallet.balance_sats += amount_sats
        db.add(tx)
        db.commit()
        db.refresh(tx)
        return tx


_service = PaymentService()


def get_payment_service() -> PaymentService:
    return _service
