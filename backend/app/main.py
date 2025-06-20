from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.core.config import settings
from app.api.routes import router as api_router
from app.services.scheduler import start_scheduler, stop_scheduler
from app.utils.logging import setup_logging
from app.database.database import engine, Base
# Import models to ensure they're registered with Base
from app.database import models

logger = logging.getLogger(__name__)


async def init_database():
    """Initialize database tables"""
    try:
        logger.info("Initializing database...")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    await init_database()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="PR Monitor Backend",
    description="GitHub PR monitoring backend with FastAPI",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"message": "PR Monitor Backend is running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}