import os
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./test_resilience.db"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def survivor_token(client):
    res = client.post("/api/identity", json={"role": "survivor", "pin": "1234"})
    assert res.status_code == 201
    return res.json()["token"]


@pytest.fixture()
def auth_headers(survivor_token):
    return {"Authorization": f"Bearer {survivor_token}"}
