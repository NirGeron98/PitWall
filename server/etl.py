"""
ETL entrypoint for precomputing heavy race/analysis payloads AND Race Results.

Usage (from repo root):
    # Cache analysis data for a specific race
    python server/etl.py --year 2024 --round 1

    # Sync driver roster from latest completed round (handles mid-season transfers)
    python server/etl.py --sync-drivers --year 2025

    # Full ETL for all years (runs driver sync automatically)
    python server/etl.py --full
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import fastf1
import numpy as np
import pandas as pd

# Ensure we can import app.* when executed from repo root
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))
if str(ROOT / "app") not in sys.path:
    sys.path.append(str(ROOT / "app"))

from app.database import SessionLocal, init_db  # noqa: E402
from app.models import AppCacheModel, DriverModel, RaceModel  # noqa: E402
from app.core.config import CACHE_DIR  # noqa: E402


def enable_fastf1_cache() -> None:
    """Enable FastF1's disk cache for faster subsequent loads."""
    import os
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)
    fastf1.Cache.enable_cache(CACHE_DIR)


def _save_cache(db, key: str, payload: Any) -> None:
    """Helper to upsert JSON payload into DB."""
    existing = db.query(AppCacheModel).filter(AppCacheModel.key == key).first()
    if existing:
        existing.data = payload
    else:
        existing = AppCacheModel(key=key, data=payload)
        db.add(existing)
    db.commit()


def _to_ms(time_val):
    if pd.isna(time_val):
        return None
    try:
        return int(time_val.total_seconds() * 1000)
    except Exception:
        return None


def _fmt_td(td) -> str | None:
    """Format Timedelta-like values into FastF1-friendly time strings."""
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


def _fmt_gap_seconds(td) -> str | None:
    """Format a Timedelta-like as '+25.000s'."""
    if td is None:
        return None
    if isinstance(td, pd.Timedelta) and pd.isna(td):
        return None
    if hasattr(td, "total_seconds"):
        try:
            seconds = float(td.total_seconds())
            if pd.isna(seconds):
                return None
            if seconds < 0:
                seconds = abs(seconds)
            return f"+{seconds:.3f}s"
        except (ValueError, TypeError):
            return None
    return None

