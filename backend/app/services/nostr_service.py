"""Abstraction over the decentralized identity/messaging layer.

MOCK ABSTRACTION: Resilience's real architecture intends to use Nostr for
pseudonymous identity (keypairs) and censorship-resistant messaging (relays,
NIP-04/NIP-17 DMs). Building real relay infrastructure is out of scope for
this hackathon prototype.

`NostrService` defines the interface the rest of the app depends on. The
frontend and other backend services never need to know whether calls are
served by `MockNostrService` or a future `RelayNostrService` — only this
file changes when real Nostr wiring lands.
"""

from __future__ import annotations

import hashlib
import random
import time
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class NostrKeypair:
    npub: str
    nsec_hint: str  # never a real private key — a display-only mock hint


@dataclass
class NostrEvent:
    id: str
    kind: int
    pubkey: str
    content: str
    created_at: float = field(default_factory=time.time)


@dataclass
class RelayStatus:
    url: str
    connected: bool
    latency_ms: int


class NostrService(Protocol):
    def generate_keypair(self, seed: str) -> NostrKeypair: ...

    def publish_event(self, pubkey: str, kind: int, content: str) -> NostrEvent: ...

    def fetch_events(self, pubkey: str, kind: int | None = None) -> list[NostrEvent]: ...

    def relay_status(self) -> list[RelayStatus]: ...


class MockNostrService:
    """Deterministic, in-memory stand-in for a Nostr relay network."""

    def __init__(self) -> None:
        self._events: list[NostrEvent] = []
        self._relays = ["wss://relay.resilience.mock/1", "wss://relay.resilience.mock/2"]

    def generate_keypair(self, seed: str) -> NostrKeypair:
        digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
        return NostrKeypair(npub=f"npub1{digest[:56]}", nsec_hint=f"nsec1{digest[-8:]}…(mock, never real)")

    def publish_event(self, pubkey: str, kind: int, content: str) -> NostrEvent:
        event = NostrEvent(id=hashlib.sha256(f"{pubkey}{kind}{content}{time.time()}".encode()).hexdigest()[:32],
                            kind=kind, pubkey=pubkey, content=content)
        self._events.append(event)
        return event

    def fetch_events(self, pubkey: str, kind: int | None = None) -> list[NostrEvent]:
        return [e for e in self._events if e.pubkey == pubkey and (kind is None or e.kind == kind)]

    def relay_status(self) -> list[RelayStatus]:
        return [RelayStatus(url=url, connected=True, latency_ms=random.randint(40, 220)) for url in self._relays]


_service = MockNostrService()


def get_nostr_service() -> NostrService:
    return _service
