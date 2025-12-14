from __future__ import annotations

from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.core.config import cors_allow_origins
from app.database import SessionLocal, init_db
from app.models import RaceModel
from app.routers.analysis import router as analysis_router
from app.routers.auth import router as auth_router
from app.routers.drivers import router as drivers_router
from app.routers.races import router as races_router
from app.routers.user import router as user_router
from app.services.f1_service import enable_fastf1_cache, prewarm_last_completed_race, run_etl


scheduler = BackgroundScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    enable_fastf1_cache()
    init_db()

    # Initial check: run ETL if DB empty
    try:
        db = SessionLocal()
        if db.query(RaceModel).count() == 0:
            print("[INIT] Database empty. Running initial ETL...")
            run_etl()
        # Prewarm the most recent completed race to speed up the first hit.
        try:
            from datetime import datetime

            prewarm_last_completed_race(datetime.now().year, db)
        except Exception as e:
            print(f"[WARN] Prewarm failed: {e}")
        db.close()
    except Exception as e:
        print(f"[WARN] Initial ETL check failed: {e}")

    scheduler.add_job(run_etl, "interval", hours=24)
    scheduler.add_job(lambda: prewarm_last_completed_race(datetime.now().year, SessionLocal()), "interval", hours=6)
    scheduler.start()

    yield

    scheduler.shutdown()


app = FastAPI(title="PitWall API", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(user_router)
app.include_router(drivers_router)
app.include_router(races_router)
app.include_router(analysis_router)
