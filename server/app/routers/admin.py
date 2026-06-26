from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query, status

from app.core.config import ADMIN_SYNC_SECRET
from app.database import SessionLocal
from app.services.f1_service import (
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
    full: bool = Query(default=False),
    x_admin_sync_secret: str | None = Header(default=None),
):
    """
    Protected production sync endpoint for Render/GitHub Actions/manual refreshes.

    Normal user traffic should not run ETL. This endpoint precomputes the same
    cache data without requiring an always-on in-process scheduler.
    """

    _verify_sync_secret(x_admin_sync_secret)

    if full:
        run_etl()
        return {"ok": True, "mode": "full"}

    target_year = year or datetime.now(timezone.utc).year
    db = SessionLocal()
    try:
        process_year(target_year, db)
        races = cache_races_snapshot(target_year, db)
        # Warm every session of every completed round (not just the last race),
        # so opening any race modal is served from the DB cache.
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
