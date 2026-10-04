"""Persistence boundary for encrypted NWC connections."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.models import OrganizationWalletConnection
from app.nwc.client import NwcCredentials
from app.nwc.connection import NwcConnection, open_secret, seal_secret
from app.nwc.schemas import WalletConnectionOut
from app.settings import Settings


def get_connection(db: Session, org_id: uuid.UUID) -> OrganizationWalletConnection:
    connection = db.get(OrganizationWalletConnection, org_id)
    if connection is None:
        raise LookupError("organization has no connected Lightning wallet")
    return connection


def credentials(
    db: Session, settings: Settings, org_id: uuid.UUID
) -> tuple[OrganizationWalletConnection, NwcCredentials]:
    connection = get_connection(db, org_id)
    return connection, NwcCredentials(
        wallet_pubkey=connection.wallet_pubkey,
        client_secret=open_secret(settings, org_id, connection.encrypted_client_secret),
        relays=list(connection.relay_urls),
    )


def store_connection(
    db: Session,
    settings: Settings,
    org_id: uuid.UUID,
    parsed: NwcConnection,
    info: dict,
) -> OrganizationWalletConnection:
    connection = db.get(OrganizationWalletConnection, org_id)
    if connection is None:
        connection = OrganizationWalletConnection(org_id=org_id)
        db.add(connection)
    connection.wallet_pubkey = parsed.wallet_pubkey
    connection.client_pubkey = parsed.client_pubkey
    connection.encrypted_client_secret = seal_secret(settings, org_id, parsed.client_secret)
    connection.relay_urls = parsed.relays
    connection.lud16 = parsed.lud16
    connection.methods = sorted(set(info.get("methods", [])))
    connection.network = info.get("network")
    connection.alias = str(info.get("alias"))[:200] if info.get("alias") else None
    connection.last_checked_at = datetime.now(UTC)
    db.flush()
    return connection


def to_out(connection: OrganizationWalletConnection) -> WalletConnectionOut:
    return WalletConnectionOut(
        org_id=connection.org_id,
        wallet_pubkey=connection.wallet_pubkey,
        client_pubkey=connection.client_pubkey,
        relay_urls=list(connection.relay_urls),
        lud16=connection.lud16,
        methods=list(connection.methods),
        network=connection.network,
        alias=connection.alias,
        connected_at=connection.connected_at,
        last_checked_at=connection.last_checked_at,
    )
