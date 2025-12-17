from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime

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
from app.services.f1_service import (
    cache_races_snapshot,
    enable_fastf1_cache,
    prewarm_last_completed_race,
    run_etl,
    sync_drivers_for_year,
)


scheduler = BackgroundScheduler()


def scheduled_driver_sync():
    """
    Scheduled job to sync driver rosters for current year.
    This ensures mid-season driver changes are reflected promptly.
    """
    try:
        current_year = datetime.now().year
        db = SessionLocal()
        try:
            result = sync_drivers_for_year(current_year, db, force_refresh=True)
            if result.get("updated", 0) > 0 or result.get("inserted", 0) > 0:
                print(f"[SCHEDULER] Driver sync for {current_year}: {result.get('updated', 0)} updated, {result.get('inserted', 0)} inserted")
        finally:
            db.close()
    except Exception as e:
        print(f"[SCHEDULER] Driver sync failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    enable_fastf1_cache()
    init_db()

    current_year = datetime.now().year

    # Initial check: run ETL if DB empty
    try:
        db = SessionLocal()
        if db.query(RaceModel).count() == 0:
            run_etl()
        else:
            # Even if DB has data, sync drivers from latest round to catch mid-season changes
            try:
                result = sync_drivers_for_year(current_year, db, force_refresh=True)
                if result.get("updated", 0) > 0:
                    print(f"[INIT] Driver sync: {result.get('updated', 0)} drivers updated (team changes detected)")
                elif result.get("inserted", 0) > 0:
                    print(f"[INIT] Driver sync: {result.get('inserted', 0)} new drivers added")
                else:
                    print(f"[INIT] Driver sync: roster is up to date ({result.get('total', 0)} drivers)")
            except Exception as e:
                print(f"[WARN] Initial driver sync failed: {e}")
        
        # Cache race list snapshot for current year
        try:
            cache_races_snapshot(current_year, db)
        except Exception as e:
            print(f"[WARN] Race snapshot cache failed: {e}")
        
        # Prewarm the most recent completed race to speed up the first hit.
        try:
            prewarm_last_completed_race(current_year, db)
        except Exception as e:
            print(f"[WARN] Prewarm failed: {e}")
        db.close()
    except Exception as e:
        print(f"[WARN] Initial ETL check failed: {e}")

    # Schedule recurring jobs
    # Full ETL runs daily
    scheduler.add_job(run_etl, "interval", hours=24, id="full_etl")
    
    # Driver sync runs every 6 hours to catch mid-season changes quickly
    scheduler.add_job(scheduled_driver_sync, "interval", hours=6, id="driver_sync")
    
    # Race prewarm runs every 6 hours
    scheduler.add_job(
        lambda: prewarm_last_completed_race(datetime.now().year, SessionLocal()),
        "interval",
        hours=6,
        id="race_prewarm"
    )
    
    # Race snapshot cache runs every 12 hours
    scheduler.add_job(
        lambda: cache_races_snapshot(datetime.now().year, SessionLocal()),
        "interval",
        hours=12,
        id="race_snapshot"
    )
    
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
