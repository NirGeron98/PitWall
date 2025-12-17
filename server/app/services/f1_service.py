from __future__ import annotations

import os
import traceback
from datetime import datetime, timezone
from typing import Optional

import fastf1
import numpy as np
import pandas as pd
import requests
from fastapi import HTTPException
from fastf1.ergast import Ergast
from sqlalchemy.orm import Session

from app.core.config import CACHE_DIR
from app.database import SessionLocal, init_db
from app.models import (
    AppCacheModel,
    DriverModel,
    DriverStandingModel,
    RaceModel,
    SessionResultModel,
    TeamStandingModel,
)


def enable_fastf1_cache() -> None:
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)
    fastf1.Cache.enable_cache(CACHE_DIR)


# --- HELPERS FOR STANDINGS ---

def _hydrate_driver_standings(year: int, db: Session):
    ergast = Ergast()
    standings = ergast.get_driver_standings(season=year)
    if not standings.content:
        return []

    df = standings.content[0].fillna("")

    drivers_db = db.query(DriverModel).filter(DriverModel.year == year).all()
    driver_meta_by_number = {d.driver_number: d for d in drivers_db}
    driver_meta_by_name = {d.full_name.lower(): d for d in drivers_db}

    records = []
    for _, row in df.iterrows():
        constructor_name = ""
        try:
            if isinstance(row["constructorNames"], list) and row["constructorNames"]:
                constructor_name = row["constructorNames"][0]
        except Exception:
            constructor_name = ""

        meta = driver_meta_by_number.get(str(row.get("driverNumber", "")).strip())
        if not meta:
            full_name_key = f"{row.get('givenName', '')} {row.get('familyName', '')}".strip().lower()
            meta = driver_meta_by_name.get(full_name_key)

        driver_number = meta.driver_number if meta else str(row.get("driverNumber", "")).strip()
        records.append(
            {
                "position": int(row.get("position", 0)) if str(row.get("position", "")).isdigit() else row.get("position", ""),
                "points": float(row.get("points", 0))
                if str(row.get("points", "")).replace(".", "", 1).isdigit()
                else row.get("points", 0),
                "wins": int(row.get("wins", 0)) if str(row.get("wins", "")).isdigit() else row.get("wins", 0),
                "driverId": row.get("driverId", ""),
                "driverNumber": driver_number,
                "givenName": row.get("givenName", ""),
                "familyName": row.get("familyName", ""),
                "constructorName": constructor_name,
                "headshotUrl": meta.headshot_url if meta else None,
                "teamColor": meta.team_color if meta else "#2d2d35",
                "broadcastName": meta.broadcast_name if meta else "",
                "teamName": meta.team_name if meta else constructor_name,
            }
        )

    return records


def _persist_driver_standings(year: int, records: list, db: Session) -> None:
    db.query(DriverStandingModel).filter(DriverStandingModel.year == year).delete()
    for rec in records:
        db.add(
            DriverStandingModel(
                year=year,
                position=rec["position"],
                points=str(rec["points"]),
                wins=rec["wins"],
                driver_id=rec["driverId"],
                driver_number=rec["driverNumber"],
                given_name=rec["givenName"],
                family_name=rec["familyName"],
                constructor_name=rec["constructorName"],
                headshot_url=rec.get("headshotUrl"),
                team_color=rec.get("teamColor"),
                broadcast_name=rec.get("broadcastName"),
                team_name=rec.get("teamName"),
            )
        )
    db.commit()


def _hydrate_team_standings(year: int):
    ergast = Ergast()
    standings = ergast.get_constructor_standings(season=year)
    if not standings.content:
        return []
    df = standings.content[0].fillna("")
    return df.to_dict(orient="records")


def _persist_team_standings(year: int, records: list, db: Session) -> None:
    db.query(TeamStandingModel).filter(TeamStandingModel.year == year).delete()
    for rec in records:
        db.add(
            TeamStandingModel(
                year=year,
                position=int(rec.get("position", 0))
                if str(rec.get("position", "")).isdigit()
                else rec.get("position", 0),
                points=str(rec.get("points", "0")),
                wins=int(rec.get("wins", 0)) if str(rec.get("wins", "")).isdigit() else rec.get("wins", 0),
                constructor_id=rec.get(
                    "constructorId",
                    rec.get("constructorIds", [""])[0] if isinstance(rec.get("constructorIds", None), list) else "",
                ),
                constructor_name=rec.get(
                    "constructorName",
                    rec.get("constructorNames", [""])[0] if isinstance(rec.get("constructorNames", None), list) else "",
                ),
                nationality=rec.get("constructorNationality", ""),
            )
        )
    db.commit()


