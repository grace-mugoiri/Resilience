import asyncio
import json

import pytest

from app.nostr.events import first_tag, pubkey_of, sign_event
from app.nwc.client import NwcClient, NwcCredentials, NwcTransportError
from app.nwc.crypto import nip04_decrypt, nip04_encrypt

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


WALLET_SECRET = "33" * 32


class LegacyWalletSocket:
    """One relay connection to a NIP-04 wallet that publishes no info event."""

    def __init__(self) -> None:
        self.sent: list[list] = []
        self.inbox: asyncio.Queue = asyncio.Queue()
        self.closed = False

    async def send(self, raw: str) -> None:
        message = json.loads(raw)
        self.sent.append(message)
        if message[0] == "REQ":
            await self.inbox.put(json.dumps(["EOSE", message[1]]))
            self.subscription = message[1]
        elif message[0] == "EVENT":
            request = message[1]
            assert nip04_decrypt(request["content"], WALLET_SECRET, request["pubkey"])
            body = json.dumps({"result_type": "get_info", "result": {"alias": "legacy"}})
            response = sign_event(
                WALLET_SECRET,
                23195,
                [["p", request["pubkey"]], ["e", request["id"]]],
                nip04_encrypt(body, WALLET_SECRET, request["pubkey"]),
            )
            await self.inbox.put(json.dumps(["EVENT", self.subscription, response]))

    async def close(self) -> None:
        self.closed = True

    def __aiter__(self):
        return self

    async def __anext__(self) -> str:
        return await self.inbox.get()


def test_request_reuses_one_connection_and_sends_no_expiration_tag():
    socket = LegacyWalletSocket()
    client = NwcClient(timeout_seconds=2)
    opened: list[str] = []

    async def connect(relay):
        opened.append(relay)
        return socket

    client._connect = connect
    credentials = NwcCredentials(pubkey_of(WALLET_SECRET), "11" * 32, ["wss://relay.example"])

    assert asyncio.run(client.request(credentials, "get_info")) == {"alias": "legacy"}
    request = next(message[1] for message in socket.sent if message[0] == "EVENT")
    assert first_tag(request, "expiration") is None
    assert first_tag(request, "encryption") is None
    assert opened == ["wss://relay.example"]
    assert socket.closed
