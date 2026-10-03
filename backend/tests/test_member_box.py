import uuid

import pytest

from app.nostr.events import pubkey_of
from app.privacy.member_box import membership_context, open_member_pubkey, seal_member_pubkey
from app.settings import get_settings
from tests.conftest import SECRET


def test_member_box_is_context_bound_and_detects_tampering():
    settings = get_settings()
    room_id = uuid.uuid4()
    pubkey = pubkey_of(SECRET)
    context = membership_context("circle", room_id, "ab" * 32)
    box = seal_member_pubkey(settings, pubkey, context)
    assert pubkey not in box
    assert open_member_pubkey(settings, box, context) == pubkey
    with pytest.raises(ValueError):
        open_member_pubkey(settings, box, context + "-wrong")
    with pytest.raises(ValueError):
        open_member_pubkey(settings, box[:-1] + ("A" if box[-1] != "A" else "B"), context)
