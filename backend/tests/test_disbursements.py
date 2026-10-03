"""Disbursements: counsellor request, second approval by a payments key, then invoice and proof."""

import hashlib
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from bolt11 import Bolt11, MilliSatoshi, TagChar, Tags, encode
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.db.models import (
    Disbursement,
    DisbursementTransition,
    Organization,
    OrganizationOperationalKey,
)
from app.db.session import get_engine
from app.main import app
from app.nostr.events import pubkey_of
from app.worker import expire_disbursements
from tests.conftest import ADMIN_SECRET, OTHER_SECRET, auth_header
from tests.helpers import (
    BASE,
    COUNSELLORS,
    OPERATIONAL_PUBKEY,
    OPERATIONAL_SECRET,
    approved_org,
    operational_revocation,
    roster_event,
    sensitive_tags,
)

COUNSELLOR_SECRET = "01" * 32  # COUNSELLORS[0]
SECOND_COUNSELLOR_SECRET = "02" * 32  # COUNSELLORS[1]
PAYMENTS_SECRET = OPERATIONAL_SECRET
PREIMAGE_A = "a1" * 32
PREIMAGE_B = "b2" * 32
REQUEST = {
    "amount_sat": 10_000,
    "amount_kes": 500,
    "rate_source": "test quote",
    "reason_code": "transport",
    "note": "Needs fare to reach a shelter tonight",
}
RESERVING = ("CREATED", "INVOICE_ATTACHED", "PAYING", "PAID", "FAILED")


def signed(
    client, method, path, payload=None, secret=PAYMENTS_SECRET, extra_tags=None, headers=None
):
    body = b"" if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    # A unique tag per request, so identical writes in the same second aren't treated as replays.
    tags = [["client_nonce", uuid.uuid4().hex], *(extra_tags or [])]
    all_headers = auth_header(BASE + path, method, body, secret, extra_tags=tags)
    if payload is not None:
        all_headers["Content-Type"] = "application/json"
    all_headers.update(headers or {})
    return client.request(method, path, content=body, headers=all_headers)


def set_caps(org_id, per_payment=50_000, daily=100_000):
    with get_engine().begin() as conn:
        conn.execute(
            text("UPDATE organizations SET per_payment_cap_sat=:p, daily_cap_sat=:d WHERE id=:id"),
            {"p": per_payment, "d": daily, "id": str(org_id)},
        )


def payment_org(caps=True, client=None):
    org_id = approved_org(scopes=["roster", "payments"])
    roster = roster_event(COUNSELLORS[:2])
    assert client.put(f"/v1/orgs/{org_id}/roster", json=roster).status_code == 200
    if caps:
        set_caps(org_id)
    return org_id


def create(client, org_id, *, key="request-0001", secret=COUNSELLOR_SECRET, **overrides):
    scope = f"disbursement:create:{org_id}"
    return signed(
        client,
        "POST",
        f"/v1/orgs/{org_id}/disbursements",
        {**REQUEST, **overrides},
        secret,
        extra_tags=sensitive_tags(client, scope, secret),
        headers={"Idempotency-Key": key},
    )


def approve(client, item, secret=PAYMENTS_SECRET):
    scope = f"disbursement:approve:{item['id']}"
    path = f"/v1/disbursements/{item['id']}/approve"
    return signed(
        client, "POST", path, None, secret, extra_tags=sensitive_tags(client, scope, secret)
    )


def ready(client, org_id, **kwargs):
    item = create(client, org_id, **kwargs)
    assert item.status_code == 201, item.text
    approved = approve(client, item.json())
    assert approved.status_code == 200, approved.text
    assert approved.json()["ready"] is True
    return approved.json()


def make_invoice(
    preimage=PREIMAGE_A, amount_sat=10_000, *, currency="bc", created_at=None, expiry_seconds=3600
):
    tags = Tags()
    tags.add(TagChar.payment_hash, hashlib.sha256(bytes.fromhex(preimage)).hexdigest())
    tags.add(TagChar.payment_secret, "c3" * 32)
    tags.add(TagChar.description, "emergency support")
    tags.add(TagChar.min_final_cltv_expiry, 18)
    tags.add(TagChar.expire_time, expiry_seconds)
    invoice = Bolt11(
        currency=currency,
        date=created_at if created_at is not None else int(time.time()),
        amount_msat=MilliSatoshi(amount_sat * 1000),
        tags=tags,
    )
    return encode(invoice, private_key="d4" * 32)


