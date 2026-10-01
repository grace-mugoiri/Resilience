import time

import pytest
from sqlalchemy import text

from app.db.session import get_engine
from tests.conftest import OTHER_SECRET
from tests.helpers import COUNSELLORS, approved_org, profile_event, roster_event

# COUNSELLORS[i] is the key of the secret f"{i + 1:02x}" * 32.
GRACE_SECRET, GRACE = "01" * 32, COUNSELLORS[0]
AMANI_SECRET, AMANI = "02" * 32, COUNSELLORS[1]


def put_profile(client, org_id, pubkey, event):
    return client.put(f"/v1/orgs/{org_id}/counsellors/{pubkey}/profile", json=event)


def directory(client, org_id) -> dict:
    return {
        c["pubkey"]: c for c in client.get(f"/v1/orgs/{org_id}/counsellors").json()["counsellors"]
    }


@pytest.fixture
def org_id(client):
    org_id = approved_org()
    assert (
        client.put(f"/v1/orgs/{org_id}/roster", json=roster_event([GRACE, AMANI])).status_code
        == 200
    )
    return org_id


def test_counsellor_publishes_her_profile(client, org_id):
    event = profile_event(GRACE_SECRET)
    r = put_profile(client, org_id, GRACE, event)
    assert r.status_code == 200
    assert r.json()["profile"] == {
        "name": "Counsellor Grace",
        "about": "Trauma-informed counsellor.",
        "specialties": ["Trauma support", "Legal aid"],
        "languages": ["English", "Kiswahili"],
        "response_time": "Usually replies within a few hours",
    }
    listed = directory(client, org_id)
    assert listed[GRACE]["profile"]["name"] == "Counsellor Grace"
    assert listed[GRACE]["profile_event"] == event  # the client can check her signature
    assert listed[AMANI]["profile"] is None and listed[AMANI]["profile_event"] is None


def test_profile_never_exposes_an_image_url(client, org_id):
    # Loading an image would tell the image host the survivor's IP address.
    put_profile(client, org_id, GRACE, profile_event(GRACE_SECRET))
    assert "picture" not in directory(client, org_id)[GRACE]["profile"]


def test_counsellors_with_profiles_are_listed_first_by_name(client, org_id):
    put_profile(client, org_id, AMANI, profile_event(AMANI_SECRET, {"name": "Amani"}))
    put_profile(client, org_id, GRACE, profile_event(GRACE_SECRET, {"name": "Zawadi"}))
    names = [
        c["profile"]["name"] if c["profile"] else None
        for c in client.get(f"/v1/orgs/{org_id}/counsellors").json()["counsellors"]
    ]
    assert names == ["Amani", "Zawadi"]


def test_profile_signed_by_another_key_is_refused(client, org_id):
    assert put_profile(client, org_id, GRACE, profile_event(OTHER_SECRET)).status_code == 403
    # Amani cannot write Grace's profile either.
    assert put_profile(client, org_id, GRACE, profile_event(AMANI_SECRET)).status_code == 403


def test_tampered_profile_is_refused(client, org_id):
    event = profile_event(GRACE_SECRET)
    event["content"] = event["content"].replace("Grace", "Impostor")
    assert put_profile(client, org_id, GRACE, event).status_code == 400


def test_only_current_counsellors_can_publish(client, org_id):
    stranger_secret = "04" * 32  # COUNSELLORS[3], never on this roster
    r = put_profile(client, org_id, COUNSELLORS[3], profile_event(stranger_secret))
    assert r.status_code == 403
    client.put(
        f"/v1/orgs/{org_id}/roster", json=roster_event([AMANI], created_at=int(time.time()) + 1)
    )
    assert put_profile(client, org_id, GRACE, profile_event(GRACE_SECRET)).status_code == 403


def test_expired_counsellors_cannot_publish(client, org_id):
    with get_engine().begin() as conn:
        conn.execute(text("UPDATE counsellor_attestations SET expires_at = now() - interval '1s'"))
    assert put_profile(client, org_id, GRACE, profile_event(GRACE_SECRET)).status_code == 403


def test_unapproved_org_is_refused(client, org_id):
    with get_engine().begin() as conn:
        conn.execute(text("UPDATE organizations SET status = 'suspended'"))
    assert put_profile(client, org_id, GRACE, profile_event(GRACE_SECRET)).status_code == 409


def test_newer_profile_replaces_older_and_old_one_cannot_come_back(client, org_id):
    now = int(time.time())
    old = profile_event(GRACE_SECRET, {"name": "Old name"}, created_at=now - 10)
    new = profile_event(GRACE_SECRET, {"name": "New name"}, created_at=now)
    assert put_profile(client, org_id, GRACE, old).status_code == 200
    assert put_profile(client, org_id, GRACE, new).status_code == 200
    assert put_profile(client, org_id, GRACE, old).status_code == 409
    assert directory(client, org_id)[GRACE]["profile"]["name"] == "New name"


def test_same_profile_twice_is_harmless(client, org_id):
    event = profile_event(GRACE_SECRET)
    assert put_profile(client, org_id, GRACE, event).status_code == 200
    assert put_profile(client, org_id, GRACE, event).status_code == 200


def test_profile_survives_removal_so_survivors_recognise_who_was_removed(client, org_id):
    put_profile(client, org_id, GRACE, profile_event(GRACE_SECRET))
    client.put(
        f"/v1/orgs/{org_id}/roster", json=roster_event([AMANI], created_at=int(time.time()) + 1)
    )
    grace = directory(client, org_id)[GRACE]
    assert grace["status"] == "removed"
    assert grace["profile"]["name"] == "Counsellor Grace"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"kind": 1},
        {"content": "not json"},
        {"content": "[1, 2]"},
        {"content": {"about": "no name"}},
        {"content": {"name": 7}},
        {"content": {"name": "x" * 81}},
        {"content": {"name": "Grace", "about": "x" * 501}},
        {"content": {"name": "Grace", "specialties": "Trauma support"}},
        {"content": {"name": "Grace", "languages": ["x"] * 11}},
        {"content": {"name": "Grace\u0000"}},
        {"content": {"name": "Grace", "padding": "x" * 5000}},
        {"tags": [["t", "nul\u0000here"]]},
        {"tags": [["t", "x"]] * 21},
        {"created_at": int(time.time()) + 3600},
    ],
    ids=[
        "kind",
        "not-json",
        "not-object",
        "no-name",
        "name-type",
        "long-name",
        "long-about",
        "list-type",
        "too-many-items",
        "control-char",
        "too-large",
        "nul-elsewhere",
        "too-many-tags",
        "future",
    ],
)
def test_malformed_profiles_are_refused(client, org_id, kwargs):
    assert (
        put_profile(client, org_id, GRACE, profile_event(GRACE_SECRET, **kwargs)).status_code == 400
    )


def test_lists_are_trimmed_and_deduplicated(client, org_id):
    content = {"name": " Grace ", "languages": ["English", " english ", "", "Kiswahili"]}
    r = put_profile(client, org_id, GRACE, profile_event(GRACE_SECRET, content))
    assert r.json()["profile"]["name"] == "Grace"
    assert r.json()["profile"]["languages"] == ["English", "Kiswahili"]


def test_bad_pubkey_in_path_is_rejected(client, org_id):
    assert put_profile(client, org_id, "NPUB1abc", profile_event(GRACE_SECRET)).status_code == 422


def test_unknown_org_is_404(client):
    missing = "00000000-0000-0000-0000-000000000000"
    assert put_profile(client, missing, GRACE, profile_event(GRACE_SECRET)).status_code == 404
