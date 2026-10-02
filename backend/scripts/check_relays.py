"""Live NIP-42 and admission-policy smoke test for both local relays."""

import asyncio
import json
import sys
import time
from pathlib import Path

import websockets

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.nostr.events import pubkey_of, sign_event  # noqa: E402

SENDER_SECRET = "71" * 32
WRAPPER_SECRET = "72" * 32
RECIPIENT = pubkey_of("73" * 32)


async def receive_type(socket, expected: str) -> list:
    for _ in range(10):
        message = json.loads(await asyncio.wait_for(socket.recv(), timeout=5))
        if message[0] == expected:
            return message
    raise RuntimeError(f"relay did not return {expected}")


async def check(url: str) -> None:
    async with websockets.connect(url) as socket:
        challenge_message = await receive_type(socket, "AUTH")
        challenge = challenge_message[1]
        relay_tag = url if url.endswith("/") else url + "/"
        auth = sign_event(
            SENDER_SECRET,
            22242,
            [["relay", relay_tag], ["challenge", challenge]],
            "",
        )
        await socket.send(json.dumps(["AUTH", auth]))
        auth_result = await receive_type(socket, "OK")
        if auth_result[1] != auth["id"] or not auth_result[2]:
            raise RuntimeError(f"NIP-42 failed on {url}: {auth_result}")

        now = int(time.time())
        guest = sign_event(
            WRAPPER_SECRET,
            21059,
            [["p", RECIPIENT], ["expiration", str(now + 60)]],
            "ciphertext-only-test-payload",
        )
        await socket.send(json.dumps(["EVENT", guest]))
        guest_result = await receive_type(socket, "OK")
        if guest_result[1] != guest["id"] or not guest_result[2]:
            raise RuntimeError(f"ephemeral guest wrap was rejected on {url}: {guest_result}")

        stored = sign_event(
            WRAPPER_SECRET,
            1059,
            [["p", RECIPIENT], ["expiration", str(now + 3600)]],
            "ciphertext-only-test-payload",
        )
        await socket.send(json.dumps(["EVENT", stored]))
        stored_result = await receive_type(socket, "OK")
        if stored_result[1] != stored["id"] or stored_result[2]:
            raise RuntimeError(f"unauthorized stored wrap was not rejected on {url}")
        print(f"{url}: NIP-42, guest retention, and relationship policy passed")


async def main() -> None:
    await asyncio.gather(check("ws://localhost:7777"), check("ws://localhost:7778"))


if __name__ == "__main__":
    asyncio.run(main())
