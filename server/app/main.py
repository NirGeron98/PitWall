from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.core.config import cors_allow_origins
from app.database import init_db
from app.routers.admin import router as admin_router
from app.routers.analysis import router as analysis_router
from app.routers.auth import router as auth_router
from app.routers.drivers import router as drivers_router
from app.routers.races import router as races_router
from app.routers.season import router as season_router
from app.routers.user import router as user_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup must stay cheap on Render. ETL and FastF1 work run through the
    # protected admin sync endpoint or one-off seed scripts instead.
    init_db()
    yield


app = FastAPI(title="PitWall API", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health():
    return {"ok": True}


app.include_router(auth_router)
app.include_router(user_router)
app.include_router(drivers_router)
app.include_router(races_router)
app.include_router(season_router)
app.include_router(analysis_router)
app.include_router(admin_router)
