from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/optra"
    redis_url: str = "redis://localhost:6379/0"
    internal_api_key: str = "dev-internal-key"
    upstox_api_key: str = ""
    upstox_api_secret: str = ""
    anthropic_api_key: str = ""
    debug: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
