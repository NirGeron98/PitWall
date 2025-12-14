from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppCacheModel

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def _fetch_cache(db: Session, key: str):
    record = db.query(AppCacheModel).filter(AppCacheModel.key == key).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Cached data not found for key '{key}'. Run ETL first.")
    return record.data


@router.get("/laps")
def analysis_laps(year: int, round: int, db: Session = Depends(get_db)):
    """
    Serve precomputed laps payload from cache.
    Data must be preloaded via etl.py (key: analysis_laps_{year}_{round}).
    """
    key = f"analysis_laps_{year}_{round}"
    return _fetch_cache(db, key)


@router.get("/telemetry")
def analysis_telemetry(year: int, round: int, driver: str, db: Session = Depends(get_db)):
    """
    Serve precomputed telemetry payload from cache.
    Data must be preloaded via etl.py (key: telemetry_{year}_{round}_{driver}).
    """
    key = f"telemetry_{year}_{round}_{driver}"
    return _fetch_cache(db, key)


@router.get("/stints")
def analysis_stints(year: int, round: int, driver: str, db: Session = Depends(get_db)):
    """
    Serve precomputed stints payload from cache.
    Data must be preloaded via etl.py (key: stints_{year}_{round}_{driver}).
    """
    key = f"stints_{year}_{round}_{driver}"
    return _fetch_cache(db, key)
