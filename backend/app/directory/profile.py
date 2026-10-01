"""A counsellor's own public profile: a standard Nostr kind 0 event signed by her key.

The organisation's roster vouches for WHO is a counsellor. The profile is what the counsellor says
about herself: a name, a short bio, specialties, languages and how fast she usually replies.
`specialties`, `languages` and `response_time` are Resilience fields; other Nostr clients ignore
them. `picture` and `banner` are deliberately not returned: loading an image URL would tell that
image's host the survivor's IP address.
"""

import json
from dataclasses import dataclass

from app.directory.roster import MAX_CLOCK_SKEW_SECONDS
from app.nostr.events import has_nul, verify_event

PROFILE_KIND = 0
MAX_CONTENT_BYTES = 4096
MAX_TAGS = 20
MAX_NAME = 80
MAX_ABOUT = 500
MAX_LIST_ITEMS = 10
MAX_LIST_ITEM = 40
MAX_RESPONSE_TIME = 80


class ProfileError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class ProfileDetails:
    name: str
    about: str | None
    specialties: list[str]
    languages: list[str]
    response_time: str | None


@dataclass(frozen=True)
class ParsedProfile:
    event_id: str
    pubkey: str
    created_at: int
    details: ProfileDetails


def _text(value: object, field: str, limit: int, multiline: bool = False) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ProfileError(400, f"profile field '{field}' must be text")
    value = value.strip()
    checked = value.replace("\n", "") if multiline else value
    if any(ord(c) < 32 or ord(c) == 127 for c in checked):
        raise ProfileError(400, f"profile field '{field}' contains control characters")
    if len(value) > limit:
        raise ProfileError(400, f"profile field '{field}' is longer than {limit} characters")
    return value or None


def _list(value: object, field: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ProfileError(400, f"profile field '{field}' must be a list of text")
    if len(value) > MAX_LIST_ITEMS:
        raise ProfileError(400, f"profile field '{field}' may hold at most {MAX_LIST_ITEMS} items")
    items: list[str] = []
    for item in value:
        text = _text(item, field, MAX_LIST_ITEM)
        if text and text.casefold() not in {i.casefold() for i in items}:
            items.append(text)
    return items


def profile_details(content: str) -> ProfileDetails:
    """Read the fields the directory shows from a kind 0 event's content."""
    try:
        data = json.loads(content)
    except ValueError as exc:
        raise ProfileError(400, "profile content must be a JSON object") from exc
    if not isinstance(data, dict):
        raise ProfileError(400, "profile content must be a JSON object")
    # NIP-24: display_name is the full name to show; name is the short handle.
    name = _text(data.get("display_name"), "display_name", MAX_NAME) or _text(
        data.get("name"), "name", MAX_NAME
    )
    if not name:
        raise ProfileError(400, "profile needs a name or display_name")
    return ProfileDetails(
        name=name,
        about=_text(data.get("about"), "about", MAX_ABOUT, multiline=True),
        specialties=_list(data.get("specialties"), "specialties"),
        languages=_list(data.get("languages"), "languages"),
        response_time=_text(data.get("response_time"), "response_time", MAX_RESPONSE_TIME),
    )


def parse_profile(event: object, counsellor_pubkey: str, now: int) -> ParsedProfile:
    if not verify_event(event):
        raise ProfileError(400, "not a valid signed Nostr event")
    assert isinstance(event, dict)
    if has_nul(event):
        raise ProfileError(400, "event must not contain NUL characters")
    if event["kind"] != PROFILE_KIND:
        raise ProfileError(400, f"profile must be a kind {PROFILE_KIND} event")
    if event["pubkey"] != counsellor_pubkey:
        raise ProfileError(403, "profile must be signed by the counsellor's own key")
    if event["created_at"] > now + MAX_CLOCK_SKEW_SECONDS:
        raise ProfileError(400, "profile is dated in the future")
    if len(event["content"].encode()) > MAX_CONTENT_BYTES:
        raise ProfileError(400, f"profile content is larger than {MAX_CONTENT_BYTES} bytes")
    if len(event["tags"]) > MAX_TAGS:
        raise ProfileError(400, f"profile may carry at most {MAX_TAGS} tags")
    return ParsedProfile(
        event["id"], event["pubkey"], event["created_at"], profile_details(event["content"])
    )
