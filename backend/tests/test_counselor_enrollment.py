import base64
import json
import secrets
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.db.models import CounsellorInvite
from app.db.session import get_engine
from app.nostr.events import pubkey_of
from tests.conftest import auth_header
from tests.helpers import (
    BASE,
    OPERATIONAL_SECRET,
    approved_org,
    profile_event,
    roster_event,
    sensitive_tags,
)

COUNSELLOR_SECRET = "09" * 32
COUNSELLOR_PUBKEY = pubkey_of(COUNSELLOR_SECRET)
REVIEW_KEY = pubkey_of("0c" * 32)


def request(
    client,
    method: str,
    path: str,
    payload,
    secret: str,
    scope: str | None = None,
):
    body = json.dumps(payload, separators=(",", ":")).encode()
    tags = [["client_nonce", secrets.token_hex(8)]]
    if scope:
        tags += sensitive_tags(client, scope, secret)
    headers = auth_header(BASE + path, method, body, secret, extra_tags=tags)
    headers["Content-Type"] = "application/json"
    return client.request(method, path, content=body, headers=headers)


def signed_get(client, path: str, secret: str):
    return client.get(
        path,
        headers=auth_header(
            BASE + path,
            "GET",
            secret=secret,
            extra_tags=[["client_nonce", secrets.token_hex(8)]],
        ),
    )


def create_invite(client, org_id):
    path = f"/v1/orgs/{org_id}/counselor-invites"
    payload = {
        "credential_recipient_pubkey": REVIEW_KEY,
        "expires_in_hours": 24,
    }
    response = request(
        client,
        "POST",
        path,
        payload,
        OPERATIONAL_SECRET,
        f"counselor:invite:{org_id}",
    )
    assert response.status_code == 201, response.text
    return response.json()


def claim(client, code: str, secret: str = COUNSELLOR_SECRET):
    path = "/v1/counselor-enrollments/claim"
    payload = {"invite_code": code, "profile_event": profile_event(secret)}
    return request(client, "POST", path, payload, secret)


def credentials_payload(recipient: str = REVIEW_KEY):
    return {
        "documents": [
            {
                "v": 1,
                "algorithm": "aes-256-gcm+nip44-v2",
                "recipient_pubkey": recipient,
                "wrapped_key": base64.b64encode(bytes([2]) + bytes(98)).decode(),
                "iv": base64.b64encode(bytes(12)).decode(),
                "ciphertext": base64.b64encode(bytes(17)).decode(),
                "media_type": "application/pdf",
            }
        ]
    }


def submit_credentials(client, enrollment_id: str, recipient: str = REVIEW_KEY):
    path = f"/v1/counselor-enrollments/{enrollment_id}/credentials"
    return request(
        client,
        "PUT",
        path,
        credentials_payload(recipient),
        COUNSELLOR_SECRET,
        f"counselor:credentials:{enrollment_id}",
    )


def review(client, org_id, enrollment_id, action: str, message: str | None = None):
    path = f"/v1/orgs/{org_id}/counselor-enrollments/{enrollment_id}/{action}"
    return request(
        client,
        "POST",
        path,
        {"message": message},
        OPERATIONAL_SECRET,
        f"counselor:review:{org_id}",
    )


def test_complete_enrollment_requires_review_and_roster(client):
    org_id = approved_org(scopes=["roster", "verification"])
    invitation = create_invite(client, org_id)
    assert invitation["code"].startswith("RS-")
    assert invitation["credential_recipient_pubkey"] == REVIEW_KEY

    invitations_path = f"/v1/orgs/{org_id}/counselor-invites"
    invitations = signed_get(client, invitations_path, OPERATIONAL_SECRET)
    assert invitations.status_code == 200, invitations.text
    assert invitations.json()[0]["id"] == invitation["id"]
    assert invitations.json()[0]["used_at"] is None
    assert "code" not in invitations.json()[0]
    assert "code_hash" not in invitations.json()[0]

    response = claim(client, invitation["code"])
    assert response.status_code == 201, response.text
    enrollment = response.json()
    enrollment_id = enrollment["id"]
    assert enrollment["status"] == "draft"
    assert enrollment["directory_status"] is None

    mine = signed_get(client, "/v1/counselor-enrollments", COUNSELLOR_SECRET)
    assert mine.status_code == 200, mine.text
    assert [item["id"] for item in mine.json()] == [enrollment_id]

    # A one-use code cannot be claimed again, even by its intended caller.
    assert claim(client, invitation["code"]).status_code == 404

    submitted = submit_credentials(client, enrollment_id)
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "under_review"
    assert submitted.json()["encrypted_credentials"][0]["wrapped_key"].startswith("Ag")

    queue_path = f"/v1/orgs/{org_id}/counselor-enrollments?status=under_review"
    queue = signed_get(client, queue_path, OPERATIONAL_SECRET)
    assert queue.status_code == 200, queue.text
    assert [item["id"] for item in queue.json()] == [enrollment_id]

    approved = review(client, org_id, enrollment_id, "approve")
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert approved.json()["directory_status"] is None
    assert approved.json()["encrypted_credentials"] is None

    # Review approval is deliberately insufficient: an organization-signed roster is required.
    roster = client.put(f"/v1/orgs/{org_id}/roster", json=roster_event([COUNSELLOR_PUBKEY]))
    assert roster.status_code == 200, roster.text
    listed = roster.json()["counsellors"]
    assert listed[0]["pubkey"] == COUNSELLOR_PUBKEY
    assert listed[0]["status"] == "verified"
    assert listed[0]["profile"]["name"] == "Counsellor Grace"

    status_path = f"/v1/counselor-enrollments/{enrollment_id}"
    status_response = signed_get(client, status_path, COUNSELLOR_SECRET)
    assert status_response.status_code == 200
    assert status_response.json()["directory_status"] == "verified"


