import json
import socket

import pytest

from app.directory.nip05 import (
    DomainError,
    Nip05Error,
    check_nip05,
    normalize_domain,
    nostr_json_url,
    refuse_non_public,
)
from app.settings import Settings

KEY = "ab" * 32


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("Wangu.ORG", "wangu.org"), (" wangu.or.ke. ", "wangu.or.ke"), ("a-b.co", "a-b.co")],
)
def test_normalize_accepts_public_hostnames(raw, expected):
    assert normalize_domain(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "localhost",
        "127.0.0.1",
        "10.0.0.5",
        "[::1]",
        "https://wangu.org",
        "wangu.org/path",
        "wangu.org:8443",
        "wangu",
        "under_score.org",
        "printer.local",
        "db.internal",
        "api.example.test",
        "-bad.org",
    ],
)
def test_normalize_refuses_everything_else(raw):
    with pytest.raises(DomainError):
        normalize_domain(raw)


def fetch_returning(status: int, body: object):
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    return lambda domain: (status, raw)


def test_matching_key_passes():
    assert check_nip05("wangu.org", KEY, fetch_returning(200, {"names": {"_": KEY}})).ok


def test_uppercase_hex_in_the_file_still_matches():
    fetch = fetch_returning(200, {"names": {"_": KEY.upper()}})
    assert check_nip05("wangu.org", KEY, fetch).ok


@pytest.mark.parametrize(
    ("status", "body", "definitive"),
    [
        (200, {"names": {"_": "cd" * 32}}, True),  # someone else's key
        (200, {"names": {"bob": KEY}}, True),  # no "_" entry
        (200, {"relays": {}}, True),  # no names object
        (200, b"<html>", True),  # not JSON
        (200, ["_"], True),  # JSON, but not an object
        (301, b"", True),  # NIP-05 forbids following redirects
        (404, b"", True),
        (503, b"", False),  # a blip, not proof
    ],
)
def test_failures(status, body, definitive):
    result = check_nip05("wangu.org", KEY, fetch_returning(status, body))
    assert not result.ok
    assert result.definitive is definitive


def test_unreachable_site_is_not_definitive():
    def fetch(domain):
        raise Nip05Error("timeout", definitive=False)

    result = check_nip05("wangu.org", KEY, fetch)
    assert (result.ok, result.definitive) == (False, False)


def test_dev_override_only_outside_production():
    dev = Settings(app_env="dev", nip05_dev_base_url="http://localhost:9000/")
    prod = Settings(
        app_env="prod",
        nip05_dev_base_url="http://localhost:9000/",
        relay_policy_hmac_key="r" * 32,
        counselor_invite_hmac_key="i" * 32,
    )
    assert nostr_json_url("wangu.org", dev) == "http://localhost:9000/.well-known/nostr.json?name=_"
    assert nostr_json_url("wangu.org", prod) == "https://wangu.org/.well-known/nostr.json?name=_"


@pytest.mark.parametrize("address", ["10.0.0.7", "127.0.0.1", "169.254.169.254", "::1"])
def test_domains_pointing_inside_the_network_are_refused(monkeypatch, address):
    family = socket.AF_INET6 if ":" in address else socket.AF_INET
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [(family, 1, 6, "", (address, 443))])
    with pytest.raises(Nip05Error) as exc:
        refuse_non_public("wangu.org")
    assert exc.value.definitive


def test_public_address_is_allowed(monkeypatch):
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: [(socket.AF_INET, 1, 6, "", ("1.1.1.1", 443))]
    )
    refuse_non_public("wangu.org")


def test_admin_keys_must_be_hex():
    with pytest.raises(ValueError):
        Settings(admin_pubkeys="npub1abc")
    assert Settings(admin_pubkeys=f" {KEY.upper()} ,").admin_pubkeys == [KEY]