# --- HELPERS FOR SESSION RESULTS ---

def _fmt_td(td):
    if td is None:
        return None
    if isinstance(td, pd.Timedelta) and pd.isna(td):
        return None
    if hasattr(td, "total_seconds"):
        try:
            total_seconds = td.total_seconds()
            if pd.isna(total_seconds):
                return None

            hours, remainder = divmod(int(total_seconds), 3600)
            minutes, seconds = divmod(remainder, 60)
            ms = int((total_seconds - int(total_seconds)) * 1000)

            if hours > 0:
                return f"{hours}:{minutes:02d}:{seconds:02d}.{ms:03d}"
            return f"{minutes:02d}:{seconds:02d}.{ms:03d}"
        except (ValueError, TypeError):
            return None
    return str(td)


def _serialize_cached_results(cached):
    cached_sorted = sorted(
        cached,
        key=lambda x: float(x.position) if x.position and x.position.replace(".", "", 1).isdigit() else 999,
    )
    return [
        {
            "Position": c.position,
            "DriverNumber": c.driver_number,
            "BroadcastName": c.broadcast_name,
            "TeamName": c.team_name,
            "Time": c.time,
            "Status": c.status,
            "Points": c.points,
        }
        for c in cached_sorted
    ]


def _load_session_results(year: int, round: int, session_code: str, refresh: bool, db: Session):
    """Centralized loader that keeps DB cache in sync with FastF1.

    For completed events we always refresh from FastF1 to avoid stale pre-race data.
    """

    session_map = {"P1": "FP1", "P2": "FP2", "P3": "FP3", "Q": "Q", "S": "S", "R": "R"}
    f1_session_code = session_map.get(session_code)
    if not f1_session_code:
        raise HTTPException(status_code=400, detail="Invalid session code")

    # Detect live weekend and whether the event is already finished
    live_window = False
    event_finished = False
    try:
        race = db.query(RaceModel).filter(RaceModel.year == year, RaceModel.round == round).first()
        if race and race.date:
            race_date = datetime.fromisoformat(str(race.date)).date()
            today = datetime.now(timezone.utc).date()
            if abs((race_date - today).days) <= 4:
                live_window = True
            if today > race_date:
                event_finished = True
    except Exception as e:
        print(f"Could not determine live window: {e}")

    # Prefer cached data whenever refresh is False. This avoids reloading FastF1 for finished events.
    if not refresh:
        cached = (
            db.query(SessionResultModel)
            .filter(
                SessionResultModel.year == year,
                SessionResultModel.round == round,
                SessionResultModel.session_code == session_code,
            )
            .order_by(SessionResultModel.position)
            .all()
        )
        if cached:
            return _serialize_cached_results(cached)

    # Fetch fresh data from FastF1
    try:
        print(f"[DEBUG] Loading {f1_session_code} for year={year}, round={round}")
        try:
            sess = fastf1.get_session(year, round, f1_session_code)
        except ValueError as ve:
            print(f"[WARN] Session '{f1_session_code}' not found for this event: {ve}")
            return []
        except Exception as e:
            print(f"[ERR] Failed to initialize session: {e}")
            raise

        print(f"[DEBUG] Session: {sess.event['EventName']} - {sess.name} on {sess.date}")
        sess.load(laps=True, telemetry=False, weather=False, messages=False)
        results = sess.results.fillna("")
        laps = sess.laps
        print(f"[DEBUG] Loaded {len(results)} results for {f1_session_code}")

        db.query(SessionResultModel).filter(
            SessionResultModel.year == year,
            SessionResultModel.round == round,
            SessionResultModel.session_code == session_code,
        ).delete()

        output = []
        for _, row in results.iterrows():
            driver_no = str(row.get("DriverNumber", ""))

            pos_val = row.get("Position", 999)
            try:
                position = str(int(float(pos_val)))
            except Exception:
                position = str(pos_val)

            best_time = None
            try:
                drv_laps = laps.pick_drivers(driver_no)
                if not drv_laps.empty:
                    best_lap = drv_laps.pick_fastest()
                    if best_lap is not None and "LapTime" in best_lap:
                        best_time = _fmt_td(best_lap["LapTime"])
            except Exception:
                best_time = None

            time_val = _fmt_td(row.get("Time", None)) or best_time or ""

            status = row.get("Status", "")
            if not time_val and status:
                time_val = status

            record = {
                "Position": position,
                "DriverNumber": driver_no,
                "BroadcastName": row.get("BroadcastName", ""),
                "TeamName": row.get("TeamName", ""),
                "Time": time_val,
                "Status": status,
                "Points": int(row.get("Points", 0))
                if str(row.get("Points", "")).replace(".", "", 1).isdigit()
                else 0,
            }
            output.append(record)

            db.add(
                SessionResultModel(
                    year=year,
                    round=round,
                    session_code=session_code,
                    position=position,
                    driver_number=record["DriverNumber"],
                    broadcast_name=record["BroadcastName"],
                    team_name=record["TeamName"],
                    time=record["Time"],
                    status=record["Status"],
                    points=record["Points"],
                )
            )

        db.commit()
        return output

    except Exception as e:
        print(f"Error fetching session: {e}")
        traceback.print_exc()
        cached = (
            db.query(SessionResultModel)
            .filter(
                SessionResultModel.year == year,
                SessionResultModel.round == round,
                SessionResultModel.session_code == session_code,
            )
            .order_by(SessionResultModel.position)
            .all()
        )
        if cached:
            return _serialize_cached_results(cached)

        raise HTTPException(status_code=500, detail=str(e))


