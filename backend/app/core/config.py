from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    GITHUB_TOKEN: str = ""
    SLACK_WEBHOOK_URL: str = ""
    SLACK_BOT_TOKEN: str = ""
    
    GITHUB_API_BASE_URL: str = "https://api.github.com"
    POLLING_INTERVAL_SECONDS: int = 60
    
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8080"]
    
    DATABASE_URL: str = "sqlite:///./pr_monitor.db"
    
    LOG_LEVEL: str = "INFO"
    
    class Config:
        env_file = ".env"


settings = Settings()