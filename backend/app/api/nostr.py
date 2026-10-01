from fastapi import APIRouter, HTTPException


from app.nostr.schemas import NostrEvent
from app.nostr.validator import validate_event

router = APIRouter(prefix="/nostr", tags=["Nostr"])

@router.post("/events")
async def handle_event(event: NostrEvent):
    if not validate_event(event):
        raise HTTPException(
            status_code=400,
            detail="Invalid Nostr event"
        )
    return {
        "status": "success",
        "event_id": event.id
    }