# --- ANALYSIS HELPERS ---

def _to_ms(td):
    if td is None or (isinstance(td, pd.Timedelta) and pd.isna(td)):
        return None
    try:
        return int(td.total_seconds() * 1000)
    except Exception:
        return None


# --- DRIVER STATS (Ergast/Jolpica) ---

def get_driver_stats_from_jolpica(year: int, driver_number: str, db: Session):
    """Fetch driver season results and standings info from Jolpica (Ergast V2)."""

    print(f"Fetching stats for Driver #{driver_number} in {year}...")

    driver_full_name = None
    try:
        cached_driver = (
            db.query(DriverModel)
            .filter(
                DriverModel.year == year,
                DriverModel.driver_number == driver_number,
            )
            .first()
        )
        if cached_driver:
            driver_full_name = cached_driver.full_name.lower()
    except Exception as e:
        print(f"Could not read driver from DB: {e}")

    driver_id = None
    standing_position = None
    standing_points = None

    # Quick lookup from Standings API first
    try:
        standings_url = f"http://api.jolpi.ca/ergast/f1/{year}/driverStandings.json?limit=100"
        resp = requests.get(standings_url, timeout=5).json()
        drivers_list = resp["MRData"]["StandingsTable"]["StandingsLists"][0]["DriverStandings"]

        for d in drivers_list:
            info = d["Driver"]
            full_name = f"{info.get('givenName', '')} {info.get('familyName', '')}".strip().lower()

            if info.get("permanentNumber") == driver_number or info.get("driverId") == driver_number:
                driver_id = d["Driver"]["driverId"]
                standing_position = d.get("position")
                standing_points = d.get("points")
                break

            if driver_full_name and full_name == driver_full_name:
                driver_id = d["Driver"]["driverId"]
                standing_position = d.get("position")
                standing_points = d.get("points")
                break
    except Exception as e:
        print(f"Could not resolve ID via API: {e}")

    if not driver_id:
        driver_id = driver_number

    # Fetch Results directly from Jolpica
    try:
        url = f"http://api.jolpi.ca/ergast/f1/{year}/drivers/{driver_id}/results.json?limit=100"
        response = requests.get(url, timeout=10)
        data = response.json()

        races = data["MRData"]["RaceTable"]["Races"]

        formatted_results = []
        for race in races:
            result = race["Results"][0]
            formatted_results.append(
                {
                    "round": race["round"],
                    "raceName": race["raceName"],
                    "date": race["date"],
                    "grid": result["grid"],
                    "position": result["position"],
                    "status": result["status"],
                    "points": result["points"],
                }
            )

        return {
            "standingPosition": standing_position,
            "standingPoints": standing_points,
            "results": formatted_results,
        }

    except Exception as e:
        print(f"Direct fetch failed: {e}")
        return {"standingPosition": None, "standingPoints": None, "results": []}


# --- ETL ---

