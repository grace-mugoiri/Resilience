import json
import time

import pytest

from app.nostr.events import pubkey_of, sign_event
from app.settings import get_settings
from tests.conftest import OTHER_SECRET, SECRET


def _use(client_app, tmp_path, event, pubkey):
    path = tmp_path / "signed.json"
    path.write_text(json.dumps(event))
    settings = get_settings().model_copy(
        update={"signed_config_path": str(path), "platform_pubkey": pubkey}
    )
    client_app.dependency_overrides[get_settings] = lambda: settings


def _config_event(
    secret=SECRET, *, kind=30078, d="resilience/client-config", content=None, expiry=None
):
    content = content or {
        "schema_version": 1,
        "relays": ["wss://one.example.test", "wss://two.example.test"],
    }
    expiration = int(time.time()) + 86400 if expiry is None else expiry
    return sign_event(
        secret,
        kind,
        [["d", d], ["expiration", str(expiration)]],
        json.dumps(content),
    )


def test_not_configured_is_503(client):
    assert client.get("/v1/config").status_code == 503


def test_serves_signed_config(client, tmp_path):
    event = _config_event()
    _use(client.app, tmp_path, event, pubkey_of(SECRET))
    r = client.get("/v1/config")
    assert r.status_code == 200
    assert r.json() == event


def test_refuses_config_signed_by_another_key(client, tmp_path):
    _use(client.app, tmp_path, _config_event(OTHER_SECRET), pubkey_of(SECRET))
    assert client.get("/v1/config").status_code == 500


def test_refuses_tampered_config(client, tmp_path):
    event = _config_event()
    event["content"] = json.dumps({"relays": ["wss://evil.example.test"]})
    _use(client.app, tmp_path, event, pubkey_of(SECRET))
    assert client.get("/v1/config").status_code == 500


@pytest.mark.parametrize(
    "event",
    [
        _config_event(kind=1),
        _config_event(d="wrong"),
        _config_event(expiry=1),
        _config_event(content={"schema_version": 2, "relays": ["wss://a.test", "wss://b.test"]}),
        _config_event(content={"schema_version": 1, "relays": ["wss://only.test"]}),
        _config_event(
            content={"schema_version": 1, "relays": ["wss://same.test", "wss://same.test"]}
        ),
        _config_event(content={"schema_version": 1, "relays": ["https://a.test", "wss://b.test"]}),
        _config_event(
            content={"schema_version": 1, "relays": ["wss://a.test", "wss://b.test"], "extra": 1}
        ),
    ],
    ids=["kind", "d-tag", "expired", "schema-version", "relay-count", "duplicate", "url", "extra"],
)
def test_refuses_invalid_signed_config_schema(client, tmp_path, event):
    _use(client.app, tmp_path, event, pubkey_of(SECRET))
    assert client.get("/v1/config").status_code == 500
