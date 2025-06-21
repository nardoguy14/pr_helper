from pydantic_settings import BaseSettings
from typing import List
import sys
from pathlib import Path


def get_database_path():
    """Get appropriate database path for the environment"""
    # In packaged app, use user's home directory
    if getattr(sys, 'frozen', False):  # Running in PyInstaller bundle
        db_dir = Path.home() / ".pr-monitor"
        db_dir.mkdir(exist_ok=True)
        return f"sqlite:///{db_dir}/pr_monitor.db"
    else:
        # Development: use current directory
        return "sqlite:///./pr_monitor.db"


class Settings(BaseSettings):
    GITHUB_TOKEN: str = ""
    SLACK_WEBHOOK_URL: str = ""
    SLACK_BOT_TOKEN: str = ""
    
    GITHUB_API_BASE_URL: str = "https://api.github.com"
    POLLING_INTERVAL_SECONDS: int = 60
    AUTO_SUBSCRIBE_USER_TEAMS: bool = True
    
    ALLOWED_ORIGINS: List[str] = ["*"]
    
    DATABASE_URL: str = get_database_path()
    
    LOG_LEVEL: str = "INFO"
    


settings = Settings()