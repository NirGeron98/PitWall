from __future__ import annotations

import os
import traceback
from datetime import datetime, timedelta, timezone
from typing import Optional

import fastf1
import numpy as np
import pandas as pd
import requests
from fastapi import HTTPException
from fastf1.ergast import Ergast
from sqlalchemy.orm import Session

import time

from app.core.config import CACHE_DIR, LIVE_SESSION_TTL_SECONDS, LIVE_WINDOW_DAYS
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

def _log_session_timing(year, round, session_code, *, cache, source, load, db, total, rows):
    """One structured line per session load to confirm where time is spent."""
    print(
        f"[SESSION] {year}/{round}/{session_code} cache={cache} source={source} "
        f"load={load:.2f}s db={db * 1000:.1f}ms total={total:.2f}s rows={rows}"
    )


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


def _cache_is_stale(cached, ttl_seconds: int) -> bool:
    """True if the freshest cached row is older than ttl_seconds (or has no timestamp)."""
    newest = None
    for row in cached:
        ts = getattr(row, "fetched_at", None)
        if ts is None:
            return True
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if newest is None or ts > newest:
            newest = ts
    if newest is None:
        return True
    age = (datetime.now(timezone.utc) - newest).total_seconds()
    return age > ttl_seconds


def _best_lap_times_by_driver(laps) -> dict:
    """Vectorized fastest-lap-per-driver, replacing a per-driver pick loop.

    Returns {driver_number: formatted_time}. Empty dict on any problem.
    """
    try:
        if laps is None or laps.empty or "LapTime" not in laps.columns:
            return {}
        valid = laps[laps["LapTime"].notna()]
        if valid.empty:
            return {}
        fastest = valid.groupby("DriverNumber")["LapTime"].min()
        return {str(num): _fmt_td(lap) for num, lap in fastest.items()}
    except Exception:
        return {}


