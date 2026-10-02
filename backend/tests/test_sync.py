def _open_group_id(client, headers):
    groups = client.get("/api/groups", headers=headers).json()
    return next(g["id"] for g in groups if not g["requires_approval"])


def test_sync_group_message_then_replay_is_idempotent(client, auth_headers):
    group_id = _open_group_id(client, auth_headers)
    client.post(f"/api/groups/{group_id}/join", headers=auth_headers)

    payload = {
        "messages": [
            {
                "client_message_id": "sync-key-1",
                "target": "group",
                "target_id": group_id,
                "body": "queued while offline",
            }
        ]
    }
    first = client.post("/api/sync", json=payload, headers=auth_headers)
    assert first.status_code == 200
    assert first.json()["results"][0]["accepted"] is True
    server_id = first.json()["results"][0]["server_id"]

    second = client.post("/api/sync", json=payload, headers=auth_headers)
    assert second.json()["results"][0]["server_id"] == server_id

    messages = client.get(f"/api/groups/{group_id}/messages", headers=auth_headers).json()
    assert sum(1 for m in messages if m["client_message_id"] == "sync-key-1") == 1


def test_sync_rejects_message_to_group_you_have_not_joined(client, auth_headers):
    other = client.post("/api/identity", json={"role": "survivor", "pin": "1234"}).json()
    other_headers = {"Authorization": f"Bearer {other['token']}"}
    group_id = client.get("/api/groups", headers=other_headers).json()[0]["id"]

    payload = {
        "messages": [
            {"client_message_id": "sync-key-2", "target": "group", "target_id": group_id, "body": "hi"}
        ]
    }
    res = client.post("/api/sync", json=payload, headers=other_headers)
    assert res.json()["results"][0]["accepted"] is False
