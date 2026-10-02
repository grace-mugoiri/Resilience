def test_create_identity_returns_token_and_recovery_phrase(client):
    res = client.post("/api/identity", json={"role": "survivor", "pin": "4242"})
    assert res.status_code == 201
    body = res.json()
    assert body["identity"]["role"] == "survivor"
    assert body["token"]
    assert body["recovery_phrase"].count("-") == 5


def test_me_requires_auth(client):
    res = client.get("/api/identity/me")
    assert res.status_code == 401


def test_me_with_token(client, auth_headers):
    res = client.get("/api/identity/me", headers=auth_headers)
    assert res.status_code == 200


def test_login_wrong_pin_rejected(client):
    created = client.post("/api/identity", json={"role": "survivor", "pin": "1111"}).json()
    res = client.post(
        "/api/identity/login", json={"identity_id": created["identity"]["id"], "pin": "0000"}
    )
    assert res.status_code == 401


def test_restore_with_recovery_phrase(client):
    created = client.post("/api/identity", json={"role": "survivor", "pin": "5555"}).json()
    res = client.post(
        "/api/identity/restore",
        json={"recovery_phrase": created["recovery_phrase"], "pin": "6666"},
    )
    assert res.status_code == 200
    assert res.json()["identity"]["id"] == created["identity"]["id"]


def test_restore_with_bad_phrase_is_404(client):
    res = client.post("/api/identity/restore", json={"recovery_phrase": "nope-nope-nope", "pin": "1234"})
    assert res.status_code == 404


def test_duplicate_pseudonym_conflicts(client):
    client.post("/api/identity", json={"role": "survivor", "pin": "1234", "pseudonym": "TakenName"})
    res = client.post("/api/identity", json={"role": "survivor", "pin": "1234", "pseudonym": "TakenName"})
    assert res.status_code == 409
