"""NIP-47 client over one or more Nostr relays with deterministic-event failover."""

import asyncio
import json
import time
import uuid
from dataclasses import dataclass
from typing import Any

import websockets

from app.nostr.events import first_tag, sign_event, verify_event
from app.nwc.crypto import (
    Nip04Error,
    Nip44Error,
    decrypt,
    encrypt,
    nip04_decrypt,
    nip04_encrypt,
)


class NwcError(RuntimeError):
    pass


class NwcTransportError(NwcError):
    """The outcome is unknown; callers must reconcile instead of retrying a payment."""


class NwcRemoteError(NwcError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"wallet returned {code}: {message}")
        self.code = code


@dataclass(frozen=True)
class NwcCredentials:
    wallet_pubkey: str
    client_secret: str
    relays: list[str]


class NwcClient:
    def __init__(
        self,
        timeout_seconds: float = 12.0,
        relay_origin: str | None = None,
        user_agent_header: str = "Resilience/0.1 NWC",
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.relay_origin = relay_origin
        self.user_agent_header = user_agent_header

    def _connect(self, relay: str):
        # Several public Nostr relays reject Python's default permessage-deflate websocket
        # extension during the handshake. Nostr events are already compact and NWC payloads are
        # tiny, so disabling compression makes relay compatibility better without losing much.
        return websockets.connect(
            relay,
            origin=self.relay_origin,
            user_agent_header=self.user_agent_header,
            compression=None,
            open_timeout=self.timeout_seconds,
            close_timeout=2,
            max_size=128 * 1024,
            ping_interval=20,
        )

    async def request(
        self, credentials: NwcCredentials, method: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        encryption = await self._negotiate_encryption(credentials)
        now = int(time.time())
        content = json.dumps(
            {"method": method, "params": params or {}}, separators=(",", ":"), sort_keys=True
        )
        encrypted = (
            encrypt(content, credentials.client_secret, credentials.wallet_pubkey)
            if encryption == "nip44_v2"
            else nip04_encrypt(content, credentials.client_secret, credentials.wallet_pubkey)
        )
        tags = [["p", credentials.wallet_pubkey]]
        if encryption == "nip44_v2":
            tags.append(["encryption", encryption])
        tags.append(["expiration", str(now + max(15, int(self.timeout_seconds) + 5))])
        event = sign_event(
            credentials.client_secret,
            23194,
            tags,
            encrypted,
            created_at=now,
        )
        tasks = [
            asyncio.create_task(
                self._relay_roundtrip(relay, credentials, event, method, encryption)
            )
            for relay in credentials.relays
        ]
        errors: list[str] = []
        try:
            for completed in asyncio.as_completed(tasks, timeout=self.timeout_seconds + 2):
                try:
                    return await completed
                except NwcRemoteError:
                    raise
                except Exception as exc:  # noqa: BLE001 - fail over to the next configured relay
                    errors.append(str(exc) or type(exc).__name__)
        except TimeoutError:
            errors.append("all relays timed out")
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
        raise NwcTransportError("NWC request failed across all relays: " + "; ".join(errors))

    async def _negotiate_encryption(self, credentials: NwcCredentials) -> str:
        """Read kind 13194 before requesting, defaulting to legacy NIP-04 when absent."""
        discovered = await asyncio.gather(
            *(self._relay_info(relay, credentials) for relay in credentials.relays),
            return_exceptions=True,
        )
        modes: set[str] = set()
        found_info = False
        for value in discovered:
            if not isinstance(value, dict):
                continue
            found_info = True
            advertised = first_tag(value, "encryption")
            if advertised:
                modes.update(advertised.split())
            else:
                modes.add("nip04")
        if "nip44_v2" in modes:
            return "nip44_v2"
        if "nip04" in modes or not found_info:
            return "nip04"
        raise NwcTransportError(
            "wallet info event does not advertise a supported encryption method"
        )

    async def _relay_info(self, relay: str, credentials: NwcCredentials) -> dict[str, Any] | None:
        subscription = f"nwc-info-{uuid.uuid4().hex}"
        event_filter = {
            "kinds": [13194],
            "authors": [credentials.wallet_pubkey],
            "limit": 1,
        }
        try:
            async with asyncio.timeout(self.timeout_seconds):
                async with self._connect(relay) as socket:
                    await socket.send(json.dumps(["REQ", subscription, event_filter]))
                    auth_event_id: str | None = None
                    async for raw in socket:
                        try:
                            message = json.loads(raw)
                        except (TypeError, json.JSONDecodeError):
                            continue
                        if not isinstance(message, list) or not message:
                            continue
                        if message[0] == "AUTH" and len(message) == 2:
                            auth = sign_event(
                                credentials.client_secret,
                                22242,
                                [["relay", relay], ["challenge", str(message[1])]],
                                "",
                            )
                            auth_event_id = auth["id"]
                            await socket.send(json.dumps(["AUTH", auth]))
                            continue
                        if (
                            message[0] == "OK"
                            and len(message) >= 3
                            and message[1] == auth_event_id
                            and message[2] is True
                        ):
                            await socket.send(json.dumps(["REQ", subscription, event_filter]))
                            continue
                        if message[0] == "EOSE" and message[1:2] == [subscription]:
                            return None
                        if message[0] != "EVENT" or len(message) != 3:
                            continue
                        if message[1] != subscription:
                            continue
                        info = message[2]
                        if (
                            verify_event(info)
                            and info["kind"] == 13194
                            and info["pubkey"] == credentials.wallet_pubkey
                        ):
                            await socket.send(json.dumps(["CLOSE", subscription]))
                            return info
        except TimeoutError:
            return None
        return None

    async def _relay_roundtrip(
        self,
        relay: str,
        credentials: NwcCredentials,
        event: dict,
        method: str,
        encryption: str,
    ) -> dict[str, Any]:
        subscription = f"nwc-{uuid.uuid4().hex}"
        event_filter = {
            "kinds": [23195],
            "authors": [credentials.wallet_pubkey],
            "#p": [event["pubkey"]],
            "#e": [event["id"]],
            "since": event["created_at"] - 5,
            "limit": 1,
        }
        try:
            async with asyncio.timeout(self.timeout_seconds):
                async with self._connect(relay) as socket:
                    await socket.send(json.dumps(["REQ", subscription, event_filter]))
                    await socket.send(json.dumps(["EVENT", event]))
                    auth_event_id: str | None = None
                    async for raw in socket:
                        try:
                            message = json.loads(raw)
                        except (TypeError, json.JSONDecodeError):
                            continue
                        if not isinstance(message, list) or not message:
                            continue
                        if message[0] == "AUTH" and len(message) == 2:
                            auth = sign_event(
                                credentials.client_secret,
                                22242,
                                [["relay", relay], ["challenge", str(message[1])]],
                                "",
                            )
                            auth_event_id = auth["id"]
                            await socket.send(json.dumps(["AUTH", auth]))
                            continue
                        if message[0] == "OK" and len(message) >= 3:
                            if message[1] == auth_event_id and message[2] is True:
                                await socket.send(json.dumps(["REQ", subscription, event_filter]))
                                await socket.send(json.dumps(["EVENT", event]))
                            elif message[1] == event["id"] and message[2] is False:
                                detail = message[3] if len(message) > 3 else "no reason supplied"
                                raise NwcTransportError(
                                    f"relay rejected NWC request on {relay}: {detail}"
                                )
                            continue
                        if message[0] != "EVENT" or len(message) != 3 or message[1] != subscription:
                            continue
                        response = message[2]
                        if (
                            not verify_event(response)
                            or response["kind"] != 23195
                            or response["pubkey"] != credentials.wallet_pubkey
                            or first_tag(response, "p") != event["pubkey"]
                            or first_tag(response, "e") != event["id"]
                        ):
                            continue
                        try:
                            plaintext = (
                                decrypt(
                                    response["content"],
                                    credentials.client_secret,
                                    credentials.wallet_pubkey,
                                )
                                if encryption == "nip44_v2"
                                else nip04_decrypt(
                                    response["content"],
                                    credentials.client_secret,
                                    credentials.wallet_pubkey,
                                )
                            )
                            payload = json.loads(plaintext)
                        except (Nip04Error, Nip44Error, json.JSONDecodeError) as exc:
                            raise NwcTransportError(
                                f"wallet response from {relay} could not be decrypted"
                            ) from exc
                        if not isinstance(payload, dict) or payload.get("result_type") != method:
                            raise NwcTransportError(
                                f"wallet response type from {relay} does not match request"
                            )
                        error = payload.get("error")
                        if error:
                            raise NwcRemoteError(
                                str(error.get("code", "OTHER")),
                                str(error.get("message", "wallet request failed")),
                            )
                        result = payload.get("result")
                        if not isinstance(result, dict):
                            raise NwcTransportError(f"wallet response from {relay} has no result")
                        await socket.send(json.dumps(["CLOSE", subscription]))
                        return result
        except TimeoutError as exc:
            raise NwcTransportError(f"NWC response timed out on {relay}") from exc
        raise NwcTransportError(f"NWC connection closed without a response on {relay}")


def get_nwc_client() -> NwcClient:
    from app.settings import get_settings

    settings = get_settings()
    return NwcClient(
        settings.nwc_timeout_seconds,
        settings.nwc_relay_origin,
        settings.nwc_user_agent,
    )
