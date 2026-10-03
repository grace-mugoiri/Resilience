from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import PrivateCircleMember
from app.db.session import get_engine
from app.nostr.events import pubkey_of
from tests.conftest import OTHER_SECRET, SECRET, auth_header
from tests.helpers import BASE


def _request(client, method: str, path: str, secret: str, json=None):
    body = b"" if json is None else __import__("json").dumps(json).encode()
    headers = auth_header(BASE + path, method, body=body, secret=secret)
    if json is not None:
        headers["Content-Type"] = "application/json"
    return client.request(method, path, content=body, headers=headers)


def test_circle_recipient_keys_are_member_only_encrypted_and_rotating(client):
    invite = _request(client, "POST", "/v1/circle/invites", SECRET)
    assert invite.status_code == 201
    circle_id = invite.json()["circle_id"]
    claim = _request(
        client,
        "POST",
        "/v1/circle/invites/claim",
        OTHER_SECRET,
        {"code": invite.json()["code"]},
    )
    assert claim.status_code == 200

    path = "/v1/circle/recipients"
    owner_view = _request(client, "GET", path, SECRET)
    member_view = _request(client, "GET", path, OTHER_SECRET)
    assert owner_view.status_code == member_view.status_code == 200
    assert owner_view.json()["recipients"] == [pubkey_of(OTHER_SECRET)]
    assert member_view.json()["recipients"] == [pubkey_of(SECRET)]
    assert owner_view.json()["room_id"] == member_view.json()["room_id"]
    assert owner_view.headers["cache-control"] == "no-store"

    with Session(get_engine()) as db:
        boxes = db.scalars(
            select(PrivateCircleMember.member_box).where(PrivateCircleMember.circle_id == circle_id)
        ).all()
    assert all(box and pubkey_of(SECRET) not in box for box in boxes)

    old_room_id = owner_view.json()["room_id"]
    remove_path = f"/v1/circle/{circle_id}/members/{pubkey_of(OTHER_SECRET)}"
    removed = _request(client, "DELETE", remove_path, SECRET)
    assert removed.status_code == 200
    refreshed = _request(client, "GET", path, SECRET)
    assert refreshed.status_code == 200
    assert refreshed.json()["recipients"] == []
    assert refreshed.json()["room_id"] != old_room_id
    assert _request(client, "GET", path, OTHER_SECRET).status_code == 404


def test_routing_key_refresh_requires_an_active_member(client):
    assert _request(client, "PUT", "/v1/circle/routing-key", SECRET).status_code == 404