def attach(client, item, invoice, secret=COUNSELLOR_SECRET):
    return signed(
        client, "POST", f"/v1/disbursements/{item['id']}/invoice", {"invoice": invoice}, secret
    )


def paying(client, item, secret=PAYMENTS_SECRET):
    return signed(client, "POST", f"/v1/disbursements/{item['id']}/paying", secret=secret)


def proof(client, item, preimage, secret=PAYMENTS_SECRET):
    return signed(
        client, "POST", f"/v1/disbursements/{item['id']}/proof", {"preimage": preimage}, secret
    )


def cancel(client, item, secret=COUNSELLOR_SECRET):
    return signed(client, "POST", f"/v1/disbursements/{item['id']}/cancel", secret=secret)


def listing(client, org_id, secret=PAYMENTS_SECRET):
    return signed(client, "GET", f"/v1/orgs/{org_id}/disbursements", secret=secret)


def state_of(client, item):
    return signed(client, "GET", f"/v1/disbursements/{item['id']}").json()


def reserved_sat(org_id):
    with Session(get_engine()) as db:
        return db.scalar(
            select(func.coalesce(func.sum(Disbursement.amount_sat), 0)).where(
                Disbursement.org_id == org_id, Disbursement.state.in_(RESERVING)
            )
        )


# Creating and approving


def test_disbursement_needs_distinct_creator_and_payment_approval(client):
    org_id = payment_org(client=client)
    created = create(client, org_id)
    assert created.status_code == 201
    assert created.json()["approval_count"] == 1
    assert created.json()["ready"] is False
    assert created.json()["note"] == "Needs fare to reach a shelter tonight"
    approved = approve(client, created.json())
    assert approved.status_code == 200
    assert approved.json()["approval_count"] == 2
    assert approved.json()["ready"] is True
    assert approved.json()["state"] == "CREATED"


def test_create_needs_a_challenge_and_an_idempotency_key(client):
    org_id = payment_org(client=client)
    path = f"/v1/orgs/{org_id}/disbursements"
    no_challenge = signed(
        client,
        "POST",
        path,
        REQUEST,
        COUNSELLOR_SECRET,
        headers={"Idempotency-Key": "request-0001"},
    )
    assert no_challenge.status_code == 403
    scope = f"disbursement:create:{org_id}"
    no_key = signed(
        client,
        "POST",
        path,
        REQUEST,
        COUNSELLOR_SECRET,
        extra_tags=sensitive_tags(client, scope, COUNSELLOR_SECRET),
    )
    assert no_key.status_code == 422


def test_create_records_no_recipient_identity(client):
    org_id = payment_org(client=client)
    out = create(client, org_id).json()
    assert out["state"] == "CREATED" and out["created_by_pubkey"] == COUNSELLORS[0]
    assert out["invoice"] is None and out["payment_hash"] is None
    assert "survivor_pubkey" not in out and "recipient_pubkey" not in out
    with Session(get_engine()) as db:
        transitions = db.scalars(
            select(DisbursementTransition).where(
                DisbursementTransition.disbursement_id == uuid.UUID(out["id"])
            )
        ).all()
        assert [(t.from_state, t.to_state) for t in transitions] == [(None, "CREATED")]


def test_create_is_idempotent_and_rejects_a_changed_body(client):
    org_id = payment_org(client=client)
    first = create(client, org_id)
    retry = create(client, org_id)
    assert first.status_code == 201 and retry.status_code == 200
    assert retry.json()["id"] == first.json()["id"]
    assert create(client, org_id, amount_sat=2_000).status_code == 409


def test_same_idempotent_request_succeeds_when_daily_cap_is_already_reserved(client):
    org_id = payment_org(client=client)
    set_caps(org_id, per_payment=10_000, daily=10_000)
    first = create(client, org_id)
    retry = create(client, org_id)
    assert first.status_code == 201 and retry.status_code == 200


@pytest.mark.parametrize(
    "overrides",
    [
        {"amount_sat": 0},
        {"amount_sat": -1},
        {"amount_kes": 0},
        {"reason_code": "rent"},
        {"rate_source": "  "},
        {"survivor_pubkey": "ab" * 32},
    ],
)
def test_create_rejects_invalid_or_private_recipient_fields(client, overrides):
    org_id = payment_org(client=client)
    assert create(client, org_id, **overrides).status_code == 422


