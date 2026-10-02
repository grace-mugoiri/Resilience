from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.routers import circle, counselors, groups, health, identity, messages, resources, sync, wallet
from app.services.mock_data import seed
from app.services.nostr_service import get_nostr_service

settings = get_settings()

Base.metadata.create_all(bind=engine)
with SessionLocal() as db:
    seed(db)

app = FastAPI(
    title="Resilience API",
    description="Prototype backend for the Resilience GBV support platform. "
    "Nostr identity/messaging and Bitcoin wallet integrations are MOCKED — see app/services/.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(identity.router)
app.include_router(counselors.router)
app.include_router(groups.router)
app.include_router(messages.router)
app.include_router(resources.router)
app.include_router(health.router)
app.include_router(wallet.router)
app.include_router(circle.router)
app.include_router(sync.router)


@app.get("/api/status")
def status():
    nostr = get_nostr_service()
    return {
        "status": "ok",
        "mocked_integrations": ["nostr", "wallet", "verification"],
        "relays": [r.__dict__ for r in nostr.relay_status()],
    }