# --- NEW FUNCTION FOR RACE RESULTS ---
def build_race_results_payload(session) -> List[Dict[str, Any]]:
    """Build a ready-to-render Race Results classification payload.

    Returns a list of dicts with the normalized keys requested by the frontend:
      - position ("P1")
      - driverNumber ("#81")
      - broadcastName ("O PIASTRI")
      - fullName ("Oscar Piastri")
      - teamName ("McLaren")
      - teamColor ("#FF8700")
      - time (winner: "1:38:29.849", others: "+25.000s")
      - status ("Finished", "DNF", "+1 Lap")
      - points (int)
      - headshotUrl

    For backwards compatibility with the current client, each dict also includes
    the legacy FastF1-style capitalized keys (Position, DriverNumber, ...).
    """

    if session.results is None or session.results.empty:
        return []

    results_df = session.results.fillna("")

    # Determine winner time (if available) for gap calculations.
    winner_td = None
    try:
        winner_row = results_df.loc[results_df["Position"] == 1]
        if not winner_row.empty:
            winner_td = winner_row.iloc[0].get("Time")
    except Exception:
        winner_td = None

    payload: List[Dict[str, Any]] = []

    for _, row in results_df.iterrows():
        pos_raw = row.get("Position", "")
        try:
            pos_int = int(float(pos_raw))
        except Exception:
            pos_int = None

        status = str(row.get("Status", "") or "").strip()

        driver_number_plain = str(row.get("DriverNumber", "") or "").strip()
        driver_number_hash = f"#{driver_number_plain}" if driver_number_plain else ""

        team_color_raw = str(row.get("TeamColor", "") or "").strip()
        team_color = f"#{team_color_raw}" if team_color_raw and not team_color_raw.startswith("#") else (team_color_raw or "#888888")

        td = row.get("Time", None)

        # time formatting:
        # - winner: full race time
        # - classified finishers: gap like +25.000s (FastF1 sometimes stores gap already)
        # - lapped/DNF: use status when time is missing
        time_str = None
        if pos_int == 1:
            time_str = _fmt_td(td)
        else:
            if status.lower() == "finished" and td is not None:
                # If FastF1 stores absolute time: compute delta to winner.
                # If FastF1 stores gap already: use td directly.
                gap_td = None
                if winner_td is not None and hasattr(td, "total_seconds") and hasattr(winner_td, "total_seconds"):
                    try:
                        gap_td = td - winner_td if td > winner_td else td
                    except Exception:
                        gap_td = td
                else:
                    gap_td = td

                time_str = _fmt_gap_seconds(gap_td) or _fmt_td(td)

        if not time_str:
            # For +1 Lap, DNF, DSQ etc we fall back to status.
            time_str = status or ""

        points_raw = row.get("Points", 0)
        try:
            points = int(float(points_raw))
        except Exception:
            points = 0

        broadcast_name = str(row.get("BroadcastName", "") or "").strip()
        full_name = str(row.get("FullName", "") or "").strip()
        team_name = str(row.get("TeamName", "") or "").strip()

        headshot_url = row.get("HeadshotUrl", None) or None
        if not headshot_url:
            # Some FastF1 versions expose headshot/team meta through session.get_driver
            try:
                drv = session.get_driver(driver_number_plain)
                headshot_url = drv.get("HeadshotUrl") if drv else None
                if not full_name:
                    full_name = (drv.get("FullName") or "").strip() if drv else full_name
                if not broadcast_name:
                    broadcast_name = (drv.get("BroadcastName") or "").strip() if drv else broadcast_name
                if not team_name:
                    team_name = (drv.get("TeamName") or "").strip() if drv else team_name
                if (team_color == "#888888" or not team_color_raw) and drv and drv.get("TeamColor"):
                    team_color = f"#{drv.get('TeamColor')}"
            except Exception:
                headshot_url = None

        normalized_pos = f"P{pos_int}" if pos_int and pos_int > 0 else "NC"

        payload.append(
            {
                # New normalized keys
                "position": normalized_pos,
                "driverNumber": driver_number_hash,
                "broadcastName": broadcast_name,
                "fullName": full_name,
                "teamName": team_name,
                "teamColor": team_color,
                "time": time_str,
                "status": status,
                "points": points,
                "headshotUrl": headshot_url,
                # Legacy keys used by the existing client
                "Position": pos_int if pos_int is not None else (str(pos_raw) if pos_raw != "" else ""),
                "DriverNumber": driver_number_plain,
                "BroadcastName": broadcast_name,
                "TeamName": team_name,
                "Time": _fmt_td(td) or time_str,
                "Status": status,
                "Points": points,
            }
        )

    payload.sort(
        key=lambda item: int(item["Position"]) if str(item.get("Position", "")).isdigit() else 999
    )
    return payload


def build_laps_payload(sess) -> Dict[str, Any]:
    laps = sess.laps
    payload: List[Dict[str, Any]] = []
    for _, lap in laps.iterrows():
        payload.append(
            {
                "driverNumber": str(lap.get("DriverNumber", "")),
                "lapNumber": int(lap["LapNumber"]) if not pd.isna(lap["LapNumber"]) else None,
                "lapTimeMs": _to_ms(lap.get("LapTime")),
                "s1Ms": _to_ms(lap.get("Sector1Time", None)),
                "s2Ms": _to_ms(lap.get("Sector2Time", None)),
                "s3Ms": _to_ms(lap.get("Sector3Time", None)),
                "compound": lap.get("Compound"),
                "stint": lap.get("Stint"),
                "position": int(lap["Position"]) if not pd.isna(lap["Position"]) else None,
            }
        )

    driver_meta: List[Dict[str, Any]] = []
    try:
        for code in sess.drivers:
            drv = sess.get_driver(code)
            driver_meta.append(
                {
                    "driverNumber": str(drv.get("DriverNumber", "")),
                    "broadcastName": drv.get("BroadcastName", ""),
                    "fullName": drv.get("FullName", ""),
                    "teamName": drv.get("TeamName", ""),
                    "teamColor": f"#{drv.get('TeamColor')}" if drv.get("TeamColor") else "#888",
                    "headshotUrl": drv.get("HeadshotUrl"),
                }
            )
    except Exception as e:
        print(f"[cache_laps] driver meta failed: {e}")

    return {"laps": payload, "drivers": driver_meta}


