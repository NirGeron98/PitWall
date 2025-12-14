"""
ETL entrypoint for precomputing heavy race/analysis payloads.

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
    existing = db.query(AppCacheModel).filter(AppCacheModel.key == key).first()
    if existing:
        existing.data = payload
    else:
        existing = AppCacheModel(key=key, data=payload)
        db.add(existing)
    db.commit()


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
    except Exception as e:  # pragma: no cover - best effort meta
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
    """Load once from FastF1, then write all heavy payloads into AppCacheModel."""
    print(f"[ETL] Caching analysis for {year} round {round_}")
    sess = fastf1.get_session(year, round_, "R")
    sess.load(laps=True, telemetry=True, weather=False, messages=False)

    db = SessionLocal()
    try:
        # Laps (all drivers)
        laps_payload = build_laps_payload(sess)
        _save_cache(db, f"analysis_laps_{year}_{round_}", laps_payload)

        # Per-driver telemetry and stints
        for code in sess.drivers:
            drv = sess.get_driver(code)
            driver_num = str(drv.get("DriverNumber", code))

            telemetry_payload = build_telemetry_payload(sess, driver_num, lap=None, downsample=400)
            _save_cache(db, f"telemetry_{year}_{round_}_{driver_num}", telemetry_payload)

            stints_payload = build_stints_payload(sess, driver_num)
            _save_cache(db, f"stints_{year}_{round_}_{driver_num}", stints_payload)
    finally:
        db.close()


def _to_ms(time_val):
    if pd.isna(time_val):
        return None
    try:
        return int(time_val.total_seconds() * 1000)
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="Cache analysis/telemetry/stints data.")
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--round", type=int, required=True, dest="round_")
    args = parser.parse_args()

    init_db()
    cache_race_analysis(args.year, args.round_)


if __name__ == "__main__":
    main()
