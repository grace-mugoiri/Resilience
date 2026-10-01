import pytest
from alembic import command
from pydantic import ValidationError
from sqlalchemy import text

from app.db.session import get_engine
from app.settings import Settings
from app.worker import purge_seen_auth_events
from tests.conftest import alembic_config


def test_healthz(client):
    assert client.get("/healthz").json() == {"status": "ok"}


def test_cors_allows_only_configured_origin(client):
    preflight = {"Access-Control-Request-Method": "POST"}
    ok = client.options("/v1/whoami", headers={"Origin": "https://app.example.test", **preflight})
    assert ok.headers.get("access-control-allow-origin") == "https://app.example.test"
    bad = client.options("/v1/whoami", headers={"Origin": "https://evil.example", **preflight})
    assert "access-control-allow-origin" not in bad.headers


def test_wildcard_cors_is_refused():
    with pytest.raises(ValidationError):
        Settings(cors_origins="*")


def test_purge_removes_only_old_auth_events():
    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM seen_auth_events"))
        conn.execute(
            text(
                "INSERT INTO seen_auth_events (event_id, seen_at) VALUES "
                "(:old, now() - interval '1 hour'), (:new, now())"
            ),
            {"old": "a" * 64, "new": "b" * 64},
        )
    assert purge_seen_auth_events() == 1
    with get_engine().connect() as conn:
        left = conn.execute(text("SELECT event_id FROM seen_auth_events")).scalars().all()
    assert left == ["b" * 64]


def test_migrations_downgrade_and_upgrade_cleanly():
    command.downgrade(alembic_config(), "base")
    command.upgrade(alembic_config(), "head")
