from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.api.routes import router as api_router
from app.services.scheduler import start_scheduler, stop_scheduler
from app.utils.logging import setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
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