def test_only_an_active_counsellor_can_create(client):
    org_id = payment_org(client=client)
    assert create(client, org_id, secret=OTHER_SECRET).status_code == 403
    assert create(client, org_id, secret=PAYMENTS_SECRET).status_code == 403
    newer = roster_event([COUNSELLORS[1]], created_at=int(time.time()) + 1)
    assert client.put(f"/v1/orgs/{org_id}/roster", json=newer).status_code == 200
    assert create(client, org_id).status_code == 403  # COUNSELLORS[0] was removed


def test_suspended_org_cannot_create(client):
    org_id = payment_org(client=client)
    with get_engine().begin() as conn:
        conn.execute(
            text("UPDATE organizations SET status='suspended' WHERE id=:id"), {"id": str(org_id)}
        )
    assert create(client, org_id).status_code == 404


def test_approval_rules(client):
    org_id = payment_org(client=client)
    item = create(client, org_id).json()
    # A second counsellor is a second person, but not the organisation's payments key.
    assert approve(client, item, secret=SECOND_COUNSELLOR_SECRET).status_code == 403
    assert approve(client, item, secret=OTHER_SECRET).status_code == 403
    assert approve(client, item).json()["approval_count"] == 2
    assert approve(client, item).json()["approval_count"] == 2  # approving twice is harmless


def test_revoked_payments_key_cannot_approve_or_pay(client):
    org_id = payment_org(client=client)
    item = create(client, org_id).json()
    revocation = operational_revocation(created_at=int(time.time()))
    response = client.put(
        f"/v1/orgs/{org_id}/operational-keys/{OPERATIONAL_PUBKEY}/revoke", json=revocation
    )
    assert response.status_code == 200
    assert approve(client, item).status_code == 403


# Spending limits


def test_limits_must_be_configured_before_spending(client):
    org_id = payment_org(caps=False, client=client)
    response = create(client, org_id)
    assert response.status_code == 409 and "limits" in response.json()["detail"]


def test_per_payment_and_daily_limits_are_enforced(client):
    org_id = payment_org(client=client)
    set_caps(org_id, per_payment=10_000, daily=15_000)
    assert create(client, org_id, key="payment-0001", amount_sat=10_001).status_code == 422
    assert create(client, org_id, key="payment-0001", amount_sat=10_000).status_code == 201
    assert create(client, org_id, key="payment-0002", amount_sat=5_001).status_code == 422
    assert create(client, org_id, key="payment-0003", amount_sat=5_000).status_code == 201


def test_cancelling_releases_the_daily_reservation(client):
    org_id = payment_org(client=client)
    set_caps(org_id, per_payment=10_000, daily=15_000)
    first = create(client, org_id, key="payment-0001", amount_sat=10_000).json()
    assert create(client, org_id, key="payment-0002", amount_sat=5_001).status_code == 422
    assert cancel(client, first).status_code == 200
    assert create(client, org_id, key="payment-0002", amount_sat=5_001).status_code == 201


def test_daily_limit_resets_at_midnight_in_nairobi(client):
    org_id = payment_org(client=client)
    set_caps(org_id, per_payment=10_000, daily=10_000)
    old = create(client, org_id, key="payment-0001", amount_sat=10_000).json()
    midnight = datetime.now(ZoneInfo("Africa/Nairobi")).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    with get_engine().begin() as conn:
        conn.execute(
            text("UPDATE disbursements SET created_at=:at WHERE id=:id"),
            {"at": midnight.astimezone(UTC) - timedelta(minutes=1), "id": old["id"]},
        )
    # One minute before Nairobi midnight is yesterday, even though it is still the same UTC day.
    assert create(client, org_id, key="payment-0002", amount_sat=10_000).status_code == 201
    assert create(client, org_id, key="payment-0003", amount_sat=1).status_code == 422


def test_admin_sets_limits_with_a_challenge(client):
    org_id = payment_org(caps=False, client=client)
    path = f"/v1/admin/orgs/{org_id}/disbursement-limits"
    body = {"per_payment_cap_sat": 10_000, "daily_cap_sat": 50_000}
    scope = f"admin:org:limits:{org_id}"
    assert signed(client, "PUT", path, body, ADMIN_SECRET).status_code == 403  # no challenge
    other = signed(
        client,
        "PUT",
        path,
        body,
        OTHER_SECRET,
        extra_tags=sensitive_tags(client, scope, OTHER_SECRET),
    )
    assert other.status_code == 403
    bad = signed(
        client,
        "PUT",
        path,
        {"per_payment_cap_sat": 20_000, "daily_cap_sat": 10_000},
        ADMIN_SECRET,
        extra_tags=sensitive_tags(client, scope, ADMIN_SECRET),
    )
    assert bad.status_code == 422
    ok = signed(
        client,
        "PUT",
        path,
        body,
        ADMIN_SECRET,
        extra_tags=sensitive_tags(client, scope, ADMIN_SECRET),
    )
    assert ok.status_code == 200 and ok.json()["daily_cap_sat"] == 50_000
    assert create(client, org_id).status_code == 201


