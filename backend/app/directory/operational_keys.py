"""Root-signed authorization and emergency revocation for organization operational keys."""

from dataclasses import dataclass

from app.nostr.events import first_tag, has_nul, verify_event

AUTHORIZATION_KIND = 30382
REVOCATION_KIND = 30383
AUTHORIZATION_D_PREFIX = "resilience:org-operations:"
REVOCATION_D_PREFIX = "resilience:org-operations-revocation:"
ALLOWED_SCOPES = frozenset({"roster"})
MAX_CLOCK_SKEW_SECONDS = 600
MAX_AUTHORIZATION_SECONDS = 366 * 24 * 60 * 60
_HEX = frozenset("0123456789abcdef")


class OperationalKeyError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class ParsedAuthorization:
    event_id: str
    operational_pubkey: str
    valid_from: int
    expires_at: int
    scopes: list[str]


@dataclass(frozen=True)
class ParsedRevocation:
    event_id: str
    operational_pubkey: str
    revoked_at: int


def _single_tag(event: dict, name: str) -> str:
    values = [tag[1] for tag in event["tags"] if len(tag) >= 2 and tag[0] == name]
    if len(values) != 1:
        raise OperationalKeyError(400, f"event needs exactly one {name} tag")
    return values[0]


def _base(event: object, root_pubkey: str, kind: int, now: int) -> dict:
    if not verify_event(event):
        raise OperationalKeyError(400, "not a valid signed Nostr event")
    assert isinstance(event, dict)
    if has_nul(event):
        raise OperationalKeyError(400, "event must not contain NUL characters")
    if event["kind"] != kind:
        raise OperationalKeyError(400, f"event must be kind {kind}")
    if event["pubkey"] != root_pubkey:
        raise OperationalKeyError(403, "event must be signed by the organization root key")
    if event["created_at"] > now + MAX_CLOCK_SKEW_SECONDS:
        raise OperationalKeyError(400, "event is dated in the future")
    return event


def parse_authorization(event: object, root_pubkey: str, now: int) -> ParsedAuthorization:
    parsed = _base(event, root_pubkey, AUTHORIZATION_KIND, now)
    operational_pubkey = _single_tag(parsed, "p")
    if len(operational_pubkey) != 64 or not set(operational_pubkey) <= _HEX:
        raise OperationalKeyError(400, "p tag must contain the operational hex pubkey")
    if first_tag(parsed, "d") != AUTHORIZATION_D_PREFIX + operational_pubkey:
        raise OperationalKeyError(400, "authorization has an invalid d tag")
    expiration = _single_tag(parsed, "expiration")
    valid_from = first_tag(parsed, "valid_from") or str(parsed["created_at"])
    if not expiration.isdigit() or not valid_from.isdigit():
        raise OperationalKeyError(400, "authorization timestamps must be unix seconds")
    expires_at = int(expiration)
    starts_at = int(valid_from)
    if starts_at > now + MAX_CLOCK_SKEW_SECONDS or expires_at <= now or starts_at >= expires_at:
        raise OperationalKeyError(400, "authorization validity window is invalid")
    if expires_at - starts_at > MAX_AUTHORIZATION_SECONDS:
        raise OperationalKeyError(400, "authorization may last at most 366 days")
    scopes = sorted({tag[1] for tag in parsed["tags"] if len(tag) >= 2 and tag[0] == "scope"})
    if not scopes or not set(scopes) <= ALLOWED_SCOPES:
        raise OperationalKeyError(400, "authorization has invalid or missing scopes")
    return ParsedAuthorization(parsed["id"], operational_pubkey, starts_at, expires_at, scopes)


def parse_revocation(event: object, root_pubkey: str, now: int) -> ParsedRevocation:
    parsed = _base(event, root_pubkey, REVOCATION_KIND, now)
    operational_pubkey = _single_tag(parsed, "p")
    if len(operational_pubkey) != 64 or not set(operational_pubkey) <= _HEX:
        raise OperationalKeyError(400, "p tag must contain the operational hex pubkey")
    if first_tag(parsed, "d") != REVOCATION_D_PREFIX + operational_pubkey:
        raise OperationalKeyError(400, "revocation has an invalid d tag")
    return ParsedRevocation(parsed["id"], operational_pubkey, parsed["created_at"])
