from fastapi import FastAPI
from app.api.nostr import router as nostr_router

app = FastAPI(
    title="Resilience API",
    description="API for Resilience which is a GBV Support platform that provides support and resources for survivors of " \
    "gender-based violence. The API allows users to access information about available services, report incidents, and connect with support networks.",
    version="1.0.0",
)

app.include_router(nostr_router)

@app.get("/")
async def root():
    return {"message": "Welcome to the Resilience API!"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}