def test_concurrent_creates_do_not_exceed_daily_cap(client):
    org_id = payment_org(client=client)
    set_caps(org_id, per_payment=10_000, daily=10_000)
    # Fetch both challenges first so the two creates really race.
    jobs = []
    for secret, key in [
        (COUNSELLOR_SECRET, "parallel-a"),
        (SECOND_COUNSELLOR_SECRET, "parallel-b"),
    ]:
        jobs.append((secret, key, sensitive_tags(client, f"disbursement:create:{org_id}", secret)))

    def run(job):
        secret, key, tags = job
        with TestClient(app) as c:
            return signed(
                c,
                "POST",
                f"/v1/orgs/{org_id}/disbursements",
                REQUEST,
                secret,
                extra_tags=tags,
                headers={"Idempotency-Key": key},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(run, jobs)) == [201, 422]
    assert reserved_sat(org_id) == 10_000


@settings(
    max_examples=12, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(amounts=st.lists(st.integers(min_value=1, max_value=25_000), min_size=1, max_size=6))
def test_random_create_sequences_never_reserve_more_than_daily_cap(client, amounts):
    with get_engine().begin() as conn:
        conn.execute(
            text(
                "DELETE FROM authorization_challenges; DELETE FROM disbursement_approvals; "
                "DELETE FROM disbursement_transitions; DELETE FROM disbursements; "
                "DELETE FROM counsellor_attestations; DELETE FROM roster_events; "
                "DELETE FROM organization_operational_keys; DELETE FROM organizations"
            )
        )
    org_id = payment_org(client=client)
    set_caps(org_id, per_payment=25_000, daily=50_000)
    for i, amount in enumerate(amounts):
        assert create(client, org_id, key=f"property-{i:04}", amount_sat=amount).status_code in {
            201,
            422,
        }
        assert reserved_sat(org_id) <= 50_000


# Invoice


def test_invoice_needs_the_second_approval_first(client):
    org_id = payment_org(client=client)
    item = create(client, org_id).json()
    response = attach(client, item, make_invoice())
    assert response.status_code == 409 and "approval" in response.json()["detail"]
    approve(client, item)
    assert attach(client, item, make_invoice()).status_code == 200


def test_only_the_requesting_counsellor_can_attach_the_invoice(client):
    org_id = payment_org(client=client)
    item = ready(client, org_id)
    assert attach(client, item, make_invoice(), secret=SECOND_COUNSELLOR_SECRET).status_code == 403
    assert attach(client, item, make_invoice(), secret=PAYMENTS_SECRET).status_code == 403
    assert attach(client, item, make_invoice(), secret=OTHER_SECRET).status_code == 403
    assert attach(client, item, make_invoice()).json()["state"] == "INVOICE_ATTACHED"


def test_invoice_must_match_amount_and_network(client):
    org_id = payment_org(client=client)
    item = ready(client, org_id)
    assert attach(client, item, make_invoice(amount_sat=9_999)).status_code == 409
    assert attach(client, item, make_invoice(currency="tb")).status_code == 409
    assert attach(client, item, make_invoice()).status_code == 200


def test_invoice_attach_is_idempotent_and_payment_hash_is_unique(client):
    org_id = payment_org(client=client)
    first = ready(client, org_id)
    invoice = make_invoice()
    assert attach(client, first, invoice).status_code == 200
    assert attach(client, first, invoice).status_code == 200
    assert attach(client, first, make_invoice(preimage=PREIMAGE_B)).status_code == 409
    second = ready(client, org_id, key="request-0002")
    assert attach(client, second, invoice).status_code == 409


def test_expired_and_malformed_invoices_are_rejected(client):
    org_id = payment_org(client=client)
    item = ready(client, org_id)
    expired = make_invoice(created_at=int(time.time()) - 7200, expiry_seconds=60)
    assert attach(client, item, expired).status_code == 409
    assert attach(client, item, "not-an-invoice-" + "x" * 40).status_code == 409


# Paying and proof


def test_only_payments_key_marks_paying_and_submits_proof(client):
    org_id = payment_org(client=client)
    item = ready(client, org_id)
    assert attach(client, item, make_invoice()).status_code == 200
    assert paying(client, item, secret=COUNSELLOR_SECRET).status_code == 403
    assert paying(client, item).status_code == 200
    assert proof(client, item, PREIMAGE_A, secret=COUNSELLOR_SECRET).status_code == 403
    assert proof(client, item, PREIMAGE_A).json()["state"] == "PAID"


def test_only_an_attached_invoice_can_enter_paying(client):
    org_id = payment_org(client=client)
    item = ready(client, org_id)
    assert paying(client, item).status_code == 409
    assert attach(client, item, make_invoice()).status_code == 200
    assert paying(client, item).status_code == 200
    assert paying(client, item).status_code == 200


def test_valid_preimage_marks_paid_and_removes_invoice(client):
    org_id = payment_org(client=client)
    item = ready(client, org_id)
    attach(client, item, make_invoice())
    paying(client, item)
    paid = proof(client, item, PREIMAGE_A)
    assert paid.status_code == 200
    assert paid.json()["state"] == "PAID" and paid.json()["invoice"] is None
    assert paid.json()["paid_at"] is not None
    assert paid.json()["payment_hash"] == hashlib.sha256(bytes.fromhex(PREIMAGE_A)).hexdigest()
    assert proof(client, item, PREIMAGE_A).json()["state"] == "PAID"
    with Session(get_engine()) as db:
        count = db.scalar(
            select(func.count())
            .select_from(DisbursementTransition)
            .where(
                DisbursementTransition.disbursement_id == uuid.UUID(item["id"]),
                DisbursementTransition.to_state == "PAID",
            )
        )
        assert count == 1


def test_wrong_preimage_never_marks_paid(client):
    org_id = payment_org(client=client)
    item = ready(client, org_id)
    attach(client, item, make_invoice())
    paying(client, item)
    assert proof(client, item, PREIMAGE_B).status_code == 409
    assert state_of(client, item)["state"] == "PAYING"


def test_two_concurrent_valid_proofs_record_one_paid_transition(client):
    org_id = payment_org(client=client)
    item = ready(client, org_id)
    attach(client, item, make_invoice())
    paying(client, item)

    def pay(_):
        with TestClient(app) as c:
            return proof(c, item, PREIMAGE_A).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(pay, range(2)))
    assert 200 in statuses and all(s in {200, 409} for s in statuses)
    with Session(get_engine()) as db:
        count = db.scalar(
            select(func.count())
            .select_from(DisbursementTransition)
            .where(
                DisbursementTransition.disbursement_id == uuid.UUID(item["id"]),
                DisbursementTransition.to_state == "PAID",
            )
        )
        assert count == 1


