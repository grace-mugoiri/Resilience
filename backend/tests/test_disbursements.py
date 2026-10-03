import json

from app.nostr.events import pubkey_of
from tests.conftest import auth_header
from tests.helpers import (
    BASE,
    OPERATIONAL_SECRET,
    approved_org,
    roster_event,
    sensitive_tags,
)

COUNSELLOR_SECRET = "01" * 32


def sensitive_post(client, path: str, payload, secret: str, scope: str, extra_headers=None):
    body = json.dumps(payload).encode()
    headers = auth_header(
        BASE + path,
        "POST",
        body,
        secret,
        extra_tags=sensitive_tags(client, scope, secret),
    )
    headers.update({"Content-Type": "application/json", **(extra_headers or {})})
    return client.post(path, content=body, headers=headers)


def setup_payment_org(client):
    org_id = approved_org(scopes=["roster", "payments"])
    counsellor = pubkey_of(COUNSELLOR_SECRET)
    roster = client.put(f"/v1/orgs/{org_id}/roster", json=roster_event([counsellor]))
    assert roster.status_code == 200
    return org_id


def test_disbursement_needs_distinct_creator_and_payment_approval(client):
    org_id = setup_payment_org(client)
    path = f"/v1/orgs/{org_id}/disbursements"
    payload = {
        "amount_sat": 2500,
        "amount_kes": 2500,
        "rate_source": "test-rate",
        "reason_code": "transport",
        "note": "Needs fare to reach a shelter tonight",
    }
    created = sensitive_post(
        client,
        path,
        payload,
        COUNSELLOR_SECRET,
        f"disbursement:create:{org_id}",
        {"Idempotency-Key": "request-0001"},
    )
    assert created.status_code == 201
    assert created.json()["approval_count"] == 1
    assert created.json()["ready"] is False
    assert created.json()["note"] == "Needs fare to reach a shelter tonight"
    disbursement_id = created.json()["id"]

    approval_path = f"/v1/disbursements/{disbursement_id}/approve"
    approved = sensitive_post(
        client,
        approval_path,
        None,
        OPERATIONAL_SECRET,
        f"disbursement:approve:{disbursement_id}",
    )
    assert approved.status_code == 200
    assert approved.json()["approval_count"] == 2
    assert approved.json()["ready"] is True

    counsellor_list = client.get(
        path,
        headers=auth_header(BASE + path, secret=COUNSELLOR_SECRET),
    )
    assert counsellor_list.status_code == 200
    assert [item["id"] for item in counsellor_list.json()] == [disbursement_id]
    payment_list = client.get(
        f"{path}?state=CREATED",
        headers=auth_header(BASE + f"{path}?state=CREATED", secret=OPERATIONAL_SECRET),
    )
    assert payment_list.status_code == 200
    assert [item["id"] for item in payment_list.json()] == [disbursement_id]


def test_disbursement_idempotency_rejects_changed_body(client):
    org_id = setup_payment_org(client)
    path = f"/v1/orgs/{org_id}/disbursements"
    payload = {
        "amount_sat": 1000,
        "amount_kes": 1000,
        "rate_source": "test-rate",
        "reason_code": "food",
    }
    first = sensitive_post(
        client,
        path,
        payload,
        COUNSELLOR_SECRET,
        f"disbursement:create:{org_id}",
        {"Idempotency-Key": "request-0002"},
    )
    assert first.status_code == 201
    payload["amount_sat"] = 2000
    second = sensitive_post(
        client,
        path,
        payload,
        COUNSELLOR_SECRET,
        f"disbursement:create:{org_id}",
        {"Idempotency-Key": "request-0002"},
    )
    assert second.status_code == 409
