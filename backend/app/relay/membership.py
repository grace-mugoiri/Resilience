"""Opaque support-group membership storage helpers."""

import hashlib
import hmac


def blind_pubkey(secret: str, pubkey: str) -> str:
    return hmac.new(secret.encode(), bytes.fromhex(pubkey), hashlib.sha256).hexdigest()