def build_telemetry_payload(sess, driver: str, lap: int | None, downsample: int = 400) -> Dict[str, Any]:
    laps = sess.laps.pick_driver(driver)

    target_lap = None
    if lap:
        target_lap = (
            laps.loc[laps["LapNumber"] == lap].iloc[0]
            if not laps.empty and lap in laps["LapNumber"].values
            else None
        )
    if target_lap is None and not laps.empty:
        target_lap = laps.pick_fastest()

    if target_lap is None:
        return {"distance": [], "speed": [], "throttle": [], "brake": [], "gear": [], "lapNumber": None}

    car_data = target_lap.get_car_data()
    if car_data.empty:
        return {"distance": [], "speed": [], "throttle": [], "brake": [], "gear": [], "lapNumber": None}

    if downsample and len(car_data) > downsample:
        idx = np.linspace(0, len(car_data) - 1, downsample).astype(int)
        car_data = car_data.iloc[idx]

    return {
        "distance": car_data["Distance"].tolist() if "Distance" in car_data else list(range(len(car_data))),
        "speed": car_data["Speed"].tolist(),
        "throttle": car_data["Throttle"].tolist(),
        "brake": car_data["Brake"].tolist() if "Brake" in car_data else [0] * len(car_data),
        "gear": car_data["nGear"].tolist() if "nGear" in car_data else [0] * len(car_data),
        "lapNumber": int(target_lap["LapNumber"]) if not pd.isna(target_lap["LapNumber"]) else None,
    }


def build_stints_payload(sess, driver: str) -> List[Dict[str, Any]]:
    laps = sess.laps.pick_driver(driver)
    if laps.empty:
        return []

    stints: List[Dict[str, Any]] = []
    for stint_num, stint_df in laps.groupby("Stint"):
        stints.append(
            {
                "stint": int(stint_num) if not pd.isna(stint_num) else None,
                "compound": stint_df["Compound"].iloc[0] if "Compound" in stint_df else None,
                "startLap": int(stint_df["LapNumber"].min()),
                "endLap": int(stint_df["LapNumber"].max()),
                "lapCount": int(stint_df["LapNumber"].max() - stint_df["LapNumber"].min() + 1),
            }
        )
    return stints


def cache_race_analysis(year: int, round_: int) -> None:
    """Load once from FastF1, then write ALL heavy payloads into AppCacheModel."""
    enable_fastf1_cache()
    sess = fastf1.get_session(year, round_, "R")
    sess.load(laps=True, telemetry=True, weather=False, messages=False)

    db = SessionLocal()
    try:
        # 1. Race Results (The Classification Table)
        results_payload = build_race_results_payload(sess)
        _save_cache(db, f"race_results_{year}_{round_}", results_payload)

        # 2. Laps (all drivers)
        laps_payload = build_laps_payload(sess)
        _save_cache(db, f"analysis_laps_{year}_{round_}", laps_payload)

        # 3. Per-driver telemetry and stints
        for code in sess.drivers:
            drv = sess.get_driver(code)
            driver_num = str(drv.get("DriverNumber", code))

            telemetry_payload = build_telemetry_payload(sess, driver_num, lap=None, downsample=400)
            _save_cache(db, f"telemetry_{year}_{round_}_{driver_num}", telemetry_payload)

            stints_payload = build_stints_payload(sess, driver_num)
            _save_cache(db, f"stints_{year}_{round_}_{driver_num}", stints_payload)
        

    finally:
        db.close()


# =============================================================================
# DRIVER SYNC FUNCTIONS
# =============================================================================

def get_last_completed_round(year: int, db) -> Optional[int]:
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


def sync_drivers_from_session(year: int, round_: int, db) -> Dict[str, Any]:
    """
    Sync driver roster from a specific session.
    Uses UPSERT logic: updates existing drivers, inserts new ones, preserves absent drivers.
    
    This handles mid-season driver changes (team swaps like Tsunoda to Red Bull)
    while keeping drivers who might be absent from a specific race.
    
    Args:
        year: Season year
        round_: Round number to sync from
        db: Database session
        
    Returns:
        Dict with sync results
    """
    
    try:
        session = fastf1.get_session(year, round_, "R")
        session.load(laps=False, telemetry=False, weather=False, messages=False)
        
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
                # UPDATE: Driver exists, update their team info
                existing_driver = existing_drivers[driver_number]
                
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
            "success": True,
            "updated": updated_count,
            "inserted": inserted_count,
            "total": total_count,
            "round": round_,
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        db.rollback()
        return {"success": False, "error": str(e), "round": round_}


