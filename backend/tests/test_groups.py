import json

from app.nostr.events import pubkey_of
from tests.conftest import OTHER_SECRET, auth_header
from tests.helpers import BASE, OPERATIONAL_SECRET, approved_org, sensitive_tags


def signed_request(client, method: str, path: str, payload, secret: str, scope: str):
    body = json.dumps(payload).encode()
    headers = auth_header(
        BASE + path,
        method,
        body,
        secret,
        extra_tags=sensitive_tags(client, scope, secret),
    )
    headers["Content-Type"] = "application/json"
    return client.request(method, path, content=body, headers=headers)


def test_group_membership_management_is_scoped_and_returns_no_member_key(client):
    org_id = approved_org(scopes=["groups"])
    path = f"/v1/orgs/{org_id}/support-groups"
    response = signed_request(
        client, "POST", path, {}, OPERATIONAL_SECRET, f"group:create:{org_id}"
    )
    assert response.status_code == 201
    group_id = response.json()["id"]
    member = pubkey_of(OTHER_SECRET)
    member_path = f"{path}/{group_id}/members/{member}"
    response = signed_request(
        client,
        "PUT",
        member_path,
        {"role": "member"},
        OPERATIONAL_SECRET,
        f"group:member:{group_id}",
    )
    assert response.status_code == 200
    assert member not in response.text
    assert response.json()["active"] is True
    response = signed_request(
        client,
        "DELETE",
        member_path,
        {},
        OPERATIONAL_SECRET,
        f"group:member:{group_id}",
    )
    assert response.status_code == 200
    assert response.json()["active"] is False


def test_group_management_rejects_key_without_groups_scope(client):
    org_id = approved_org(scopes=["roster"])
    path = f"/v1/orgs/{org_id}/support-groups"
    response = signed_request(
        client, "POST", path, {}, OPERATIONAL_SECRET, f"group:create:{org_id}"
    )
    assert response.status_code == 403
