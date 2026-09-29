"""An organisation's signed list of verified counsellors: a NIP-51 follow set
(kind 30000, d=verified-counsellors) with a NIP-40 expiration tag."""

from dataclasses import dataclass

from app.nostr.events import first_tag, verify_event

ROSTER_KIND = 30000
ROSTER_D_TAG = "verified-counsellors"
MAX_MEMBERS = 500
MAX_CLOCK_SKEW_SECONDS = 600
_HEX = frozenset("0123456789abcdef")


class RosterError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class ParsedRoster:
    event_id: str
    created_at: int
    expires_at: int
    members: list[str]


def parse_roster(event: object, org_pubkey: str, now: int) -> ParsedRoster:
    if not verify_event(event):
        raise RosterError(400, "not a valid signed Nostr event")
    assert isinstance(event, dict)
    if event["kind"] != ROSTER_KIND or first_tag(event, "d") != ROSTER_D_TAG:
        raise RosterError(400, f"roster must be kind {ROSTER_KIND} with d={ROSTER_D_TAG}")
    if event["pubkey"] != org_pubkey:
        raise RosterError(403, "roster must be signed by the organisation's own key")
    if event["created_at"] > now + MAX_CLOCK_SKEW_SECONDS:
        raise RosterError(400, "roster is dated in the future")

    expiration = first_tag(event, "expiration")
    if expiration is None or not expiration.isdigit():
        raise RosterError(400, "roster needs an expiration tag (unix seconds), see NIP-40")
    if int(expiration) <= now:
        raise RosterError(400, "roster has already expired")

    members: list[str] = []
    for tag in event["tags"]:
        if tag[0] != "p":
            continue
        key = tag[1] if len(tag) > 1 else ""
        if len(key) != 64 or not set(key) <= _HEX:
            raise RosterError(400, "every p tag must hold a 64-character lowercase hex pubkey")
        if key not in members:
            members.append(key)
    if len(members) > MAX_MEMBERS:
        raise RosterError(400, f"a roster may list at most {MAX_MEMBERS} counsellors")

    return ParsedRoster(event["id"], event["created_at"], int(expiration), members)
