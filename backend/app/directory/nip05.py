"""NIP-05 check: does https://<domain>/.well-known/nostr.json?name=_ vouch for this key?

This is how an organisation proves that its Nostr key belongs to its website."""

import ipaddress
import json
import re
import socket
from collections.abc import Callable
from dataclasses import dataclass

import httpx

from app.settings import Settings

# Lowercase hostname with at least one dot and a letters-only TLD. That excludes IP literals,
# ports, paths and schemes.
_DOMAIN = re.compile(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}")
_RESERVED_SUFFIXES = (".localhost", ".local", ".internal", ".test", ".invalid", ".example")
MAX_BYTES = 64 * 1024


class DomainError(ValueError):
    pass


class Nip05Error(Exception):
    """The check could not complete. `definitive` is False for things like timeouts, which
    should not count against an organisation."""

    def __init__(self, reason: str, definitive: bool) -> None:
        super().__init__(reason)
        self.reason = reason
        self.definitive = definitive


@dataclass(frozen=True)
class Nip05Result:
    ok: bool
    reason: str
    definitive: bool = True


# A fetcher takes a domain and returns (HTTP status, body bytes), or raises Nip05Error.
Fetcher = Callable[[str], tuple[int, bytes]]


def normalize_domain(raw: str) -> str:
    domain = raw.strip().lower().rstrip(".")
    if not _DOMAIN.fullmatch(domain) or domain.endswith(_RESERVED_SUFFIXES):
        raise DomainError("domain must be a public hostname such as example.org")
    return domain


def nostr_json_url(domain: str, settings: Settings) -> str:
    if settings.nip05_dev_base_url and settings.app_env in ("dev", "test"):
        return settings.nip05_dev_base_url.rstrip("/") + "/.well-known/nostr.json?name=_"
    return f"https://{domain}/.well-known/nostr.json?name=_"


def refuse_non_public(domain: str) -> None:
    """Stop the server being used to probe its own network. A DNS answer can change between
    this check and the request, so this narrows the risk rather than closing it."""
    try:
        infos = socket.getaddrinfo(domain, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise Nip05Error("domain does not resolve", definitive=False) from exc
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise Nip05Error("domain resolves to a non-public address", definitive=True)


def make_fetcher(settings: Settings) -> Fetcher:
    def fetch(domain: str) -> tuple[int, bytes]:
        url = nostr_json_url(domain, settings)
        if url.startswith("https://"):
            refuse_non_public(domain)
        try:
            with (
                httpx.Client(timeout=settings.nip05_timeout_seconds, follow_redirects=False) as c,
                c.stream("GET", url, headers={"Accept": "application/json"}) as response,
            ):
                body = b""
                for chunk in response.iter_bytes():
                    body += chunk
                    if len(body) > MAX_BYTES:
                        raise Nip05Error("nostr.json is larger than 64 KB", definitive=True)
                return response.status_code, body
        except httpx.HTTPError as exc:
            raise Nip05Error(f"could not reach the site ({type(exc).__name__})", False) from exc

    return fetch


def check_nip05(domain: str, pubkey: str, fetch: Fetcher) -> Nip05Result:
    try:
        status, body = fetch(domain)
    except Nip05Error as exc:
        return Nip05Result(False, exc.reason, exc.definitive)
    if 300 <= status < 400:
        return Nip05Result(False, "nostr.json redirects, which NIP-05 does not allow")
    if status == 404:
        return Nip05Result(False, "no /.well-known/nostr.json on the site")
    if status != 200:
        return Nip05Result(False, f"site answered HTTP {status}", definitive=False)
    try:
        data = json.loads(body)
    except ValueError:
        return Nip05Result(False, "nostr.json is not valid JSON")
    names = data.get("names") if isinstance(data, dict) else None
    if not isinstance(names, dict):
        return Nip05Result(False, 'nostr.json has no "names" object')
    listed = names.get("_")
    if not isinstance(listed, str):
        return Nip05Result(False, 'nostr.json has no "_" entry for the domain itself')
    if listed.lower() != pubkey:
        return Nip05Result(False, "nostr.json lists a different key for this domain")
    return Nip05Result(True, "ok")