def _load_session_results(
    year: int,
    round: int,
    session_code: str,
    refresh: bool,
    db: Session,
    force: bool = False,
):
    """Centralized loader that keeps the DB cache in sync with FastF1.

    Cache policy:
    - Completed events outside the live window are immutable: always served from
      the DB cache, ignoring a client ``refresh`` (only an admin ``force`` reloads).
    - Inside the live window (+/- LIVE_WINDOW_DAYS) we serve cached rows but
      revalidate from FastF1 when they are older than LIVE_SESSION_TTL_SECONDS or
      ``refresh`` is requested.
    """

    req_start = time.perf_counter()

    session_map = {"P1": "FP1", "P2": "FP2", "P3": "FP3", "Q": "Q", "S": "S", "R": "R"}
    f1_session_code = session_map.get(session_code)
    if not f1_session_code:
        raise HTTPException(status_code=400, detail="Invalid session code")

    # Map session code → which session date field to check.
    # Conventional: P1→session1, P2→session2, P3→session3, Q→session4, R→session5
    # Sprint: P1→session1, S→session3, Q→session4, R→session5
    session_date_field = {
        "P1": "session1_date", "P2": "session2_date", "P3": "session3_date",
        "Q": "session4_date", "S": "session3_date", "R": "session5_date",
    }.get(session_code, "session5_date")

    # Detect live weekend and whether the event / specific session is already finished.
    live_window = False
    event_finished = False
    session_ended = False  # True when THIS session's scheduled start has passed
    try:
        race = db.query(RaceModel).filter(RaceModel.year == year, RaceModel.round == round).first()
        if race and race.date:
            race_date = datetime.fromisoformat(str(race.date)).date()
            now_utc = datetime.now(timezone.utc)
            today = now_utc.date()
            if abs((race_date - today).days) <= LIVE_WINDOW_DAYS:
                live_window = True
            if today > race_date:
                event_finished = True
            # Check the specific session date (e.g. Session1Date for P1)
            session_date_str = getattr(race, session_date_field, None)
            if session_date_str and str(session_date_str) not in ("None", "NaT", ""):
                try:
                    session_dt = datetime.fromisoformat(str(session_date_str))
                    if session_dt.tzinfo is None:
                        session_dt = session_dt.replace(tzinfo=timezone.utc)
                    # Consider session "ended" if its scheduled start + 2h has passed.
                    if now_utc > session_dt + timedelta(hours=2):
                        session_ended = True
                except Exception:
                    pass
    except Exception as e:
        print(f"Could not determine live window: {e}")

    db_start = time.perf_counter()
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
    db_elapsed = time.perf_counter() - db_start

    # Decide whether the cache can be served without hitting FastF1.
    serve_cache = False
    if cached and not force:
        if live_window:
            # Stale-while-revalidate: serve cache unless explicitly refreshing or stale.
            serve_cache = not refresh and not _cache_is_stale(cached, LIVE_SESSION_TTL_SECONDS)
        else:
            # Completed/immutable (or pre-event placeholder): cache is authoritative.
            serve_cache = True

    if serve_cache:
        _log_session_timing(
            year, round, session_code, cache="hit", source="db",
            load=0.0, db=db_elapsed, total=time.perf_counter() - req_start, rows=len(cached),
        )
        return {"results": _serialize_cached_results(cached), "session_status": "ok"}

    # Fetch fresh data from FastF1
    try:
        load_start = time.perf_counter()
        try:
            sess = fastf1.get_session(year, round, f1_session_code)
        except ValueError:
            status = "ended_no_data" if session_ended else "no_data"
            return {"results": [], "session_status": status}
        except Exception:
            raise

        sess.load(laps=True, telemetry=False, weather=False, messages=False)
        load_elapsed = time.perf_counter() - load_start
        results = sess.results.fillna("")
        # sess.laps raises DataNotLoadedError when a session has no timing data yet
        # (e.g. a just-scheduled round). Resolve it safely before use so such
        # sessions degrade to "no best laps" instead of failing the whole load.
        try:
            session_laps = sess.laps
        except Exception:
            session_laps = None
        best_times = _best_lap_times_by_driver(session_laps)

        db.query(SessionResultModel).filter(
            SessionResultModel.year == year,
            SessionResultModel.round == round,
            SessionResultModel.session_code == session_code,
        ).delete()

        now = datetime.now(timezone.utc)
        output = []
        for _, row in results.iterrows():
            driver_no = str(row.get("DriverNumber", ""))

            pos_val = row.get("Position", 999)
            try:
                position = str(int(float(pos_val)))
            except Exception:
                position = str(pos_val)

            best_time = best_times.get(driver_no)
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
                    fetched_at=now,
                )
            )

        db.commit()
        _log_session_timing(
            year, round, session_code, cache="miss", source="fastf1",
            load=load_elapsed, db=db_elapsed, total=time.perf_counter() - req_start, rows=len(output),
        )
        # Determine the session status to return alongside results.
        if output:
            status = "ok"
        elif session_ended:
            status = "ended_no_data"  # session finished, FastF1 hasn't published yet
        else:
            status = "no_data"  # session hasn't happened or has no data
        return {"results": output, "session_status": status}

    except Exception as e:
        traceback.print_exc()
        # Fall back to whatever we already have cached so a transient FastF1
        # failure never blanks out a known-good session.
        if cached:
            _log_session_timing(
                year, round, session_code, cache="hit", source="db-fallback",
                load=0.0, db=db_elapsed, total=time.perf_counter() - req_start, rows=len(cached),
            )
            return {"results": _serialize_cached_results(cached), "session_status": "ok"}

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
        return {"standingPosition": None, "standingPoints": None, "results": []}


# --- ETL ---

def process_year(year: int, db: Session) -> None:
    """Process a single year: races, drivers, and cache standings."""

    enable_fastf1_cache()


    # --- RACES ---
    def _safe_date(val) -> str | None:
        try:
            return str(val) if val is not None and str(val) not in ("None", "NaT") else None
        except Exception:
            return None

    try:
        schedule = fastf1.get_event_schedule(year)
        existing_rounds = {
            r.round for r in db.query(RaceModel).filter(RaceModel.year == year).all()
        }
        count = inserted = updated = 0
        for _, race in schedule.iterrows():
            if race["EventFormat"] == "testing":
                continue
            rnd = race["RoundNumber"]
            s1 = _safe_date(race.get("Session1Date"))
            s2 = _safe_date(race.get("Session2Date"))
            s3 = _safe_date(race.get("Session3Date"))
            s4 = _safe_date(race.get("Session4Date"))
            s5 = _safe_date(race.get("Session5Date"))
            if rnd in existing_rounds:
                # Backfill session dates on existing rows (added in a later migration).
                existing = db.query(RaceModel).filter(
                    RaceModel.year == year, RaceModel.round == rnd
                ).first()
                if existing and not existing.session1_date:
                    existing.session1_date = s1
                    existing.session2_date = s2
                    existing.session3_date = s3
                    existing.session4_date = s4
                    existing.session5_date = s5
                    updated += 1
            else:
                race_entry = RaceModel(
                    year=year,
                    round=rnd,
                    event_name=race["EventName"],
                    country=race["Country"],
                    location=race["Location"],
                    date=str(race["Session5Date"]),
                    event_format=race["EventFormat"],
                    session1_date=s1,
                    session2_date=s2,
                    session3_date=s3,
                    session4_date=s4,
                    session5_date=s5,
                )
                db.add(race_entry)
                inserted += 1
            count += 1
        db.commit()
        print(f"   Races {year}: {inserted} inserted, {updated} session-dates backfilled, {count} total.")
    except Exception as e:
        print(f"   Warning: Could not fetch schedule for {year}: {e}")

    # --- DRIVERS ---
    # Always sync from latest completed round to reflect mid-season driver changes
    # This ensures team swaps (e.g., Tsunoda to Red Bull) are captured
    sync_result = sync_drivers_for_year(year, db, force_refresh=True)
    if sync_result.get("error"):
        print(f"   Warning: Driver sync failed for {year}: {sync_result.get('error')}")
    else:
        print(f"   Driver sync for {year}: {sync_result.get('updated', 0)} updated, {sync_result.get('inserted', 0)} inserted (round {sync_result.get('round', 'N/A')})")

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
    except Exception as e:
        print(f"   Warning: Could not cache standings for {year}: {e}")


