ENV_FILE ?= .env
PYTHON ?= .venv/bin/python
RUFF ?= .venv/bin/ruff
PYTEST ?= .venv/bin/pytest
COMPOSE = docker compose --env-file $(ENV_FILE)

.PHONY: setup sign-config up start stop down reset ps logs db migrate api worker relay-policy lint format format-check test check

setup:
	python3 -m venv .venv
	.venv/bin/pip install -r requirements-dev.txt

sign-config:
	$(PYTHON) scripts/sign_config.py --env-file $(ENV_FILE)

up start:
	$(COMPOSE) up -d --build

stop down:
	$(COMPOSE) down

# Destructive: removes the local PostgreSQL and relay volumes.
reset:
	$(COMPOSE) down -v

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f api worker relay-policy relay-1 relay-2

db:
	$(COMPOSE) up -d db

migrate: db
	set -a; . ./$(ENV_FILE); set +a; $(PYTHON) -m alembic upgrade head

api: migrate
	set -a; . ./$(ENV_FILE); set +a; $(PYTHON) -m uvicorn app.main:app --host 0.0.0.0 --port $${API_PORT:-8000} --reload --no-access-log

worker: db
	set -a; . ./$(ENV_FILE); set +a; $(PYTHON) -m app.worker

relay-policy: db
	set -a; . ./$(ENV_FILE); set +a; $(PYTHON) -m app.relay.server

lint:
	$(RUFF) check .

format:
	$(RUFF) format .

format-check:
	$(RUFF) format --check .

test:
	$(PYTEST)

check: lint format-check test