def process_year(year: int, db: Session) -> None:
    """Process a single year: races, drivers, and cache standings."""

    enable_fastf1_cache()

    print(f"[ETL] Processing Year: {year}...")

    # --- RACES ---
    if db.query(RaceModel).filter(RaceModel.year == year).first():
        print(f"   Using existing races for {year}.")
    else:
        try:
            schedule = fastf1.get_event_schedule(year)
            count = 0
            for _, race in schedule.iterrows():
                if race["EventFormat"] == "testing":
                    continue

                race_entry = RaceModel(
                    year=year,
                    round=race["RoundNumber"],
                    event_name=race["EventName"],
                    country=race["Country"],
                    location=race["Location"],
                    date=str(race["Session5Date"]),
                    event_format=race["EventFormat"],
                )
                db.add(race_entry)
                count += 1
            db.commit()
            print(f"   Added {count} races.")
        except Exception as e:
            print(f"   Warning: Could not fetch schedule for {year}: {e}")

    # --- DRIVERS ---
    # Fetch from latest completed round to reflect mid-season driver changes
    if db.query(DriverModel).filter(DriverModel.year == year).first():
        print(f"   Using existing drivers for {year}.")
    else:
        sync_drivers_for_year(year, db, force_refresh=False)

    # --- STANDINGS (Drivers/Teams) ---
    try:
        ergast = Ergast()
        driver_standings = ergast.get_driver_standings(season=year)
        constructor_standings = ergast.get_constructor_standings(season=year)

        if driver_standings.content:
            df = driver_standings.content[0].fillna("")
            db.query(DriverStandingModel).filter(DriverStandingModel.year == year).delete()
            for _, row in df.iterrows():
                constructor_name = ""
                if isinstance(row.get("constructorNames", None), list) and row["constructorNames"]:
                    constructor_name = row["constructorNames"][0]
                db.add(
                    DriverStandingModel(
                        year=year,
                        position=int(row.get("position", 0))
                        if str(row.get("position", "")).isdigit()
                        else row.get("position", 0),
                        points=str(row.get("points", "0")),
                        wins=int(row.get("wins", 0)) if str(row.get("wins", "")).isdigit() else row.get("wins", 0),
                        driver_id=row.get("driverId", ""),
                        driver_number=str(row.get("driverNumber", "")),
                        given_name=row.get("givenName", ""),
                        family_name=row.get("familyName", ""),
                        constructor_name=constructor_name,
                        headshot_url=None,
                        team_color=None,
                        broadcast_name="",
                        team_name=constructor_name,
                    )
                )
            db.commit()
            print(f"   Cached driver standings for {year}.")

        if constructor_standings.content:
            df = constructor_standings.content[0].fillna("")
            db.query(TeamStandingModel).filter(TeamStandingModel.year == year).delete()
            for _, row in df.iterrows():
                constructor_name = row.get("constructorName", "")
                if not constructor_name and isinstance(row.get("constructorNames", None), list) and row["constructorNames"]:
                    constructor_name = row["constructorNames"][0]
                db.add(
                    TeamStandingModel(
                        year=year,
                        position=int(row.get("position", 0))
                        if str(row.get("position", "")).isdigit()
                        else row.get("position", 0),
                        points=str(row.get("points", "0")),
                        wins=int(row.get("wins", 0)) if str(row.get("wins", "")).isdigit() else row.get("wins", 0),
                        constructor_id=row.get("constructorId", ""),
                        constructor_name=constructor_name,
                        nationality=row.get("constructorNationality", ""),
                    )
                )
            db.commit()
            print(f"   Cached team standings for {year}.")
    except Exception as e:
        print(f"   Warning: Could not cache standings for {year}: {e}")


def run_etl() -> None:
    print("[ETL] Starting Multi-Year ETL Process...")
    init_db()
    db = SessionLocal()

    years_to_process = [2020, 2021, 2022, 2023, 2024, 2025]

    for year in years_to_process:
        process_year(year, db)

    db.close()
    print("[ETL] Complete.")


# --- Public exports for routers ---

hydrate_driver_standings = _hydrate_driver_standings
persist_driver_standings = _persist_driver_standings
hydrate_team_standings = _hydrate_team_standings
persist_team_standings = _persist_team_standings
load_session_results = _load_session_results

to_ms = _to_ms


def get_last_completed_round(year: int, db: Session) -> Optional[int]:
    """
    Determine the most recently completed round for the given year based on race date.
    Returns None if no race is in the past yet.
    """
    today = datetime.now(timezone.utc).date()
    races = (
        db.query(RaceModel)
        .filter(RaceModel.year == year)
        .order_by(RaceModel.round.asc())
        .all()
    )
    last_round = None
    for r in races:
        try:
            race_date = datetime.fromisoformat(str(r.date)).date()
            if race_date <= today:
                last_round = r.round
            else:
                break
        except Exception:
            continue
    return last_round