def run_etl() -> None:
    init_db()
    db = SessionLocal()

    current_year = datetime.now(timezone.utc).year
    years_to_process = list(range(2020, current_year + 1))

    for year in years_to_process:
        process_year(year, db)

    # Warm every completed session into the DB cache so race modal opens are
    # served from the DB instead of cold-loading FastF1 on first click.
    warm_all_completed_sessions_all_years(db, start_year=2020)

    db.close()


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


def sync_drivers_for_year(year: int, db: Session, force_refresh: bool = False) -> dict:
    """
    Sync driver roster from the latest completed session for a given year.
    Uses UPSERT logic: updates existing drivers, inserts new ones, preserves absent drivers.
    
    This ensures mid-season driver changes (team swaps like Tsunoda to Red Bull) are reflected
    while keeping drivers who might be absent from a specific race (injury, suspension, etc.).
    
    Args:
        year: Season year to sync
        db: Database session
        force_refresh: If True, always fetch from FastF1 even if drivers exist
        
    Returns:
        Dict with sync results: {updated: int, inserted: int, total: int, round: int}
    """
    enable_fastf1_cache()
    
    # Find the latest completed round
    last_round = get_last_completed_round(year, db)
    
    # If no completed rounds, try round 1 (pre-season or early season)
    target_round = last_round if last_round else 1
    
    
    # Check if we should skip (drivers exist and not forcing refresh)
    existing_count = db.query(DriverModel).filter(DriverModel.year == year).count()
    if existing_count > 0 and not force_refresh:
        return {"updated": 0, "inserted": 0, "total": existing_count, "round": target_round, "skipped": True}

    try:
        # Find a round that actually has driver data. The latest completed round may
        # have no published data yet (FastF1/Ergast lag for recent races), so fall
        # back through earlier rounds until one returns a non-empty driver list.
        session = None
        candidate_rounds = list(range(target_round, 0, -1))
        for candidate in candidate_rounds:
            try:
                candidate_session = fastf1.get_session(year, candidate, "R")
                candidate_session.load(laps=False, telemetry=False, weather=False, messages=False)
                if len(candidate_session.drivers) > 0:
                    session = candidate_session
                    target_round = candidate
                    break
            except Exception as load_err:
                print(f"[DRIVER_SYNC] {year} round {candidate} unavailable: {load_err}")
                continue

        if session is None:
            return {"updated": 0, "inserted": 0, "total": existing_count, "round": target_round,
                    "error": "no round with driver data"}

        # Build a map of existing drivers by driver_number for fast lookup
        existing_drivers = {
            d.driver_number: d 
            for d in db.query(DriverModel).filter(DriverModel.year == year).all()
        }
        
        updated_count = 0
        inserted_count = 0
        
        # Process each driver from the session
        for drv_code in session.drivers:
            drv = session.get_driver(drv_code)
            driver_number = str(drv["DriverNumber"])
            team_name = drv["TeamName"]
            team_color = f"#{drv['TeamColor']}" if drv["TeamColor"] else "#333333"
            broadcast_name = drv["BroadcastName"]
            full_name = drv["FullName"]
            headshot_url = drv["HeadshotUrl"]
            
            if driver_number in existing_drivers:
                # UPDATE: Driver exists, update their team info (handles mid-season transfers)
                existing_driver = existing_drivers[driver_number]
                
                # Track if anything actually changed
                changed = False
                if existing_driver.team_name != team_name:
                    existing_driver.team_name = team_name
                    changed = True
                if existing_driver.team_color != team_color:
                    existing_driver.team_color = team_color
                    changed = True
                if existing_driver.broadcast_name != broadcast_name:
                    existing_driver.broadcast_name = broadcast_name
                    changed = True
                if existing_driver.full_name != full_name:
                    existing_driver.full_name = full_name
                    changed = True
                if existing_driver.headshot_url != headshot_url:
                    existing_driver.headshot_url = headshot_url
                    changed = True
                
                if changed:
                    updated_count += 1
            else:
                # INSERT: New driver (mid-season replacement, rookie, etc.)
                driver_entry = DriverModel(
                    year=year,
                    driver_number=driver_number,
                    broadcast_name=broadcast_name,
                    full_name=full_name,
                    team_name=team_name,
                    team_color=team_color,
                    headshot_url=headshot_url,
                )
                db.add(driver_entry)
                inserted_count += 1
        
        db.commit()
        
        total_count = db.query(DriverModel).filter(DriverModel.year == year).count()
        
        return {
            "updated": updated_count,
            "inserted": inserted_count,
            "total": total_count,
            "round": target_round,
            "skipped": False
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        db.rollback()
        return {"updated": 0, "inserted": 0, "total": 0, "round": target_round, "error": str(e)}


def prewarm_last_completed_race(year: int, db: Session) -> None:
    """
    Pre-cache the last completed race results into the DB so API responses are instant.
    """
    last_round = get_last_completed_round(year, db)
    if not last_round:
        return
    try:
        # refresh=False so we reuse cache if already present; otherwise it will fetch once and store.
        result = _load_session_results(year, last_round, "R", refresh=False, db=db)
        rows = result.get("results", result) if isinstance(result, dict) else result
        _ = rows  # warming only — result discarded
    except Exception as e:  # pragma: no cover - best effort prewarm
        print(f"[PREWARM] Failed to cache {year} round {last_round}: {e}")


def _sessions_for_format(event_format: str | None) -> list[str]:
    """Session codes that exist for a given FastF1 event format.

    Sprint weekends run a single practice; conventional weekends run three.
    """
    fmt = (event_format or "").lower()
    if "sprint" in fmt:
        # FP1, Sprint Qualifying(->Q tab handled as Q), Sprint, Qualifying, Race.
        # We expose: one practice, Sprint, Qualifying, Race.
        return ["P1", "S", "Q", "R"]
    return ["P1", "P2", "P3", "Q", "R"]


def warm_all_completed_sessions(year: int, db: Session) -> dict:
    """Pre-populate session_results for every session of every completed round.

    Idempotent: sessions already cached (and fresh) are skipped, so re-running is
    cheap and makes no FastF1 calls. Per-session errors are swallowed so one bad
    session never aborts the batch. Returns a small summary for logging.
    """
    enable_fastf1_cache()

    last_round = get_last_completed_round(year, db)
    if not last_round:
        print(f"[WARM] {year}: no completed rounds yet, nothing to warm.")
        return {"year": year, "warmed": 0, "skipped": 0, "errors": 0}

    races = (
        db.query(RaceModel)
        .filter(RaceModel.year == year, RaceModel.round <= last_round)
        .order_by(RaceModel.round.asc())
        .all()
    )

    warmed = skipped = errors = 0
    for race in races:
        for session_code in _sessions_for_format(race.event_format):
            existing = (
                db.query(SessionResultModel)
                .filter(
                    SessionResultModel.year == year,
                    SessionResultModel.round == race.round,
                    SessionResultModel.session_code == session_code,
                )
                .first()
            )
            if existing:
                skipped += 1
                continue
            try:
                result = _load_session_results(year, race.round, session_code, refresh=False, db=db)
                rows = result.get("results", result) if isinstance(result, dict) else result
                if rows:
                    warmed += 1
                else:
                    skipped += 1  # session existed but had no data (future/no-data)

            except Exception as e:  # pragma: no cover - best effort warming
                errors += 1
                print(f"[WARM] Failed {year} R{race.round} {session_code}: {e}")

    summary = {"year": year, "warmed": warmed, "skipped": skipped, "errors": errors}
    print(f"[WARM] {year} complete: {summary}")
    return summary


def warm_all_completed_sessions_all_years(db: Session, start_year: int = 2020) -> list[dict]:
    """Warm every completed session across all seasons (2020 -> current)."""
    current_year = datetime.now(timezone.utc).year
    return [
        warm_all_completed_sessions(year, db)
        for year in range(start_year, current_year + 1)
    ]


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
            # Individual session dates — lets the frontend/backend know when each session ends.
            "Session1Date": r.session1_date,
            "Session2Date": r.session2_date,
            "Session3Date": r.session3_date,
            "Session4Date": r.session4_date,
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
    
    return payload
