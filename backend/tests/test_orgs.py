import time

import pytest

from app.directory.service import get_nip05_fetcher
from app.main import app
from app.nostr.events import pubkey_of
from app.worker import recheck_nip05
from tests.conftest import ADMIN_SECRET, OTHER_SECRET, auth_header
from tests.helpers import (
    BASE,
    ORG_PUBKEY,
    ORG_SECRET,
    nostr_json,
    sensitive_tags,
    signed_get,
    signed_post,
)

APPLY = {
    "name": "Wangu Centre",
    "domain": "Wangu.ORG",
    "directory_visibility": "public",
}


@pytest.fixture
def sites():
    """Fake websites: domain -> (HTTP status, body). Unknown domains answer 404."""
    pages: dict[str, tuple[int, bytes]] = {}
    app.dependency_overrides[get_nip05_fetcher] = lambda: (
        lambda domain: pages.get(domain, (404, b""))
    )
    return pages


def apply(client, payload=APPLY, secret=ORG_SECRET):
    return signed_post(client, "/v1/orgs", payload, secret)


def test_apply_creates_a_pending_org_owned_by_the_signer(client):
    r = apply(client)
    assert r.status_code == 201
    org = r.json()
    assert org["domain"] == "wangu.org"
    assert org["nip05"] == "_@wangu.org"
    assert org["nostr_pubkey"] == ORG_PUBKEY
    assert org["directory_visibility"] == "public"
    assert org["status"] == "pending"


def test_apply_needs_a_signature(client):
    assert client.post("/v1/orgs", json=APPLY).status_code == 401


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "X", "domain": "wangu.org", "directory_visibility": "public"},
        {"name": "Wangu", "domain": "localhost", "directory_visibility": "public"},
        {
            "name": "Wangu",
            "domain": "https://wangu.org",
            "directory_visibility": "public",
        },
        {
            "name": "Wangu",
            "domain": "wangu.org",
            "directory_visibility": "public",
            "status": "approved",
        },  # cannot self-approve
        {"name": "Wangu", "domain": "wangu.org"},  # privacy decision is required
        {"name": "Wangu", "domain": "wangu.org", "directory_visibility": "private"},
    ],
)
def test_apply_rejects_bad_input(client, payload):
    assert apply(client, payload).status_code == 422


def test_one_application_per_domain_and_per_key(client):
    assert apply(client).status_code == 201
    other_key_same_domain = apply(client, APPLY, OTHER_SECRET)
    assert other_key_same_domain.status_code == 409
    same_key_other_domain = apply(
        client,
        {"name": "Wangu 2", "domain": "wangu2.org", "directory_visibility": "public"},
    )
    assert same_key_other_domain.status_code == 409


def test_pending_orgs_are_not_public(client):
    apply(client)
    assert client.get("/v1/orgs").json() == []


def test_admin_list_needs_an_admin_key(client):
    org_id = apply(client).json()["id"]
    assert signed_get(client, "/v1/admin/orgs", ORG_SECRET).status_code == 403
    r = signed_get(client, "/v1/admin/orgs", ADMIN_SECRET)
    assert r.status_code == 200
    assert [o["id"] for o in r.json()] == [org_id]


def test_approve_when_the_website_vouches(client, sites):
    org_id = apply(client).json()["id"]
    sites["wangu.org"] = nostr_json(ORG_PUBKEY)
    r = signed_post(client, f"/v1/admin/orgs/{org_id}/approve", None, ADMIN_SECRET)
    assert r.status_code == 200
    assert r.json()["status"] == "approved"
    assert r.json()["nip05_verified_at"] is not None
    listed = client.get("/v1/orgs")
    assert [o["id"] for o in listed.json()] == [org_id]
    assert listed.headers["cache-control"] == "public, max-age=60"


def test_sensitive_admin_action_needs_scoped_server_challenge(client, sites):
    org_id = apply(client).json()["id"]
    sites["wangu.org"] = nostr_json(ORG_PUBKEY)
    path = f"/v1/admin/orgs/{org_id}/approve"
    headers = auth_header(BASE + path, "POST", b"", ADMIN_SECRET)
    assert client.post(path, content=b"", headers=headers).status_code == 403