def test_more_information_deletes_old_ciphertext_and_allows_resubmission(client):
    org_id = approved_org(scopes=["roster", "verification"])
    enrollment_id = claim(client, create_invite(client, org_id)["code"]).json()["id"]
    assert submit_credentials(client, enrollment_id).status_code == 200

    response = review(
        client,
        org_id,
        enrollment_id,
        "request-information",
        "Please send a clearer encrypted copy.",
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "more_information"
    assert response.json()["encrypted_credentials"] is None
    assert response.json()["review_message"] == "Please send a clearer encrypted copy."

    resubmitted = submit_credentials(client, enrollment_id)
    assert resubmitted.status_code == 200, resubmitted.text
    assert resubmitted.json()["status"] == "under_review"
    assert resubmitted.json()["review_message"] is None


def test_credentials_must_be_encrypted_to_invitation_review_key(client):
    org_id = approved_org(scopes=["verification"])
    enrollment_id = claim(client, create_invite(client, org_id)["code"]).json()["id"]
    wrong_key = pubkey_of("0d" * 32)
    response = submit_credentials(client, enrollment_id, wrong_key)
    assert response.status_code == 422
    assert "invitation review key" in response.text


def test_invites_expire_and_raw_codes_are_not_stored(client):
    org_id = approved_org(scopes=["verification"])
    invitation = create_invite(client, org_id)
    with Session(get_engine()) as db:
        invite = db.get(CounsellorInvite, invitation["id"])
        assert invite is not None
        assert invitation["code"] not in invite.code_hash
        invite.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    assert claim(client, invitation["code"]).status_code == 404


def test_counsellor_can_only_read_own_application(client):
    org_id = approved_org(scopes=["verification"])
    enrollment_id = claim(client, create_invite(client, org_id)["code"]).json()["id"]
    path = f"/v1/counselor-enrollments/{enrollment_id}"
    stranger = signed_get(client, path, "0e" * 32)
    assert stranger.status_code == 404


def test_review_requires_verification_scoped_operational_key(client):
    org_id = approved_org(scopes=["roster"])
    path = f"/v1/orgs/{org_id}/counselor-invites"
    response = request(
        client,
        "POST",
        path,
        {"credential_recipient_pubkey": REVIEW_KEY},
        OPERATIONAL_SECRET,
        f"counselor:invite:{org_id}",
    )
    assert response.status_code == 403


def test_plaintext_document_metadata_is_rejected(client):
    org_id = approved_org(scopes=["verification"])
    enrollment_id = claim(client, create_invite(client, org_id)["code"]).json()["id"]
    path = f"/v1/counselor-enrollments/{enrollment_id}/credentials"
    payload = credentials_payload()
    payload["documents"][0]["filename"] = "license.pdf"
    response = request(
        client,
        "PUT",
        path,
        payload,
        COUNSELLOR_SECRET,
        f"counselor:credentials:{enrollment_id}",
    )
    assert response.status_code == 422


def test_profile_update_must_be_newer_and_signed_by_counsellor(client):
    org_id = approved_org(scopes=["verification"])
    enrollment_id = claim(client, create_invite(client, org_id)["code"]).json()["id"]
    path = f"/v1/counselor-enrollments/{enrollment_id}/profile"
    newer = profile_event(COUNSELLOR_SECRET, created_at=int(time.time()) + 1)
    response = request(
        client,
        "PUT",
        path,
        {"profile_event": newer},
        COUNSELLOR_SECRET,
    )
    assert response.status_code == 200, response.text
    assert response.json()["profile_event"]["id"] == newer["id"]

    wrong = profile_event("0f" * 32, created_at=int(time.time()) + 2)
    rejected = request(
        client,
        "PUT",
        path,
        {"profile_event": wrong},
        COUNSELLOR_SECRET,
    )
    assert rejected.status_code == 403
