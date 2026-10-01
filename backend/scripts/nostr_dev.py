"""Dev helper for trying the API by hand. Test keys only: never pass a real key.

  python scripts/nostr_dev.py pubkey --sec <hex>
  python scripts/nostr_dev.py nip05  --sec <hex>                  # a nostr.json vouching for it
  python scripts/nostr_dev.py auth   --sec <hex> --url <URL> [--method POST --data '<json>']
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
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.nostr.events import pubkey_of, sign_event  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name in ("pubkey", "nip05", "auth", "roster", "profile"):
        p = sub.add_parser(name)
        p.add_argument("--sec", required=True, help="64-char hex secret key (test keys only)")
        if name == "auth":
            p.add_argument("--url", required=True, help="the full public URL, with any query")
            p.add_argument("--method", default="GET")
            p.add_argument("--data", help="request body, exactly as sent")
        if name == "roster":
            p.add_argument("--days", type=int, default=30)
            p.add_argument("members", nargs="*")
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
        tags = [["u", args.url], ["method", args.method.upper()]]
        if args.data is not None or args.method.upper() in ("POST", "PUT", "PATCH"):
            body = (args.data or "").encode()
            tags.append(["payload", hashlib.sha256(body).hexdigest()])
        event = sign_event(args.sec, 27235, tags, "")
        print("Nostr " + base64.b64encode(json.dumps(event).encode()).decode())
    elif args.cmd == "roster":
        expires = int(time.time()) + args.days * 86400
        tags = [["d", "verified-counsellors"], *(["p", m] for m in args.members)]
        tags.append(["expiration", str(expires)])
        print(json.dumps(sign_event(args.sec, 30000, tags, "")))
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
