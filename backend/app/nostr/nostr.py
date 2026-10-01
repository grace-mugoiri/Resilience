from app.nostr.schemas import NostrEvent

def process_event(event: NostrEvent) -> dict:
    # Process a nostr event and reutrn a response dictionary
    return {
        "event_id": event.id,
        "pubkey": event.pubkey,
        "kind": event.kind,
        "status": "processed"
    }
