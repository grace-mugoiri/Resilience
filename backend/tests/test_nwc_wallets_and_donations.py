import hashlib
import json
import time
import uuid
from urllib.parse import urlencode

from bolt11 import Bolt11, MilliSatoshi, TagChar, Tags, encode

from app.main import app
from app.nostr.events import pubkey_of
from app.nwc.client import NwcTransportError, get_nwc_client
from tests.conftest import auth_header
from tests.helpers import BASE, OPERATIONAL_SECRET, approved_org, sensitive_tags
from tests.test_disbursements import attach, payment_org, ready

WALLET_SECRET = "33" * 32
CLIENT_SECRET = "44" * 32
PREIMAGE = "55" * 32


def make_invoice(amount_sat: int, *, preimage: str = PREIMAGE) -> str:
    tags = Tags()
    tags.add(TagChar.payment_hash, hashlib.sha256(bytes.fromhex(preimage)).hexdigest())
    tags.add(TagChar.payment_secret, "66" * 32)
    tags.add(TagChar.description, "donation")
    tags.add(TagChar.min_final_cltv_expiry, 18)
    tags.add(TagChar.expire_time, 600)
    return encode(
        Bolt11(
            currency="bc",
            date=int(time.time()),
            amount_msat=MilliSatoshi(amount_sat * 1000),
            tags=tags,
        ),
        private_key=WALLET_SECRET,
    )


