from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query, status

from app.core.config import ADMIN_SYNC_SECRET
from app.database import SessionLocal
from app.models import RaceModel
from app.services.f1_service import (
    _load_session_results,
    _sessions_for_format,
    cache_races_snapshot,
    process_year,
    run_etl,
    warm_all_completed_sessions,
)


router = APIRouter(prefix="/api/admin", tags=["admin"])


def _verify_sync_secret(x_admin_sync_secret: str | None) -> None:
    if not ADMIN_SYNC_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ADMIN_SYNC_SECRET is not configured",
        )
    if x_admin_sync_secret != ADMIN_SYNC_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid sync secret")


@router.post("/sync")
def sync_f1_data(
    year: int | None = Query(default=None),
    round: int | None = Query(default=None),
    full: bool = Query(default=False),
    x_admin_sync_secret: str | None = Header(default=None),
):
    _verify_sync_secret(x_admin_sync_secret)

    if full:
        run_etl()
        return {"ok": True, "mode": "full"}

    target_year = year or datetime.now(timezone.utc).year
    db = SessionLocal()
    try:
        # Single round warm — much lighter on memory, safe for Render free tier.
        if round is not None:
            race = db.query(RaceModel).filter(
                RaceModel.year == target_year,
                RaceModel.round == round,
            ).first()
            if not race:
                raise HTTPException(status_code=404, detail=f"Round {round} not found for {target_year}")
            sessions = _sessions_for_format(race.event_format)
            warmed = errors = 0
            for code in sessions:
                try:
                    data = _load_session_results(target_year, round, code, refresh=False, db=db)
                    rows = data.get("results", data) if isinstance(data, dict) else data
                    if rows:
                        warmed += 1
                except Exception as e:
                    errors += 1
                    print(f"[ADMIN] Failed {target_year} R{round} {code}: {e}")
            return {"ok": True, "mode": "round", "year": target_year, "round": round, "warmed": warmed, "errors": errors}

        # Full year sync
        process_year(target_year, db)
        races = cache_races_snapshot(target_year, db)
        warm_summary = warm_all_completed_sessions(target_year, db)
        return {
            "ok": True,
            "mode": "year",
            "year": target_year,
            "races": len(races),
            "warm": warm_summary,
        }
    finally:
        db.close()
