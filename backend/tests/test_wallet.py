def test_zap_requires_connected_wallet(client, auth_headers):
    res = client.post(
        "/api/wallet/zap/mock",
        json={"amount_sats": 1000, "memo": "hi", "from_label": "Someone"},
        headers=auth_headers,
    )
    assert res.status_code == 400


def test_connect_then_zap_updates_balance(client, auth_headers):
    connect_res = client.post(
        "/api/wallet/connect", json={"public_address": "bc1qtest"}, headers=auth_headers
    )
    assert connect_res.status_code == 200
    assert connect_res.json()["connected"] is True

    zap_res = client.post(
        "/api/wallet/zap/mock",
        json={"amount_sats": 2500, "memo": "You are seen", "from_label": "A supporter"},
        headers=auth_headers,
    )
    assert zap_res.status_code == 201
    assert zap_res.json()["status"] == "success"

    wallet = client.get("/api/wallet", headers=auth_headers).json()
    assert wallet["balance_sats"] == 2500

    txs = client.get("/api/wallet/transactions", headers=auth_headers).json()
    assert len(txs) == 1
    assert txs[0]["direction"] == "incoming"


def test_wallet_requires_auth(client):
    res = client.get("/api/wallet")
    assert res.status_code == 401


def test_withdraw_more_than_balance_rejected(client, auth_headers):
    client.post("/api/wallet/connect", json={"public_address": "bc1qtest2"}, headers=auth_headers)
    res = client.post(
        "/api/wallet/withdraw/mock", json={"amount_sats": 1000, "destination": "+254700000000"}, headers=auth_headers
    )
    assert res.status_code == 400


def test_withdraw_reduces_balance_and_records_pending(client, auth_headers):
    client.post("/api/wallet/connect", json={"public_address": "bc1qtest3"}, headers=auth_headers)
    client.post("/api/wallet/zap/mock", json={"amount_sats": 5000, "memo": "", "from_label": "x"}, headers=auth_headers)

    res = client.post(
        "/api/wallet/withdraw/mock", json={"amount_sats": 2000, "destination": "+254700000000"}, headers=auth_headers
    )
    assert res.status_code == 201
    assert res.json()["status"] == "pending"
    assert res.json()["direction"] == "outgoing"

    wallet = client.get("/api/wallet", headers=auth_headers).json()
    assert wallet["balance_sats"] == 3000