def sync_drivers_for_year(year: int, db: Session, force_refresh: bool = False) -> int:
    """
    Sync driver roster from the latest completed session for a given year.
    This ensures mid-season driver changes (team swaps) are reflected.
    
    Args:
        year: Season year to sync
        db: Database session
        force_refresh: If True, delete existing drivers and re-fetch from latest round
        
    Returns:
        Number of drivers synced
    """
    enable_fastf1_cache()
    
    # Find the latest completed round
    last_round = get_last_completed_round(year, db)
    
    # If no completed rounds, try round 1 (pre-season or early season)
    target_round = last_round if last_round else 1
    
    print(f"[DRIVER_SYNC] Syncing drivers for {year} from round {target_round} (force_refresh={force_refresh})")
    
    # Check if we should skip (drivers exist and not forcing refresh)
    existing_count = db.query(DriverModel).filter(DriverModel.year == year).count()
    if existing_count > 0 and not force_refresh:
        print(f"[DRIVER_SYNC] {existing_count} drivers already exist for {year}, skipping sync")
        return existing_count
    
    try:
        # Load session from target round
        session = fastf1.get_session(year, target_round, "R")
        session.load(laps=False, telemetry=False, weather=False, messages=False)
        
        # Delete existing drivers if force refresh
        if force_refresh:
            deleted = db.query(DriverModel).filter(DriverModel.year == year).delete()
            print(f"[DRIVER_SYNC] Deleted {deleted} existing drivers for {year}")
        
        # Insert new drivers
        count = 0
        for drv_code in session.drivers:
            drv = session.get_driver(drv_code)
            driver_entry = DriverModel(
                year=year,
                driver_number=str(drv["DriverNumber"]),
                broadcast_name=drv["BroadcastName"],
                full_name=drv["FullName"],
                team_name=drv["TeamName"],
                team_color=f"#{drv['TeamColor']}" if drv["TeamColor"] else "#333333",
                headshot_url=drv["HeadshotUrl"],
            )
            db.add(driver_entry)
            count += 1
        
        db.commit()
        print(f"[DRIVER_SYNC] Added {count} drivers for {year} (round {target_round})")
        return count
        
    except Exception as e:
        print(f"[DRIVER_SYNC] Warning: Could not sync drivers for {year}: {e}")
        db.rollback()
        return 0


def prewarm_last_completed_race(year: int, db: Session) -> None:
    """
    Pre-cache the last completed race results into the DB so API responses are instant.
    """
    last_round = get_last_completed_round(year, db)
    if not last_round:
        return
    try:
        # refresh=False so we reuse cache if already present; otherwise it will fetch once and store.
        _load_session_results(year, last_round, "R", refresh=False, db=db)
        print(f"[PREWARM] Cached race results for {year} round {last_round}")
    except Exception as e:  # pragma: no cover - best effort prewarm
        print(f"[PREWARM] Failed to cache {year} round {last_round}: {e}")


def cache_races_snapshot(year: int, db: Session) -> list[dict]:
    """
    Store a ready-to-serve snapshot of the races list in AppCacheModel.
    Returns the payload stored.
    Optimized for performance: single query, efficient upsert.
    """
    import time
    query_start = time.time()
    
    # Single optimized query with explicit ordering
    races = (
        db.query(RaceModel)
        .filter(RaceModel.year == year)
        .order_by(RaceModel.round.asc())
        .all()
    )
    query_elapsed = (time.time() - query_start) * 1000
    
    # Build minimal payload (only fields needed for RaceCard)
    # EventDate is included for frontend compatibility (RaceCard uses Session5Date || EventDate)
    build_start = time.time()
    payload = [
        {
            "RoundNumber": r.round,
            "EventName": r.event_name,
            "Country": r.country,
            "Location": r.location,
            "Session5Date": r.date,
            "EventDate": r.date,  # Frontend compatibility: RaceCard uses Session5Date || EventDate
            "EventFormat": r.event_format,
        }
        for r in races
    ]
    build_elapsed = (time.time() - build_start) * 1000

    # Efficient upsert: cache the payload (even if empty) to avoid repeated DB queries
    cache_start = time.time()
    key = f"all_races_{year}"
    # Try to get existing first (for update path)
    existing = db.query(AppCacheModel).filter(AppCacheModel.key == key).first()
    if existing:
        existing.data = payload
    else:
        db.add(AppCacheModel(key=key, data=payload))
    db.commit()
    cache_elapsed = (time.time() - cache_start) * 1000
    
    total_elapsed = (time.time() - query_start) * 1000
    print(f"[PERF] cache_races_snapshot({year}): query={query_elapsed:.2f}ms, build={build_elapsed:.2f}ms, cache_write={cache_elapsed:.2f}ms, total={total_elapsed:.2f}ms")
    
    return payload
