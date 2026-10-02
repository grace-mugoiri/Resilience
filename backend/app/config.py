from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    """Application configuration"""
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://resilience_user:resilience_password@localhost:5432/resilience_dev"
    )
    
    # Nostr
    #NOSTR_RELAY_URLS: list = [
       # "wss://relay.damus.io",
        #"wss://relay.nostr.band",
        #"wss://nos.lol"
   # ]
    
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = ENVIRONMENT == "development"
    
    # App
    APP_NAME: str = "Resilience API"
    APP_VERSION: str = "0.1.0"
    
    class Config:
        env_file = ".env"

settings = Settings()