from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "postgresql+psycopg://geolift:geolift@postgres:5432/geolift"
    REDIS_URL: str = "redis://redis:6379/0"
    R_SERVICE_URL: str = "http://r-service:8001"

    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    STORAGE_DIR: str = "/srv/backend/storage"
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    SHARE_LINK_EXPIRE_DAYS: int = 30


settings = Settings()
