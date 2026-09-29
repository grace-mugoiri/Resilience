import base64
import json
import time
from typing import Annotated

import pytest
from fastapi import Depends

from app.auth.nip98 import require_nostr_auth
from app.main import app
from app.nostr.events import pubkey_of
from tests.conftest import OTHER_SECRET, SECRET, auth_header

BASE = "https://api.example.test"
WHOAMI = f"{BASE}/v1/whoami"


@app.post("/v1/_test/echo")
def _echo(pubkey: Annotated[str, Depends(require_nostr_auth)]) -> dict:
    return {"pubkey": pubkey}


ECHO = f"{BASE}/v1/_test/echo"


def test_valid_get_returns_pubkey(client):
    r = client.get("/v1/whoami", headers=auth_header(WHOAMI))
    assert r.status_code == 200
    assert r.json() == {"pubkey": pubkey_of(SECRET)}


def test_query_string_is_part_of_the_signed_url(client):
    r = client.get("/v1/whoami?x=1", headers=auth_header(WHOAMI + "?x=1"))
    assert r.status_code == 200
    r = client.get("/v1/whoami?x=2", headers=auth_header(WHOAMI + "?x=1"))
    assert r.status_code == 401


def test_the_internal_url_is_rejected(client):
    # Behind the proxy FastAPI sees http://testserver/...; clients sign the public URL.
    r = client.get("/v1/whoami", headers=auth_header("http://testserver/v1/whoami"))
    assert r.status_code == 401
    assert "'u' tag" in r.json()["detail"]


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer abc"},
        {"Authorization": "Nostr not-base64!!"},
        {"Authorization": "Nostr " + base64.b64encode(b"[1,2]").decode()},
    ],
)
def test_missing_or_garbage_header(client, headers):
    r = client.get("/v1/whoami", headers=headers)
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Nostr"


def test_bad_signature(client):
    header = auth_header(WHOAMI)
    event = json.loads(base64.b64decode(header["Authorization"][6:]))
    event["pubkey"] = pubkey_of(OTHER_SECRET)  # claim to be someone else
    token = base64.b64encode(json.dumps(event).encode()).decode()
    r = client.get("/v1/whoami", headers={"Authorization": f"Nostr {token}"})
    assert r.status_code == 401


def test_wrong_kind(client):
    assert client.get("/v1/whoami", headers=auth_header(WHOAMI, kind=1)).status_code == 401


@pytest.mark.parametrize("offset", [-120, 120])
def test_outside_time_window(client, offset):
    header = auth_header(WHOAMI, created_at=int(time.time()) + offset)
    assert client.get("/v1/whoami", headers=header).status_code == 401


def test_wrong_method(client):
    assert client.get("/v1/whoami", headers=auth_header(WHOAMI, "POST")).status_code == 401


def test_write_replay_is_rejected(client):
    body = b'{"amount_kes": 500}'
    header = auth_header(ECHO, "POST", body)
    assert client.post("/v1/_test/echo", content=body, headers=header).status_code == 200
    r = client.post("/v1/_test/echo", content=body, headers=header)
    assert r.status_code == 401
    assert "already used" in r.json()["detail"]


def test_rejected_write_does_not_burn_the_event(client):
    body = b'{"amount_kes": 500}'
    header = auth_header(ECHO, "POST", body)
    assert client.post("/v1/_test/echo", content=b"{}", headers=header).status_code == 401
    assert client.post("/v1/_test/echo", content=body, headers=header).status_code == 200


def test_identical_reads_in_the_same_second_both_pass(client):
    header = auth_header(WHOAMI)
    assert client.get("/v1/whoami", headers=header).status_code == 200
    assert client.get("/v1/whoami", headers=header).status_code == 200


def test_post_with_matching_payload(client):
    body = b'{"amount_kes": 500}'
    r = client.post("/v1/_test/echo", content=body, headers=auth_header(ECHO, "POST", body))
    assert r.status_code == 200


def test_post_without_payload_tag(client):
    body = b'{"amount_kes": 500}'
    r = client.post("/v1/_test/echo", content=body, headers=auth_header(ECHO, "POST"))
    assert r.status_code == 401


def test_post_with_tampered_body(client):
    signed = b'{"amount_kes": 500}'
    sent = b'{"amount_kes": 50000}'
    r = client.post("/v1/_test/echo", content=sent, headers=auth_header(ECHO, "POST", signed))
    assert r.status_code == 401
