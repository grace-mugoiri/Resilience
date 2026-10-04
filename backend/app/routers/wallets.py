"""Organization-controlled NIP-47 wallet connections; Resilience never holds wallet funds."""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.org import require_org_key, require_org_operation
from app.db.models import OrganizationWalletConnection
from app.db.session import get_db
from app.nwc.client import NwcClient, NwcCredentials, NwcError, get_nwc_client
from app.nwc.connection import NwcConnectionError, parse_connection_uri
from app.nwc.schemas import (
    WalletBalanceOut,
    WalletConnectIn,
    WalletConnectionOut,
    WalletInvoiceIn,
    WalletInvoiceOut,
)
from app.nwc.service import credentials, get_connection, store_connection, to_out
from app.payments.contracts import InvoiceDecodeError
from app.payments.invoice import parse_invoice
from app.settings import Settings, get_settings

router = APIRouter(prefix="/v1/orgs/{org_id}/wallet", tags=["wallets"])
Db = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
ClientDep = Annotated[NwcClient, Depends(get_nwc_client)]
WalletReader = Annotated[str, Depends(require_org_key("payments"))]
WalletConnector = Annotated[
    str, Depends(require_org_operation("payments", "wallet:connect:{org_id}"))
]
WalletDisconnector = Annotated[
    str, Depends(require_org_operation("payments", "wallet:disconnect:{org_id}"))
]
REQUIRED_METHODS = frozenset(
    {"get_info", "get_balance", "make_invoice", "lookup_invoice", "pay_invoice"}
)
NETWORKS = {"bc": "mainnet", "tb": "testnet", "tbs": "signet", "bcrt": "regtest"}


def wallet_error(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(404, str(exc))
    if isinstance(exc, (NwcConnectionError, InvoiceDecodeError)):
        return HTTPException(422, str(exc))
    if isinstance(exc, NwcError):
        return HTTPException(502, str(exc))
    return HTTPException(409, "wallet connection conflicts with an existing connection")


@router.put("", response_model=WalletConnectionOut)
async def connect_wallet(
    org_id: uuid.UUID,
    body: WalletConnectIn,
    _actor: WalletConnector,
    db: Db,
    settings: SettingsDep,
    client: ClientDep,
) -> WalletConnectionOut:
    try:
        parsed = parse_connection_uri(body.connection_uri, settings)
        info = await client.request(
            NwcCredentials(parsed.wallet_pubkey, parsed.client_secret, parsed.relays),
            "get_info",
        )
        methods = set(info.get("methods", []))
        missing = REQUIRED_METHODS - methods
        if missing:
            raise NwcConnectionError(
                "wallet connection is missing required methods: " + ", ".join(sorted(missing))
            )
        expected_network = NETWORKS[settings.lightning_network]
        if info.get("network") != expected_network:
            raise NwcConnectionError(
                "wallet is on "
                f"{info.get('network') or 'an unknown network'}, expected {expected_network}"
            )
        connection = store_connection(db, settings, org_id, parsed, info)
        db.commit()
        return to_out(connection)
    except (NwcConnectionError, NwcError, IntegrityError) as exc:
        db.rollback()
        raise wallet_error(exc) from exc


@router.get("", response_model=WalletConnectionOut)
def read_wallet(org_id: uuid.UUID, _actor: WalletReader, db: Db) -> WalletConnectionOut:
    try:
        return to_out(get_connection(db, org_id))
    except LookupError as exc:
        raise wallet_error(exc) from exc


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_wallet(org_id: uuid.UUID, _actor: WalletDisconnector, db: Db) -> Response:
    connection = db.get(OrganizationWalletConnection, org_id)
    if connection is not None:
        db.delete(connection)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/balance", response_model=WalletBalanceOut)
async def wallet_balance(
    org_id: uuid.UUID,
    _actor: WalletReader,
    db: Db,
    settings: SettingsDep,
    client: ClientDep,
) -> WalletBalanceOut:
    try:
        connection, secret = credentials(db, settings, org_id)
        result = await client.request(secret, "get_balance")
        balance = int(result["balance"])
        if balance < 0:
            raise ValueError
        connection.last_checked_at = datetime.now(UTC)
        db.commit()
        return WalletBalanceOut(balance_msat=balance, balance_sat=balance // 1000)
    except (LookupError, NwcError, KeyError, TypeError, ValueError) as exc:
        db.rollback()
        if isinstance(exc, (KeyError, TypeError, ValueError)):
            exc = NwcError("wallet returned an invalid balance")
        raise wallet_error(exc) from exc


@router.post("/invoices", response_model=WalletInvoiceOut)
async def make_wallet_invoice(
    org_id: uuid.UUID,
    body: WalletInvoiceIn,
    _actor: WalletReader,
    db: Db,
    settings: SettingsDep,
    client: ClientDep,
) -> WalletInvoiceOut:
    try:
        connection, secret = credentials(db, settings, org_id)
        result = await client.request(
            secret,
            "make_invoice",
            {
                "amount": body.amount_sat * 1000,
                "description": body.description,
                "expiry": body.expiry_seconds,
            },
        )
        invoice = str(result["invoice"])
        details = parse_invoice(invoice, settings.lightning_network)
        if details.amount_msat != body.amount_sat * 1000:
            raise NwcError("wallet returned an invoice with the wrong amount")
        connection.last_checked_at = datetime.now(UTC)
        db.commit()
        return WalletInvoiceOut(
            invoice=invoice,
            payment_hash=details.payment_hash,
            amount_sat=body.amount_sat,
            expires_at=datetime.fromtimestamp(details.expires_at, UTC),
        )
    except (LookupError, NwcError, InvoiceDecodeError, KeyError) as exc:
        db.rollback()
        raise wallet_error(exc) from exc
