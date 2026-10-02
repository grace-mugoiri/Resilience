"""Sign the client config with the platform key. Run this on a laptop, never on the server.

  PLATFORM_SECRET_HEX=<64 hex> python scripts/sign_config.py
  python scripts/sign_config.py --dev      # throwaway key for local development

Convert an nsec to hex with:  nak decode nsec1...
"""

import argparse
import json
import os
import secrets
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.nostr.events import pubkey_of, sign_event  # noqa: E402

CONFIG_KIND = 30078  # NIP-78 application-specific data
D_TAG = "resilience/client-config"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="src", default="config/client-config.json")
    parser.add_argument("--out", default="config/client-config.signed.json")
    parser.add_argument("--dev", action="store_true", help="generate a throwaway key")
    parser.add_argument("--days", type=int, default=30, help="config validity period")
    args = parser.parse_args()

    secret = secrets.token_hex(32) if args.dev else os.environ.get("PLATFORM_SECRET_HEX", "")
    if len(secret) != 64:
        sys.exit("Set PLATFORM_SECRET_HEX (64 hex chars) or pass --dev")

    pubkey = pubkey_of(secret)
    content = Path(args.src).read_text().replace("<platform-pubkey>", pubkey)
    parsed = json.loads(content)
    if parsed.get("schema_version") != 1:
        sys.exit("client config schema_version must be 1")
    if len(set(parsed.get("relays", []))) < 2:
        sys.exit("client config needs at least two distinct relays")
    expires = int(time.time()) + args.days * 86400
    event = sign_event(
        secret,
        CONFIG_KIND,
        [["d", D_TAG], ["expiration", str(expires)]],
        content,
    )
    Path(args.out).write_text(json.dumps(event, indent=2) + "\n")
    print(f"wrote {args.out}")
    print(f"PLATFORM_PUBKEY={pubkey}")


if __name__ == "__main__":
    main()