class FakeNwcClient:
    def __init__(self):
        self.settled = False
        self.payment_unknown = False
        self.calls: list[tuple[str, dict]] = []

    async def request(self, _credentials, method, params=None):
        params = params or {}
        self.calls.append((method, params))
        if method == "get_info":
            return {
                "alias": "Test wallet",
                "network": "mainnet",
                "methods": [
                    "get_info",
                    "get_balance",
                    "make_invoice",
                    "lookup_invoice",
                    "pay_invoice",
                ],
            }
        if method == "get_balance":
            return {"balance": 2_100_000}
        if method == "make_invoice":
            return {"invoice": make_invoice(params["amount"] // 1000)}
        if method == "lookup_invoice":
            return (
                {
                    "state": "settled",
                    "settled_at": int(time.time()),
                    "preimage": PREIMAGE,
                }
                if self.settled
                else {"state": "pending"}
            )
        if method == "pay_invoice":
            if self.payment_unknown:
                raise NwcTransportError("wallet response timed out")
            return {"preimage": PREIMAGE}
        raise AssertionError(method)


def signed(client, method, path, payload=None, *, sensitive_scope=None):
    body = b"" if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    extra_tags = [["client_nonce", uuid.uuid4().hex]]
    if sensitive_scope:
        extra_tags.extend(sensitive_tags(client, sensitive_scope, OPERATIONAL_SECRET))
    headers = auth_header(
        BASE + path,
        method,
        body,
        OPERATIONAL_SECRET,
        extra_tags=extra_tags,
    )
    if payload is not None:
        headers["Content-Type"] = "application/json"
    return client.request(method, path, content=body, headers=headers)


def connect(client, fake: FakeNwcClient, org_id):
    app.dependency_overrides[get_nwc_client] = lambda: fake
    query = urlencode(
        [
            ("relay", "ws://localhost:7777"),
            ("relay", "ws://localhost:7778"),
            ("secret", CLIENT_SECRET),
        ]
    )
    uri = f"nostr+walletconnect://{pubkey_of(WALLET_SECRET)}?{query}"
    path = f"/v1/orgs/{org_id}/wallet"
    response = signed(
        client,
        "PUT",
        path,
        {"connection_uri": uri},
        sensitive_scope=f"wallet:connect:{org_id}",
    )
    assert response.status_code == 200, response.text
    return response


def test_wallet_connection_hides_secret_and_reads_live_balance(client):
    org_id = approved_org(scopes=["payments"])
    fake = FakeNwcClient()
    connected = connect(client, fake, org_id).json()
    assert connected["alias"] == "Test wallet"
    assert CLIENT_SECRET not in json.dumps(connected)

    balance = signed(client, "GET", f"/v1/orgs/{org_id}/wallet/balance")
    assert balance.status_code == 200
    assert balance.json() == {"balance_msat": 2_100_000, "balance_sat": 2_100}


def test_anonymous_donation_creates_invoice_and_reconciles_settlement(client):
    org_id = approved_org(scopes=["payments"])
    fake = FakeNwcClient()
    connect(client, fake, org_id)

    created = client.post(f"/v1/orgs/{org_id}/donations", json={"amount_sat": 21_000})
    assert created.status_code == 201, created.text
    donation = created.json()
    assert donation["state"] == "PENDING"
    assert donation["amount_sat"] == 21_000
    assert donation["invoice"].startswith("lnbc")
    assert "donor" not in donation

    pending = client.get(f"/v1/donations/{donation['id']}")
    assert pending.status_code == 200 and pending.json()["state"] == "PENDING"

    fake.settled = True
    paid = client.get(f"/v1/donations/{donation['id']}")
    assert paid.status_code == 200
    assert paid.json()["state"] == "PAID"
    assert paid.json()["invoice"] is None
    assert paid.headers["cache-control"] == "no-store"


def test_donation_requires_approved_org_connected_wallet_and_bounded_amount(client):
    org_id = approved_org(scopes=["payments"])
    no_wallet = client.post(f"/v1/orgs/{org_id}/donations", json={"amount_sat": 1_000})
    assert no_wallet.status_code == 409

    fake = FakeNwcClient()
    connect(client, fake, org_id)
    assert client.post(f"/v1/orgs/{org_id}/donations", json={"amount_sat": 1}).status_code == 422


def test_connected_wallet_pays_an_approved_disbursement_once(client):
    org_id = payment_org(client=client)
    fake = FakeNwcClient()
    connect(client, fake, org_id)
    item = ready(client, org_id)
    attached = attach(client, item, make_invoice(10_000))
    assert attached.status_code == 200, attached.text

    path = f"/v1/disbursements/{item['id']}/pay-with-wallet"
    paid = signed(
        client,
        "POST",
        path,
        sensitive_scope=f"disbursement:pay:{item['id']}",
    )
    assert paid.status_code == 200, paid.text
    assert paid.json()["state"] == "PAID"
    assert [method for method, _params in fake.calls].count("pay_invoice") == 1

    duplicate = signed(
        client,
        "POST",
        path,
        sensitive_scope=f"disbursement:pay:{item['id']}",
    )
    assert duplicate.status_code == 409
    assert [method for method, _params in fake.calls].count("pay_invoice") == 1


def test_unknown_payment_outcome_requires_reconciliation_not_a_retry(client):
    org_id = payment_org(client=client)
    fake = FakeNwcClient()
    connect(client, fake, org_id)
    item = ready(client, org_id)
    attached = attach(client, item, make_invoice(10_000))
    assert attached.status_code == 200, attached.text

    fake.payment_unknown = True
    pay_path = f"/v1/disbursements/{item['id']}/pay-with-wallet"
    uncertain = signed(
        client,
        "POST",
        pay_path,
        sensitive_scope=f"disbursement:pay:{item['id']}",
    )
    assert uncertain.status_code == 504
    assert "do not retry" in uncertain.json()["detail"]

    retry = signed(
        client,
        "POST",
        pay_path,
        sensitive_scope=f"disbursement:pay:{item['id']}",
    )
    assert retry.status_code == 409
    assert [method for method, _params in fake.calls].count("pay_invoice") == 1

    fake.settled = True
    reconcile_path = f"/v1/disbursements/{item['id']}/reconcile-wallet"
    reconciled = signed(
        client,
        "POST",
        reconcile_path,
        sensitive_scope=f"disbursement:reconcile:{item['id']}",
    )
    assert reconciled.status_code == 200, reconciled.text
    assert reconciled.json()["state"] == "PAID"