def test_sensitive_challenge_is_bound_to_scope_and_single_use(client, sites):
    org_id = apply(client).json()["id"]
    sites["wangu.org"] = nostr_json(ORG_PUBKEY)
    path = f"/v1/admin/orgs/{org_id}/approve"
    scope = f"admin:org:approve:{org_id}"
    tags = sensitive_tags(client, scope, ADMIN_SECRET)
    wrong = auth_header(
        BASE + path,
        "POST",
        b"",
        ADMIN_SECRET,
        extra_tags=[["scope", f"admin:org:suspend:{org_id}"], tags[1]],
    )
    assert client.post(path, content=b"", headers=wrong).status_code == 403
    first = auth_header(BASE + path, "POST", b"", ADMIN_SECRET, extra_tags=tags)
    assert client.post(path, content=b"", headers=first).status_code == 200
    replay = auth_header(
        BASE + path,
        "POST",
        b"",
        ADMIN_SECRET,
        created_at=int(time.time()) + 1,
        extra_tags=tags,
    )
    assert client.post(path, content=b"", headers=replay).status_code == 403


@pytest.mark.parametrize(
    "page", [None, nostr_json(pubkey_of(OTHER_SECRET)), (301, b"")], ids=["no-file", "other", "3xx"]
)
def test_approve_refused_when_the_website_does_not_vouch(client, sites, page):
    org_id = apply(client).json()["id"]
    if page:
        sites["wangu.org"] = page
    r = signed_post(client, f"/v1/admin/orgs/{org_id}/approve", None, ADMIN_SECRET)
    assert r.status_code == 409
    assert r.json()["detail"].startswith("NIP-05 check failed")
    assert client.get("/v1/orgs").json() == []


def test_only_admins_approve(client, sites):
    org_id = apply(client).json()["id"]
    sites["wangu.org"] = nostr_json(ORG_PUBKEY)
    r = signed_post(client, f"/v1/admin/orgs/{org_id}/approve", None, ORG_SECRET)
    assert r.status_code == 403


def test_unknown_org_is_404(client):
    path = "/v1/admin/orgs/00000000-0000-0000-0000-000000000000/approve"
    assert signed_post(client, path, None, ADMIN_SECRET).status_code == 404
    assert (
        client.get("/v1/orgs/00000000-0000-0000-0000-000000000000/counsellors").status_code == 404
    )


def test_suspend_removes_the_org_from_the_directory(client, sites):
    org_id = apply(client).json()["id"]
    sites["wangu.org"] = nostr_json(ORG_PUBKEY)
    signed_post(client, f"/v1/admin/orgs/{org_id}/approve", None, ADMIN_SECRET)
    r = signed_post(client, f"/v1/admin/orgs/{org_id}/suspend", None, ADMIN_SECRET)
    assert r.json()["status"] == "suspended"
    assert client.get("/v1/orgs").json() == []
    assert client.get(f"/v1/orgs/{org_id}/counsellors").status_code == 404


def test_worker_suspends_only_on_a_definite_failure(client, sites):
    org_id = apply(client).json()["id"]
    sites["wangu.org"] = nostr_json(ORG_PUBKEY)
    signed_post(client, f"/v1/admin/orgs/{org_id}/approve", None, ADMIN_SECRET)

    def fetch(domain):
        return sites.get(domain, (404, b""))

    sites["wangu.org"] = (503, b"")  # the site has a bad hour
    assert recheck_nip05(fetch) == {"verified": 0, "suspended": 0, "unreachable": 1}
    assert len(client.get("/v1/orgs").json()) == 1

    sites["wangu.org"] = nostr_json(pubkey_of(OTHER_SECRET))  # the site now lists another key
    assert recheck_nip05(fetch) == {"verified": 0, "suspended": 1, "unreachable": 0}
    assert client.get("/v1/orgs").json() == []
