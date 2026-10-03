"""Approve a pending organization in the local Docker development stack.

This intentionally automates development infrastructure only. It creates a gitignored NIP-05
fixture and throwaway platform-admin key, updates the gitignored ``.env``, rebuilds the affected
services, and performs the normal challenge-bound signed approval request.

Run from ``backend/``:

    python scripts/local_approve_org.py
    python scripts/local_approve_org.py --org-id <uuid>

Without ``--org-id`` the newest pending organization is selected.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BACKEND_DIR / ".env"
ENV_EXAMPLE_PATH = BACKEND_DIR / ".env.example"
ADMIN_SECRET_PATH = BACKEND_DIR / ".dev-admin-secret"
NIP05_ROOT = BACKEND_DIR / ".dev-nip05"
NIP05_PATH = NIP05_ROOT / ".well-known" / "nostr.json"
NIP05_INTERNAL_URL = "http://nip05-dev:9000"

sys.path.insert(0, str(BACKEND_DIR))

from app.nostr.events import pubkey_of  # noqa: E402
from scripts.nostr_dev import approve_organization  # noqa: E402


def run(*arguments: str, capture: bool = False) -> str:
    result = subprocess.run(  # noqa: S603 - every argument is constructed by this dev script
        arguments,
        cwd=BACKEND_DIR,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
    )
    return result.stdout.strip() if capture else ""


def ensure_env() -> None:
    if ENV_PATH.exists():
        return
    if not ENV_EXAMPLE_PATH.exists():
        raise RuntimeError("backend/.env and backend/.env.example are both missing")
    ENV_PATH.write_text(ENV_EXAMPLE_PATH.read_text())
    os.chmod(ENV_PATH, 0o600)
    print("Created backend/.env from .env.example")


def update_env(values: dict[str, str]) -> None:
    lines = ENV_PATH.read_text().splitlines()
    remaining = dict(values)
    updated: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0] if "=" in line and not line.lstrip().startswith("#") else None
        if key in remaining:
            updated.append(f"{key}={remaining.pop(key)}")
        else:
            updated.append(line)
    updated.extend(f"{key}={value}" for key, value in remaining.items())
    ENV_PATH.write_text("\n".join(updated) + "\n")


def env_value(name: str) -> str:
    for line in ENV_PATH.read_text().splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip()
    return ""


def admin_secret() -> str:
    if ADMIN_SECRET_PATH.exists():
        value = ADMIN_SECRET_PATH.read_text().strip().lower()
        if len(value) != 64 or any(character not in "0123456789abcdef" for character in value):
            raise RuntimeError(f"{ADMIN_SECRET_PATH.name} is not a valid 32-byte hex key")
        return value
    value = secrets.token_hex(32)
    ADMIN_SECRET_PATH.write_text(value + "\n")
    os.chmod(ADMIN_SECRET_PATH, 0o600)
    return value


def pending_organization(org_id: str | None) -> dict[str, str]:
    selected_id = str(uuid.UUID(org_id)) if org_id else None
    # Keep this query constant. Selection by the optional UUID happens in Python, avoiding shell
    # quoting and psql-variable differences across PostgreSQL client versions.
    query = (
        "SELECT json_build_object("
        "'id', id::text, 'name', name, 'domain', domain, 'nostr_pubkey', nostr_pubkey)::text "
        "FROM organizations WHERE status = 'pending' ORDER BY created_at DESC;"
    )
    output = run(
        "docker",
        "compose",
        "exec",
        "-T",
        "db",
        "psql",
        "-U",
        "resilience",
        "-d",
        "resilience",
        "-At",
        "-c",
        query,
        capture=True,
    )
    if not output:
        target = f" with id {org_id}" if org_id else ""
        raise RuntimeError(f"no pending organization{target} was found")
    records = [json.loads(line) for line in output.splitlines() if line.strip()]
    value = next(
        (record for record in records if selected_id is None or record.get("id") == selected_id),
        None,
    )
    if not isinstance(value, dict):
        target = f" with id {org_id}" if org_id else ""
        raise RuntimeError(f"no pending organization{target} was found")
    return {key: str(item) for key, item in value.items()}


def write_nip05(pubkey: str) -> None:
    NIP05_PATH.parent.mkdir(parents=True, exist_ok=True)
    NIP05_PATH.write_text(json.dumps({"names": {"_": pubkey}}, indent=2) + "\n")


def wait_for_api(api: str, seconds: int = 90) -> None:
    deadline = time.monotonic() + seconds
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urlopen(f"{api.rstrip('/')}/healthz", timeout=2) as response:  # noqa: S310
                if response.status == 200:
                    return
        except (OSError, URLError) as exc:
            last_error = exc
        time.sleep(1)
    raise RuntimeError(f"API did not become healthy within {seconds} seconds: {last_error}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org-id", help="pending organization UUID; defaults to the newest")
    parser.add_argument("--api", default="http://localhost:8000")
    args = parser.parse_args()

    ensure_env()
    print("Starting the local database…")
    run("docker", "compose", "up", "-d", "db")
    organization = pending_organization(args.org_id)
    print(f"Selected {organization['name']} ({organization['id']})")

    secret = admin_secret()
    admin_pubkey = pubkey_of(secret)
    admin_pubkeys = [value for value in env_value("ADMIN_PUBKEYS").split(",") if value]
    if admin_pubkey not in admin_pubkeys:
        admin_pubkeys.append(admin_pubkey)
    write_nip05(organization["nostr_pubkey"])
    update_env(
        {
            "APP_ENV": "dev",
            "ADMIN_PUBKEYS": ",".join(admin_pubkeys),
            "NIP05_DEV_BASE_URL": NIP05_INTERNAL_URL,
        }
    )
    print("Prepared the gitignored NIP-05 fixture and development admin identity.")
    print("Rebuilding the API, worker, and local NIP-05 service…")
    run("docker", "compose", "up", "-d", "--build", "nip05-dev", "api", "worker")
    wait_for_api(args.api)

    approved = approve_organization(secret, args.api, organization["id"])
    if approved.get("status") != "approved":
        raise RuntimeError(f"unexpected approval response: {approved}")
    print(f"Approved {approved.get('name', organization['name'])}.")
    print("Return to the PWA and press 'Check again'.")
    print(f"Development admin secret is stored at {ADMIN_SECRET_PATH} (mode 0600).")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, ValueError) as exc:
        raise SystemExit(f"error: {exc}") from exc
