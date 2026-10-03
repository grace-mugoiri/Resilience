"""Dev helper for trying the API by hand. Test keys only: never pass a real key.

  python scripts/nostr_dev.py pubkey --sec <hex>
  python scripts/nostr_dev.py nip05  --sec <hex>                  # a nostr.json vouching for it
  python scripts/nostr_dev.py auth   --sec <hex> --url <URL> [--method POST --data '<json>'] \
      [--scope <operation scope> --challenge <server challenge>]
  python scripts/nostr_dev.py authorize-key --sec <root hex> --operational-pubkey <hex>
  python scripts/nostr_dev.py revoke-key --sec <root hex> --operational-pubkey <hex>
  python scripts/nostr_dev.py counselor-invite --sec <verification operational hex> \
      --api http://localhost:8000 --org-id <uuid> --review-pubkey <hex>
  python scripts/nostr_dev.py roster --sec <hex> [--days 30] <counsellor pubkey> ...
  python scripts/nostr_dev.py profile --sec <hex> --name "Counsellor Grace" \
      [--about "..."] [--specialty "Trauma support" ...] [--language English ...] \
      [--response-time "Usually replies within a few hours"]

`auth` prints a full header value: use it as -H "Authorization: $(python ... auth ...)".
For POST, --data must be byte-for-byte the body you send with curl --data.
"""

import argparse
import base64
import hashlib
import json
import secrets
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.nostr.events import pubkey_of, sign_event  # noqa: E402


def invite_hours(value: str) -> int:
    hours = int(value)
    if not 1 <= hours <= 168:
        raise argparse.ArgumentTypeError("hours must be between 1 and 168")
    return hours


def auth_value(
    secret: str,
    url: str,
    method: str,
    data: str | None = None,
    scope: str | None = None,
    challenge: str | None = None,
) -> str:
    """Create the exact NIP-98 header used by both the CLI and API workflows."""
    if bool(scope) != bool(challenge):
        raise ValueError("scope and challenge must be provided together")
    method = method.upper()
    tags = [["u", url], ["method", method], ["client_nonce", secrets.token_hex(8)]]
    if scope:
        tags.extend([["scope", scope], ["challenge", challenge]])
    if data is not None or method in ("POST", "PUT", "PATCH"):
        body = (data or "").encode()
        tags.append(["payload", hashlib.sha256(body).hexdigest()])
    event = sign_event(secret, 27235, tags, "")
    return "Nostr " + base64.b64encode(json.dumps(event).encode()).decode()


