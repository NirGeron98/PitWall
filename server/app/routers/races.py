from __future__ import annotations

import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppCacheModel, RaceModel
from app.services.f1_service import cache_races_snapshot, load_session_results


router = APIRouter(prefix="/api", tags=["races"])

# In-memory TTL cache for hot reads (per-process)
_memory_cache: dict[str, tuple[list, float]] = {}
_CACHE_TTL_SECONDS = 300  # 5 minutes


@router.get("/races")
def get_races(year: int, db: Session = Depends(get_db)):
    """
    Get race schedule for a given year.
    Optimized with multi-layer caching: in-memory -> DB cache -> DB query.
    Returns minimal payload needed for RaceCard rendering.
    """
    start_time = time.time()
    key = f"all_races_{year}"
    
    # Layer 1: Check in-memory cache first (fastest, ~0.1ms)
    if key in _memory_cache:
        cached_data, cached_time = _memory_cache[key]
        age_seconds = time.time() - cached_time
        if age_seconds < _CACHE_TTL_SECONDS:
            elapsed = (time.time() - start_time) * 1000
            print(f"[PERF] GET /api/races?year={year} - memory cache hit ({elapsed:.2f}ms, age={age_seconds:.1f}s)")
            return cached_data
        else:
            # TTL expired, remove from memory cache
            del _memory_cache[key]
            print(f"[PERF] GET /api/races?year={year} - memory cache expired (age={age_seconds:.1f}s)")
    
    # Layer 2: Check DB cache (AppCacheModel) - typically <5ms
    db_cache_start = time.time()
    cached = db.query(AppCacheModel).filter(AppCacheModel.key == key).first()
    db_cache_elapsed = (time.time() - db_cache_start) * 1000
    
    if cached and cached.data:
        # Update memory cache for next request
        _memory_cache[key] = (cached.data, time.time())
        elapsed = (time.time() - start_time) * 1000
        print(f"[PERF] GET /api/races?year={year} - DB cache hit (db_query={db_cache_elapsed:.2f}ms, total={elapsed:.2f}ms)")
        return cached.data

    # Layer 3: Cache miss - build from RaceModel and persist
    # This should be fast (<50ms) if DB is properly indexed
    build_start = time.time()
    payload = cache_races_snapshot(year, db)
    build_elapsed = (time.time() - build_start) * 1000
    
    # Update memory cache for instant next request
    _memory_cache[key] = (payload, time.time())
    
    elapsed = (time.time() - start_time) * 1000
    print(f"[PERF] GET /api/races?year={year} - cache miss (build={build_elapsed:.2f}ms, total={elapsed:.2f}ms, races={len(payload)})")
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
