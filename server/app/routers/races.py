from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppCacheModel, RaceModel
from app.services.f1_service import cache_races_snapshot, load_session_results


router = APIRouter(prefix="/api", tags=["races"])


@router.get("/races")
def get_races(year: int, db: Session = Depends(get_db)):
    key = f"all_races_{year}"
    cached = db.query(AppCacheModel).filter(AppCacheModel.key == key).first()
    if cached and cached.data:
        return cached.data

    # Fallback: load from races table and persist snapshot for next request
    payload = cache_races_snapshot(year, db)
    return payload


@router.get("/race-results")
def get_race_results(year: int, round: int, refresh: bool = False, db: Session = Depends(get_db)):
    return load_session_results(year, round, "R", refresh, db)


@router.get("/session-results")
def get_session_results(
    year: int,
    round: int,
    session: str,
    refresh: bool = False,
    db: Session = Depends(get_db),
):
    session_code = session.upper()
    if session_code not in {"P1", "P2", "P3", "Q", "R", "S"}:
        raise HTTPException(status_code=400, detail="Invalid session code")

    return load_session_results(year, round, session_code, refresh, db)
