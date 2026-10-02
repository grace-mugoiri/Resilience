def _open_group_id(client, headers):
    groups = client.get("/api/groups", headers=headers).json()
    return next(g["id"] for g in groups if not g["requires_approval"])


def _moderated_group_id(client, headers):
    groups = client.get("/api/groups", headers=headers).json()
    return next(g["id"] for g in groups if g["requires_approval"])


def test_must_join_before_posting(client, auth_headers):
    group_id = _open_group_id(client, auth_headers)
    res = client.post(
        f"/api/groups/{group_id}/messages",
        json={"body": "hi", "client_message_id": "m1"},
        headers=auth_headers,
    )
    assert res.status_code == 403


def test_join_then_post_and_read_message(client, auth_headers):
    group_id = _open_group_id(client, auth_headers)
    join_res = client.post(f"/api/groups/{group_id}/join", headers=auth_headers)
    assert join_res.status_code == 200
    assert join_res.json()["joined"] is True

    post_res = client.post(
        f"/api/groups/{group_id}/messages",
        json={"body": "hello group", "client_message_id": "unique-1"},
        headers=auth_headers,
    )
    assert post_res.status_code == 201

    messages = client.get(f"/api/groups/{group_id}/messages", headers=auth_headers).json()
    assert any(m["body"] == "hello group" for m in messages)


def test_moderated_group_join_is_pending_not_member(client, auth_headers):
    group_id = _moderated_group_id(client, auth_headers)
    join_res = client.post(f"/api/groups/{group_id}/join", headers=auth_headers)
    assert join_res.status_code == 200
    body = join_res.json()
    assert body["joined"] is False
    assert body["pending"] is True

    res = client.post(
        f"/api/groups/{group_id}/messages",
        json={"body": "hi", "client_message_id": "pending-1"},
        headers=auth_headers,
    )
    assert res.status_code == 403


def test_duplicate_client_message_id_does_not_duplicate(client, auth_headers):
    group_id = _open_group_id(client, auth_headers)
    client.post(f"/api/groups/{group_id}/join", headers=auth_headers)

    payload = {"body": "only once", "client_message_id": "dedupe-key-1"}
    first = client.post(f"/api/groups/{group_id}/messages", json=payload, headers=auth_headers)
    second = client.post(f"/api/groups/{group_id}/messages", json=payload, headers=auth_headers)
    assert first.json()["id"] == second.json()["id"]

    messages = client.get(f"/api/groups/{group_id}/messages", headers=auth_headers).json()
    assert sum(1 for m in messages if m["client_message_id"] == "dedupe-key-1") == 1


def test_unknown_group_is_404(client, auth_headers):
    res = client.get("/api/groups/not-a-real-id", headers=auth_headers)
    assert res.status_code == 404
