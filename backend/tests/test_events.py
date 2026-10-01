import copy

from hypothesis import given
from hypothesis import strategies as st

from app.nostr.events import pubkey_of, sign_event, verify_event
from tests.conftest import SECRET

text_st = st.text(max_size=200)
tags_st = st.lists(st.lists(text_st, min_size=1, max_size=4), max_size=5)


def test_signed_event_verifies():
    event = sign_event(SECRET, 1, [["t", "hello"]], "hi, habari")
    assert event["pubkey"] == pubkey_of(SECRET)
    assert verify_event(event)


def test_rejects_malformed():
    for bad in [None, [], {}, {"id": "x"}, "event"]:
        assert not verify_event(bad)


@given(content=text_st, tags=tags_st, new_content=text_st)
def test_changing_content_after_signing_never_verifies(content, tags, new_content):
    # The rule that must never break: no event edited after signing may verify.
    event = sign_event(SECRET, 1, tags, content)
    assert verify_event(event)
    if new_content != content:
        forged = copy.deepcopy(event)
        forged["content"] = new_content
        assert not verify_event(forged)


@given(tags=tags_st, extra=st.lists(text_st, min_size=1, max_size=3))
def test_adding_a_tag_after_signing_never_verifies(tags, extra):
    event = sign_event(SECRET, 1, tags, "x")
    forged = copy.deepcopy(event)
    forged["tags"].append(extra)
    assert not verify_event(forged)


def test_changing_kind_or_time_breaks_signature():
    event = sign_event(SECRET, 1, [], "x")
    for field, value in [("kind", 2), ("created_at", event["created_at"] + 1)]:
        forged = dict(event, **{field: value})
        assert not verify_event(forged)
