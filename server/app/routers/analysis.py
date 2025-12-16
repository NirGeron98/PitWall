from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppCacheModel

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def _fetch_cache(db: Session, key: str, default=None):
    """
    Fetch cached data from AppCacheModel.
    Returns default value (or empty dict/list) if not found, instead of raising 404.
    This provides better UX when data hasn't been pre-computed yet.
    """
    record = db.query(AppCacheModel).filter(AppCacheModel.key == key).first()
    if not record:
        # Return empty response instead of 404 for better UX
        # The frontend can handle empty data gracefully
        return default if default is not None else {}
    return record.data


@router.get("/laps")
def analysis_laps(year: int, round: int, db: Session = Depends(get_db)):
    """
    Serve precomputed laps payload from cache.
    Data must be preloaded via etl.py (key: analysis_laps_{year}_{round}).
    Returns empty response if data not available (instead of 404).
    """
    key = f"analysis_laps_{year}_{round}"
    # Return empty structure matching expected response format
    return _fetch_cache(db, key, default={"laps": [], "drivers": []})


@router.get("/telemetry")
def analysis_telemetry(year: int, round: int, driver: str, db: Session = Depends(get_db)):
    """
    Serve precomputed telemetry payload from cache.
    Data must be preloaded via etl.py (key: telemetry_{year}_{round}_{driver}).
    Returns empty response if data not available (instead of 404).
    """
    key = f"telemetry_{year}_{round}_{driver}"
    # Return empty structure matching expected telemetry format
    return _fetch_cache(db, key, default={"distance": [], "speed": [], "throttle": [], "brake": [], "gear": []})


@router.get("/stints")
def analysis_stints(year: int, round: int, driver: str, db: Session = Depends(get_db)):
    """
    Serve precomputed stints payload from cache.
    Data must be preloaded via etl.py (key: stints_{year}_{round}_{driver}).
    Returns empty response if data not available (instead of 404).
    """
    key = f"stints_{year}_{round}_{driver}"
    # Return empty list if data not available
    return _fetch_cache(db, key, default=[])
