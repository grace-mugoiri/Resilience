def test_create_share_and_revoke_health_record(client, auth_headers):
    record_res = client.post(
        "/api/health/records",
        json={"record_type": "injury_note", "title": "Demo note", "body": "fictional demo content"},
        headers=auth_headers,
    )
    assert record_res.status_code == 201
    record = record_res.json()
    assert record["shared_with"] == []

    counselor_id = client.get("/api/counselors").json()[0]["identity_id"]

    share_res = client.post(
        "/api/health/share",
        json={"record_id": record["id"], "counselor_identity_id": counselor_id},
        headers=auth_headers,
    )
    assert share_res.status_code == 201
    share_id = share_res.json()["id"]

    records = client.get("/api/health/records", headers=auth_headers).json()
    shared_record = next(r for r in records if r["id"] == record["id"])
    assert len(shared_record["shared_with"]) == 1

    revoke_res = client.delete(f"/api/health/share/{share_id}", headers=auth_headers)
    assert revoke_res.status_code == 204

    records_after = client.get("/api/health/records", headers=auth_headers).json()
    revoked_record = next(r for r in records_after if r["id"] == record["id"])
    assert revoked_record["shared_with"] == []


def test_health_records_require_auth(client):
    res = client.get("/api/health/records")
    assert res.status_code == 401