def post_json(url: str, body: str, authorization: str, timeout: float = 10) -> dict:
    if urlsplit(url).scheme not in {"http", "https"}:
        raise RuntimeError("API URL must use http or https")
    request = Request(  # noqa: S310 - URL scheme is restricted immediately above
        url,
        data=body.encode(),
        headers={"Authorization": authorization, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 - explicit dev API URL
            payload = json.loads(response.read())
    except HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise RuntimeError(f"API returned HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"could not connect to the API: {exc.reason}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("API returned an unexpected non-object response")
    return payload


def create_counselor_invite(
    secret: str,
    api: str,
    org_id: str,
    review_pubkey: str,
    hours: int,
) -> dict:
    api = api.rstrip("/")
    scope = f"counselor:invite:{org_id}"
    challenge_url = f"{api}/v1/auth/challenges"
    challenge_body = json.dumps({"scope": scope}, separators=(",", ":"))
    challenge_response = post_json(
        challenge_url,
        challenge_body,
        auth_value(secret, challenge_url, "POST", challenge_body),
    )
    challenge = challenge_response.get("challenge")
    if not isinstance(challenge, str) or not challenge:
        raise RuntimeError("API challenge response did not contain a challenge")

    invite_url = f"{api}/v1/orgs/{org_id}/counselor-invites"
    invite_body = json.dumps(
        {
            "credential_recipient_pubkey": review_pubkey,
            "expires_in_hours": hours,
        },
        separators=(",", ":"),
    )
    return post_json(
        invite_url,
        invite_body,
        auth_value(secret, invite_url, "POST", invite_body, scope, challenge),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name in (
        "pubkey",
        "nip05",
        "auth",
        "authorize-key",
        "revoke-key",
        "counselor-invite",
        "roster",
        "profile",
    ):
        p = sub.add_parser(name)
        p.add_argument("--sec", required=True, help="64-char hex secret key (test keys only)")
        if name == "auth":
            p.add_argument("--url", required=True, help="the full public URL, with any query")
            p.add_argument("--method", default="GET")
            p.add_argument("--data", help="request body, exactly as sent")
            p.add_argument("--scope", help="sensitive-operation scope")
            p.add_argument("--challenge", help="one-use challenge returned by the API")
        if name == "roster":
            p.add_argument("--days", type=int, default=30)
            p.add_argument("members", nargs="*")
        if name in ("authorize-key", "revoke-key"):
            p.add_argument("--operational-pubkey", required=True)
        if name == "counselor-invite":
            p.add_argument("--api", default="http://localhost:8000")
            p.add_argument("--org-id", required=True)
            p.add_argument("--review-pubkey", required=True, help="credential-review public key")
            p.add_argument("--hours", type=invite_hours, default=168)
        if name == "authorize-key":
            p.add_argument("--days", type=int, default=30)
            p.add_argument(
                "--scope",
                action="append",
                choices=("roster", "verification", "groups", "payments"),
                help="repeat for each delegated scope; defaults to roster",
            )
        if name == "profile":
            p.add_argument("--name", required=True)
            p.add_argument("--about")
            p.add_argument("--specialty", action="append", default=[])
            p.add_argument("--language", action="append", default=[])
            p.add_argument("--response-time")
    args = parser.parse_args()

    if args.cmd == "pubkey":
        print(pubkey_of(args.sec))
    elif args.cmd == "nip05":
        print(json.dumps({"names": {"_": pubkey_of(args.sec)}}))
    elif args.cmd == "auth":
        if bool(args.scope) != bool(args.challenge):
            parser.error("auth requires --scope and --challenge together")
        print(auth_value(args.sec, args.url, args.method, args.data, args.scope, args.challenge))
    elif args.cmd == "counselor-invite":
        try:
            invitation = create_counselor_invite(
                args.sec,
                args.api,
                args.org_id,
                args.review_pubkey,
                args.hours,
            )
        except RuntimeError as exc:
            parser.exit(1, f"error: {exc}\n")
        print(json.dumps(invitation, indent=2))
    elif args.cmd == "roster":
        expires = int(time.time()) + args.days * 86400
        tags = [["d", "verified-counsellors"], *(["p", m] for m in args.members)]
        tags.append(["expiration", str(expires)])
        print(json.dumps(sign_event(args.sec, 30000, tags, "")))
    elif args.cmd == "authorize-key":
        now = int(time.time())
        key = args.operational_pubkey
        scopes = args.scope or ["roster"]
        tags = [
            ["d", f"resilience:org-operations:{key}"],
            ["p", key],
            ["valid_from", str(now)],
            ["expiration", str(now + args.days * 86400)],
            *[["scope", scope] for scope in scopes],
        ]
        print(json.dumps(sign_event(args.sec, 30382, tags, "", created_at=now)))
    elif args.cmd == "revoke-key":
        key = args.operational_pubkey
        tags = [
            ["d", f"resilience:org-operations-revocation:{key}"],
            ["p", key],
        ]
        print(json.dumps(sign_event(args.sec, 30383, tags, "")))
    elif args.cmd == "profile":
        content = {
            "name": args.name,
            "about": args.about,
            "specialties": args.specialty,
            "languages": args.language,
            "response_time": args.response_time,
        }
        content = {key: value for key, value in content.items() if value not in (None, [])}
        print(json.dumps(sign_event(args.sec, 0, [], json.dumps(content))))


if __name__ == "__main__":
    main()
