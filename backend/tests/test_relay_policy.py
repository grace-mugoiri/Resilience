import time
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.db.models import SupportGroup, SupportGroupMembership
from app.db.session import get_engine
from app.nostr.events import pubkey_of
from app.relay.membership import blind_pubkey
from app.relay.policy import AdmissionEvent, decide
from app.settings import get_settings
from tests.conftest import OTHER_SECRET, SECRET
from tests.helpers import approved_org


def wrap(kind: int, recipient: str, expires: int) -> AdmissionEvent:
    return AdmissionEvent(
        pubkey="ab" * 32,
        created_at=int(time.time()),
        kind=kind,
        tags=[["p", recipient], ["expiration", str(expires)]],
    )


def test_guest_wrap_is_ephemeral_bounded_and_authenticated(client):
    del client
    settings = get_settings()
    now = int(time.time())
    sender = pubkey_of(SECRET)
    recipient = pubkey_of(OTHER_SECRET)
    with Session(get_engine()) as db:
        assert not decide(db, wrap(21059, recipient, now + 60), None, settings, now).permit
        assert decide(db, wrap(21059, recipient, now + 60), sender, settings, now).permit
        assert not decide(
            db,
            wrap(21059, recipient, now + settings.guest_event_max_seconds + 1),
            sender,
            settings,
            now,
        ).permit


def test_stored_wrap_requires_counsellor_or_shared_active_group(client):
    del client
    settings = get_settings()
    now = int(time.time())
    sender = pubkey_of(SECRET)
    recipient = pubkey_of(OTHER_SECRET)
    event = wrap(1059, recipient, now + 3600)
    org_id = approved_org()
    with Session(get_engine()) as db:
        assert not decide(db, event, sender, settings, now).permit
        group = SupportGroup(id=uuid.uuid4(), org_id=org_id)
        db.add(group)
        db.flush()
        db.add_all(
            [
                SupportGroupMembership(
                    group_id=group.id,
                    member_hash=blind_pubkey(settings.relay_policy_hmac_key, key),
                    expires_at=datetime.now(UTC) + timedelta(days=1),
                )
                for key in (sender, recipient)
            ]
        )
        db.commit()
        assert decide(db, event, sender, settings, now).permit
        recipient_member = db.get(
            SupportGroupMembership,
            (group.id, blind_pubkey(settings.relay_policy_hmac_key, recipient)),
        )
        recipient_member.active = False
        db.commit()
        assert not decide(db, event, sender, settings, now).permit


def test_metadata_requires_matching_nip42_identity(client):
    del client
    settings = get_settings()
    signer = pubkey_of(SECRET)
    event = AdmissionEvent(signer, int(time.time()), 30000, [])
    with Session(get_engine()) as db:
        assert decide(db, event, signer, settings).permit
        assert not decide(db, event, pubkey_of(OTHER_SECRET), settings).permit
        assert not decide(
            db, AdmissionEvent(signer, int(time.time()), 1, []), signer, settings
        ).permit