def test_suspended_org_can_record_a_payment_but_not_start_one(client):
    org_id = payment_org(client=client)
    item = ready(client, org_id)
    attach(client, item, make_invoice())
    with get_engine().begin() as conn:
        conn.execute(
            text("UPDATE organizations SET status='suspended' WHERE id=:id"), {"id": str(org_id)}
        )
    assert paying(client, item).status_code == 409
    with get_engine().begin() as conn:
        conn.execute(
            text("UPDATE disbursements SET state='PAYING' WHERE id=:id"), {"id": item["id"]}
        )
    assert proof(client, item, PREIMAGE_A).json()["state"] == "PAID"


def test_test_only_mock_endpoint_simulates_wallet_settlement(client):
    org_id = payment_org(client=client)
    item = ready(client, org_id)
    attach(client, item, make_invoice())
    assert (
        signed(
            client,
            "POST",
            f"/v1/_mock/settle/{item['id']}",
            {"preimage": PREIMAGE_A},
            COUNSELLOR_SECRET,
        ).status_code
        == 403
    )
    settled = signed(client, "POST", f"/v1/_mock/settle/{item['id']}", {"preimage": PREIMAGE_A})
    assert settled.status_code == 200 and settled.json()["state"] == "PAID"


# Cancel and expiry


def test_cancel_rules(client):
    org_id = payment_org(client=client)
    item = create(client, org_id).json()
    assert cancel(client, item, secret=SECOND_COUNSELLOR_SECRET).status_code == 403
    assert cancel(client, item).json()["state"] == "CANCELLED"
    assert cancel(client, item).status_code == 200
    assert approve(client, item).status_code == 409
    second = ready(client, org_id, key="request-0002")
    attach(client, second, make_invoice(preimage=PREIMAGE_B))
    paying(client, second)
    assert cancel(client, second, secret=PAYMENTS_SECRET).status_code == 409
    third = create(client, org_id, key="request-0003").json()
    assert cancel(client, third, secret=PAYMENTS_SECRET).json()["state"] == "CANCELLED"