def sync_drivers_for_year(year: int) -> Dict[str, Any]:
    """
    Sync driver roster for a year from the latest completed round.
    
    This is the main entry point for driver synchronization.
    It identifies the latest round with results and syncs driver info from it.
    
    Args:
        year: Season year to sync
        
    Returns:
        Dict with sync results
    """
    enable_fastf1_cache()
    init_db()
    db = SessionLocal()
    
    try:
        
        # First, ensure we have race data for this year
        if not db.query(RaceModel).filter(RaceModel.year == year).first():
            print(f"[DRIVER_SYNC] No race data for {year}, fetching schedule...")
            try:
                schedule = fastf1.get_event_schedule(year)
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
                db.commit()
            except Exception as e:
                print(f"[DRIVER_SYNC] Warning: Could not fetch schedule: {e}")
        
        # Find the latest completed round
        last_round = get_last_completed_round(year, db)
        
        if not last_round:
            # No completed rounds, try round 1 for pre-season data
            last_round = 1
        
        result = sync_drivers_from_session(year, last_round, db)
        
        if result.get("success"):
            print(f"[DRIVER_SYNC] Complete: {result.get('updated', 0)} updated, {result.get('inserted', 0)} inserted, {result.get('total', 0)} total drivers")
        else:
            print(f"[DRIVER_SYNC] Failed: {result.get('error', 'Unknown error')}")
        
        return result
        
    finally:
        db.close()


def run_full_etl() -> None:
    """
    Run full ETL process for all recent years.
    This includes race schedules, driver sync, and standings.
    """
    from app.services.f1_service import run_etl
    run_etl()


def main():
    parser = argparse.ArgumentParser(
        description="PitWall ETL: Cache analysis data and sync driver rosters.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Cache analysis for a specific race
  python server/etl.py --year 2024 --round 1

  # Sync drivers from latest completed round (handles mid-season transfers)
  python server/etl.py --sync-drivers --year 2025

  # Run full ETL for all years
  python server/etl.py --full
        """
    )
    
    # Analysis caching options
    parser.add_argument("--year", type=int, help="Season year")
    parser.add_argument("--round", type=int, dest="round_", help="Round number for analysis caching")
    
    # Driver sync option
    parser.add_argument(
        "--sync-drivers",
        action="store_true",
        help="Sync driver roster from latest completed round (requires --year)"
    )
    
    # Full ETL option
    parser.add_argument(
        "--full",
        action="store_true",
        help="Run full ETL for all years (2020-current)"
    )

    # Warm session_results cache (all sessions of all completed rounds)
    parser.add_argument(
        "--warm",
        action="store_true",
        help="Warm session_results for completed rounds. Use --year for one season, otherwise all years."
    )

    args = parser.parse_args()

    init_db()
    enable_fastf1_cache()

    if args.warm:
        from app.services.f1_service import (
            warm_all_completed_sessions,
            warm_all_completed_sessions_all_years,
        )
        db = SessionLocal()
        try:
            if args.year:
                summary = warm_all_completed_sessions(args.year, db)
                print(f"\nWarm complete: {summary}")
            else:
                summaries = warm_all_completed_sessions_all_years(db)
                print(f"\nWarm complete for all years: {summaries}")
        finally:
            db.close()
    elif args.full:
        # Run full ETL
        run_full_etl()
    elif args.sync_drivers:
        # Sync drivers for a specific year
        if not args.year:
            parser.error("--sync-drivers requires --year")
        result = sync_drivers_for_year(args.year)
        if result.get("success"):
            print(f"\nDriver sync successful!")
            print(f"  Year: {args.year}")
            print(f"  Round synced: {result.get('round')}")
            print(f"  Updated: {result.get('updated', 0)}")
            print(f"  Inserted: {result.get('inserted', 0)}")
            print(f"  Total drivers: {result.get('total', 0)}")
        else:
            print(f"\nDriver sync failed: {result.get('error', 'Unknown error')}")
            sys.exit(1)
    elif args.year and args.round_:
        # Cache analysis for specific race
        cache_race_analysis(args.year, args.round_)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()