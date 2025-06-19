import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from app.database.database import Base
from app.core.config import settings


async def init_database():
    """Initialize the database with all tables"""
    
    # Create async engine
    engine = create_async_engine(
        settings.DATABASE_URL.replace("sqlite://", "sqlite+aiosqlite://"),
        echo=True,
        future=True
    )
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    await engine.dispose()
    print("Database initialized successfully!")


if __name__ == "__main__":
    asyncio.run(init_database())