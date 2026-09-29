import time

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy import text

from app.db.session import get_engine
from tests.conftest import CLEAN_DIRECTORY, OTHER_SECRET
from tests.helpers import COUNSELLORS, approved_org, roster_event


def put(client, org_id, event):
    return client.put(f"/v1/orgs/{org_id}/roster", json=event)


def listed(client, org_id):
    return client.get(f"/v1/orgs/{org_id}/counsellors").json()["counsellors"]


def test_roster_lists_its_counsellors(client):
    org_id = approved_org()
    event = roster_event(COUNSELLORS[:2])
    r = put(client, org_id, event)
    assert r.status_code == 200
    assert r.json()["counsellors"] == sorted(COUNSELLORS[:2])
    public = client.get(f"/v1/orgs/{org_id}/counsellors").json()
    assert public["roster"] == event  # clients get the signed event to verify themselves


def test_newer_roster_drops_whoever_it_leaves_out(client):
    org_id = approved_org()
    now = int(time.time())
    put(client, org_id, roster_event(COUNSELLORS[:3], created_at=now - 10))
    r = put(client, org_id, roster_event([COUNSELLORS[2]], created_at=now))
    assert r.status_code == 200
    assert listed(client, org_id) == [COUNSELLORS[2]]


def test_empty_roster_removes_everyone(client):
    org_id = approved_org()
    now = int(time.time())
    put(client, org_id, roster_event(COUNSELLORS, created_at=now - 10))
    assert put(client, org_id, roster_event([], created_at=now)).status_code == 200
    assert listed(client, org_id) == []


def test_older_roster_is_refused(client):
    org_id = approved_org()
    now = int(time.time())
    put(client, org_id, roster_event([COUNSELLORS[0]], created_at=now))
    r = put(client, org_id, roster_event(COUNSELLORS, created_at=now - 60))
    assert r.status_code == 409
    assert listed(client, org_id) == [COUNSELLORS[0]]


def test_resending_a_replaced_roster_is_refused(client):
    org_id = approved_org()
    now = int(time.time())
    first = roster_event(COUNSELLORS, created_at=now - 10)
    put(client, org_id, first)
    put(client, org_id, roster_event([COUNSELLORS[0]], created_at=now))
    assert put(client, org_id, first).status_code == 409
    assert listed(client, org_id) == [COUNSELLORS[0]]


def test_same_roster_twice_is_harmless(client):
    org_id = approved_org()
    event = roster_event(COUNSELLORS[:2])
    assert put(client, org_id, event).status_code == 200
    assert put(client, org_id, event).status_code == 200
    assert listed(client, org_id) == sorted(COUNSELLORS[:2])


def test_roster_signed_by_another_key_is_refused(client):
    org_id = approved_org()
    assert put(client, org_id, roster_event(COUNSELLORS, secret=OTHER_SECRET)).status_code == 403


def test_tampered_roster_is_refused(client):
    org_id = approved_org()
    event = roster_event([COUNSELLORS[0]])
    event["tags"].append(["p", COUNSELLORS[1]])  # slip in a name after signing
    assert put(client, org_id, event).status_code == 400


@pytest.mark.parametrize(
    "kwargs",
    [
        {"kind": 3},
        {"d": "friends"},
        {"expires_in": None},
        {"expires_in": -1},
        {"created_at": int(time.time()) + 3600},
    ],
    ids=["kind", "d-tag", "no-expiry", "expired", "future"],
)
def test_malformed_rosters_are_refused(client, kwargs):
    org_id = approved_org()
    assert put(client, org_id, roster_event(COUNSELLORS, **kwargs)).status_code == 400


def test_bad_p_tag_is_refused(client):
    org_id = approved_org()
    assert put(client, org_id, roster_event(["npub1notahexkey"])).status_code == 400


def test_roster_for_an_unapproved_org_is_refused(client):
    org_id = approved_org()
    with get_engine().begin() as conn:
        conn.execute(text("UPDATE organizations SET status = 'pending'"))
    assert put(client, org_id, roster_event(COUNSELLORS)).status_code == 409


def test_expired_counsellors_drop_out_of_the_list(client):
    org_id = approved_org()
    put(client, org_id, roster_event(COUNSELLORS[:2]))
    with get_engine().begin() as conn:
        conn.execute(text("UPDATE counsellor_attestations SET expires_at = now() - interval '1s'"))
    assert listed(client, org_id) == []


@settings(
    max_examples=25, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(rosters=st.lists(st.lists(st.sampled_from(COUNSELLORS), max_size=4), min_size=1, max_size=5))
def test_only_the_newest_roster_counts(client, rosters):
    # The rule that must never break: a counsellor is listed only if she is on the
    # organisation's newest roster.
    with get_engine().begin() as conn:
        conn.execute(text(CLEAN_DIRECTORY))
    org_id = approved_org()
    start = int(time.time()) - 100
    for i, members in enumerate(rosters):
        assert put(client, org_id, roster_event(members, created_at=start + i)).status_code == 200
    assert listed(client, org_id) == sorted(set(rosters[-1]))
