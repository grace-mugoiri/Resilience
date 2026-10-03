import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import SupportGroupMembership
from app.db.session import get_engine
from app.nostr.events import pubkey_of
from tests.conftest import OTHER_SECRET, SECRET, auth_header
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


def test_private_group_recipient_routing_rotates_when_membership_changes(client):
    org_id = approved_org(scopes=["groups"])
    collection = f"/v1/orgs/{org_id}/support-groups"
    created = signed_request(
        client,
        "POST",
        collection,
        {"title": "Healing after abuse", "access": "open"},
        OPERATIONAL_SECRET,
        f"group:create:{org_id}",
    )
    assert created.status_code == 201
    group_id = created.json()["id"]
    join_path = f"/v1/support-groups/{group_id}/join"
    for secret in (SECRET, OTHER_SECRET):
        joined = client.post(
            join_path,
            headers=auth_header(BASE + join_path, "POST", body=b"", secret=secret),
            content=b"",
        )
        assert joined.status_code == 200

    recipients_path = f"/v1/support-groups/{group_id}/recipients"
    first = client.get(
        recipients_path,
        headers=auth_header(BASE + recipients_path, secret=SECRET),
    )
    second = client.get(
        recipients_path,
        headers=auth_header(BASE + recipients_path, secret=OTHER_SECRET),
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["recipients"] == [pubkey_of(OTHER_SECRET)]
    assert second.json()["recipients"] == [pubkey_of(SECRET)]
    assert first.json()["room_id"] == second.json()["room_id"]
    assert first.headers["cache-control"] == "no-store"

    with Session(get_engine()) as db:
        boxes = db.scalars(
            select(SupportGroupMembership.member_box).where(
                SupportGroupMembership.group_id == group_id
            )
        ).all()
    assert all(box and pubkey_of(SECRET) not in box for box in boxes)
    old_room_id = first.json()["room_id"]

    leave_path = f"/v1/support-groups/{group_id}/membership"
    left = client.delete(
        leave_path,
        headers=auth_header(BASE + leave_path, "DELETE", secret=OTHER_SECRET),
    )
    assert left.status_code == 200
    refreshed = client.get(
        recipients_path,
        headers=auth_header(BASE + recipients_path, secret=SECRET),
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["recipients"] == []
    assert refreshed.json()["room_id"] != old_room_id
    rejected = client.get(
        recipients_path,
        headers=auth_header(BASE + recipients_path, secret=OTHER_SECRET),
    )
    assert rejected.status_code == 403
