def test_list_counselors_includes_all_seeded_verification_states(client):
    res = client.get("/api/counselors")
    assert res.status_code == 200
    statuses = {c["verification_status"] for c in res.json()}
    assert statuses == {"verified", "pending", "expired", "revoked"}


def test_filter_counselors_by_verification_status(client):
    res = client.get("/api/counselors", params={"verification_status": "verified"})
    assert res.status_code == 200
    assert all(c["verification_status"] == "verified" for c in res.json())


def test_get_unknown_counselor_is_404(client):
    res = client.get("/api/counselors/does-not-exist")
    assert res.status_code == 404


def test_survivor_cannot_create_counselor_profile(client, auth_headers):
    res = client.post(
        "/api/counselors",
        json={"display_name": "Someone", "specialties": [], "languages": []},
        headers=auth_headers,
    )
    assert res.status_code == 403


def test_counselor_identity_can_create_and_update_own_profile(client):
    created = client.post("/api/identity", json={"role": "counselor", "pin": "1234"}).json()
    headers = {"Authorization": f"Bearer {created['token']}"}

    create_res = client.post(
        "/api/counselors",
        json={"display_name": "New Counselor", "specialties": ["Crisis support"], "languages": ["English"]},
        headers=headers,
    )
    assert create_res.status_code == 201
    profile = create_res.json()
    assert profile["verification_status"] == "pending"

    update_res = client.patch(
        f"/api/counselors/{profile['id']}", json={"is_available": False}, headers=headers
    )
    assert update_res.status_code == 200
    assert update_res.json()["is_available"] is False
