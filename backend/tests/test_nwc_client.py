import asyncio

import pytest

from app.nwc.client import NwcClient, NwcCredentials, NwcTransportError

CREDENTIALS = NwcCredentials("22" * 32, "11" * 32, ["wss://relay.example"])


def test_encryption_negotiation_prefers_nip44():
    client = NwcClient()

    async def info(_relay, _credentials):
        return {"tags": [["encryption", "nip44_v2 nip04"]]}

    client._relay_info = info
    assert asyncio.run(client._negotiate_encryption(CREDENTIALS)) == "nip44_v2"


def test_encryption_negotiation_defaults_to_nip04_for_legacy_wallet():
    client = NwcClient()

    async def info(_relay, _credentials):
        return None

    client._relay_info = info
    assert asyncio.run(client._negotiate_encryption(CREDENTIALS)) == "nip04"


def test_encryption_negotiation_rejects_unknown_modes():
    client = NwcClient()

    async def info(_relay, _credentials):
        return {"tags": [["encryption", "future_cipher"]]}

    client._relay_info = info
    with pytest.raises(NwcTransportError, match="supported encryption"):
        asyncio.run(client._negotiate_encryption(CREDENTIALS))
