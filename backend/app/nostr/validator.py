from schemas import NostrEvent

def validate_event(event: NostrEvent) -> bool:
    # Validate the basic structure of a nostr event 
    if not event.id:
        return False
    if not event.pubkey:
        return False
    if not event.sig:
        return False

    return True