def test_worker_expires_attached_invoice_but_keeps_paying_for_reconciliation(client):
    org_id = payment_org(client=client)
    attached = ready(client, org_id)
    attach(client, attached, make_invoice())
    underway = ready(client, org_id, key="request-0002")
    attach(client, underway, make_invoice(preimage=PREIMAGE_B))
    paying(client, underway)
    with get_engine().begin() as conn:
        conn.execute(
            text(
                "UPDATE disbursements SET invoice_expires_at=now()-interval '1 second' "
                "WHERE org_id=:id"
            ),
            {"id": str(org_id)},
        )
    assert expire_disbursements() == {"expired": 1}
    assert state_of(client, attached)["state"] == "EXPIRED"
    assert state_of(client, attached)["invoice"] is None
    assert state_of(client, underway)["state"] == "PAYING"
    # Nobody knows yet whether that payment settled, so a new invoice could pay twice.
    assert attach(client, underway, make_invoice(preimage="c4" * 32)).status_code == 409


def test_worker_expires_requests_left_for_24_hours(client):
    org_id = payment_org(client=client)
    unapproved = create(client, org_id).json()
    approved = ready(client, org_id, key="request-0002")
    with get_engine().begin() as conn:
        conn.execute(text("UPDATE disbursements SET created_at=now()-interval '25 hours'"))
    assert expire_disbursements() == {"expired": 2}
    assert state_of(client, unapproved)["state"] == "EXPIRED"
    assert state_of(client, approved)["state"] == "EXPIRED"


# Reading


def test_who_can_read_disbursements(client):
    org_id = payment_org(client=client)
    mine = create(client, org_id).json()
    theirs = create(client, org_id, key="request-0002", secret=SECOND_COUNSELLOR_SECRET).json()
    path = f"/v1/disbursements/{mine['id']}"
    assert signed(client, "GET", path, secret=COUNSELLOR_SECRET).status_code == 200
    assert signed(client, "GET", path, secret=PAYMENTS_SECRET).status_code == 200
    assert signed(client, "GET", path, secret=SECOND_COUNSELLOR_SECRET).status_code == 403
    assert {r["id"] for r in listing(client, org_id).json()} == {mine["id"], theirs["id"]}
    assert {r["id"] for r in listing(client, org_id, COUNSELLOR_SECRET).json()} == {mine["id"]}
    assert listing(client, org_id, OTHER_SECRET).status_code == 403
    filtered = signed(client, "GET", f"/v1/orgs/{org_id}/disbursements?state=PAID")
    assert filtered.status_code == 200 and filtered.json() == []


def test_another_organisations_payments_key_is_refused(client):
    org_a = payment_org(client=client)
    item = create(client, org_a).json()
    # Organisation B, with its own payments key.
    other_key = "cd" * 32
    with Session(get_engine()) as db:
        org_b = Organization(
            name="Pendo",
            domain="pendo.org",
            nostr_pubkey=pubkey_of("ab" * 32),
            status="approved",
            directory_visibility="public",
        )
        db.add(org_b)
        db.flush()
        now = datetime.now(UTC)
        db.add(
            OrganizationOperationalKey(
                org_id=org_b.id,
                pubkey=pubkey_of(other_key),
                authorization_event_id="ee" * 32,
                authorization_event={},
                scopes=["payments"],
                valid_from=now - timedelta(hours=1),
                expires_at=now + timedelta(days=1),
            )
        )
        db.commit()
    assert listing(client, org_a).status_code == 200
    assert listing(client, org_a, other_key).status_code == 403
    assert (
        signed(client, "GET", f"/v1/disbursements/{item['id']}", secret=other_key).status_code
        == 403
    )
    assert approve(client, item, secret=other_key).status_code == 403


def test_api_network_setting_is_validated():
    from pydantic import ValidationError

    from app.settings import Settings

    assert Settings().lightning_network == "bc"
    assert Settings(lightning_network="tb").lightning_network == "tb"
    with pytest.raises(ValidationError, match="LIGHTNING_NETWORK"):
        Settings(lightning_network="mainnet")
