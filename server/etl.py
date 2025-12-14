"""
ETL entrypoint for precomputing heavy race/analysis payloads AND Race Results.

Usage (from repo root):
    python server/etl.py --year 2024 --round 1
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

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
from app.models import AppCacheModel  # noqa: E402


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
    print(f"[ETL] Caching analysis for {year} round {round_}")
    sess = fastf1.get_session(year, round_, "R")
    sess.load(laps=True, telemetry=True, weather=False, messages=False)

    db = SessionLocal()
    try:
        # 1. Race Results (The Classification Table)
        results_payload = build_race_results_payload(sess)
        _save_cache(db, f"race_results_{year}_{round_}", results_payload)
        print(f"[ETL] Saved race results for {year}/{round_}")

        # 2. Laps (all drivers)
        laps_payload = build_laps_payload(sess)
        _save_cache(db, f"analysis_laps_{year}_{round_}", laps_payload)
        print(f"[ETL] Saved lap analysis for {year}/{round_}")

        # 3. Per-driver telemetry and stints
        for code in sess.drivers:
            drv = sess.get_driver(code)
            driver_num = str(drv.get("DriverNumber", code))

            telemetry_payload = build_telemetry_payload(sess, driver_num, lap=None, downsample=400)
            _save_cache(db, f"telemetry_{year}_{round_}_{driver_num}", telemetry_payload)

            stints_payload = build_stints_payload(sess, driver_num)
            _save_cache(db, f"stints_{year}_{round_}_{driver_num}", stints_payload)
        
        print(f"[ETL] Done processing drivers for {year}/{round_}")

    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Cache analysis/telemetry/stints data.")
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--round", type=int, required=True, dest="round_")
    args = parser.parse_args()

    init_db()
    cache_race_analysis(args.year, args.round_)


if __name__ == "__main__":
    main()