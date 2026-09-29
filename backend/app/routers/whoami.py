from fastapi import APIRouter

from app.auth.nip98 import NostrPubkey

router = APIRouter(prefix="/v1")


@router.get("/whoami")
def whoami(pubkey: NostrPubkey) -> dict:
    """Lets the dashboard team check their NIP-98 signing end to end."""
    return {"pubkey": pubkey}
