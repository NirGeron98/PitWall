from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RaceModel
from app.services.f1_service import load_session_results


router = APIRouter(prefix="/api", tags=["races"])


@router.get("/races")
def get_races(year: int, db: Session = Depends(get_db)):
    races = db.query(RaceModel).filter(RaceModel.year == year).all()
    return [
        {
            "RoundNumber": r.round,
            "EventName": r.event_name,
            "Country": r.country,
            "Location": r.location,
            "Session5Date": r.date,
            "EventFormat": r.event_format,
        }
        for r in races
    ]


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
