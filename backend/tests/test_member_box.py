import base64
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


def test_member_box_rejects_noncanonical_and_padded_base64url():
    settings = get_settings()
    context = membership_context("circle", uuid.uuid4(), "cd" * 32)
    box = seal_member_pubkey(settings, pubkey_of(SECRET), context)
    prefix, nonce, ciphertext = box.split(".")

    with pytest.raises(ValueError):
        open_member_pubkey(settings, f"{prefix}.{nonce}=.{ciphertext}", context)

    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    decoded = base64.urlsafe_b64decode(ciphertext + "=" * (-len(ciphertext) % 4))
    aliases = [candidate for candidate in alphabet if candidate != ciphertext[-1]]
    alias = next(
        candidate
        for candidate in aliases
        if base64.urlsafe_b64decode(ciphertext[:-1] + candidate + "=" * (-len(ciphertext) % 4))
        == decoded
    )
    with pytest.raises(ValueError):
        open_member_pubkey(settings, f"{prefix}.{nonce}.{ciphertext[:-1]}{alias}", context)
