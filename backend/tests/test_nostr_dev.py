import base64
import hashlib
import json

from app.nostr.events import pubkey_of, verify_event
from scripts import nostr_dev

SECRET = "19" * 32
REVIEW_PUBKEY = pubkey_of("29" * 32)


def decoded_auth(value: str) -> dict:
    assert value.startswith("Nostr ")
    event = json.loads(base64.b64decode(value.removeprefix("Nostr ")))
    assert verify_event(event)
    return event


def tag(event: dict, name: str) -> str | None:
    return next((item[1] for item in event["tags"] if item[0] == name), None)


def test_counselor_invite_command_challenges_and_signs_exact_body(monkeypatch):
    calls = []

    def fake_post(url: str, body: str, authorization: str, timeout: float = 10):
        calls.append((url, body, decoded_auth(authorization), timeout))
        if url.endswith("/v1/auth/challenges"):
            return {"challenge": "one-use-challenge"}
        return {"code": "RS-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-Z1234"}

    monkeypatch.setattr(nostr_dev, "post_json", fake_post)
    invitation = nostr_dev.create_counselor_invite(
        SECRET,
        "http://localhost:8000/",
        "org-id",
        REVIEW_PUBKEY,
        24,
    )

    assert invitation["code"].startswith("RS-")
    assert [call[0] for call in calls] == [
        "http://localhost:8000/v1/auth/challenges",
        "http://localhost:8000/v1/orgs/org-id/counselor-invites",
    ]
    challenge_body = calls[0][1]
    invite_body = calls[1][1]
    assert json.loads(challenge_body) == {"scope": "counselor:invite:org-id"}
    assert json.loads(invite_body) == {
        "credential_recipient_pubkey": REVIEW_PUBKEY,
        "expires_in_hours": 24,
    }
    assert tag(calls[1][2], "scope") == "counselor:invite:org-id"
    assert tag(calls[1][2], "challenge") == "one-use-challenge"
    assert tag(calls[1][2], "payload") == hashlib.sha256(invite_body.encode()).hexdigest()
