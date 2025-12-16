from __future__ import annotations

import time

import fastf1
import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import CACHE_DIR
from app.database import get_db
from app.models import AppCacheModel

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

# Ensure FastF1 cache is enabled (only once)
import os
if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)
fastf1.Cache.enable_cache(CACHE_DIR)


def _to_ms(time_val):
    """Convert timedelta to milliseconds."""
    if pd.isna(time_val):
        return None
    try:
        return int(time_val.total_seconds() * 1000)
    except Exception:
        return None


def _build_laps_payload(sess) -> dict:
    """Build laps payload from FastF1 session."""
    laps = sess.laps
    payload = []
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

    driver_meta = []
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
        print(f"[analysis] driver meta failed: {e}")

    return {"laps": payload, "drivers": driver_meta}


def _build_telemetry_payload(sess, driver: str, lap: int | None = None, downsample: int = 400) -> dict:
    """Build telemetry payload from FastF1 session."""
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


def _build_stints_payload(sess, driver: str) -> list:
    """Build stints payload from FastF1 session."""
    laps = sess.laps.pick_driver(driver)
    if laps.empty:
        return []

    stints = []
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


def _fetch_or_compute_laps(year: int, round: int, db: Session) -> dict:
    """
    Fetch laps data from cache, or compute on-demand if not cached.
    Returns the laps payload.
    """
    key = f"analysis_laps_{year}_{round}"
    
    # Check cache first
    record = db.query(AppCacheModel).filter(AppCacheModel.key == key).first()
    if record and record.data:
        return record.data
    
    # Cache miss: compute on-demand
    print(f"[ANALYSIS] Computing laps data on-demand for {year} round {round}")
    compute_start = time.time()
    
    try:
        sess = fastf1.get_session(year, round, "R")
        sess.load(laps=True, telemetry=False, weather=False, messages=False)
        
        payload = _build_laps_payload(sess)
        
        # Cache the result
        if record:
            record.data = payload
        else:
            db.add(AppCacheModel(key=key, data=payload))
        db.commit()
        
        elapsed = (time.time() - compute_start) * 1000
        print(f"[ANALYSIS] Computed and cached laps data in {elapsed:.2f}ms")
        
        return payload
    except Exception as e:
        print(f"[ANALYSIS] Failed to compute laps data: {e}")
        # Return empty structure on error
        return {"laps": [], "drivers": []}


def _fetch_or_compute_telemetry(year: int, round: int, driver: str, db: Session) -> dict:
    """
    Fetch telemetry data from cache, or compute on-demand if not cached.
    Returns the telemetry payload.
    """
    key = f"telemetry_{year}_{round}_{driver}"
    
    # Check cache first
    record = db.query(AppCacheModel).filter(AppCacheModel.key == key).first()
    if record and record.data:
        return record.data
    
    # Cache miss: compute on-demand
    print(f"[ANALYSIS] Computing telemetry on-demand for {year} round {round} driver {driver}")
    compute_start = time.time()
    
    try:
        sess = fastf1.get_session(year, round, "R")
        sess.load(laps=True, telemetry=True, weather=False, messages=False)
        
        payload = _build_telemetry_payload(sess, driver, lap=None, downsample=400)
        
        # Cache the result
        if record:
            record.data = payload
        else:
            db.add(AppCacheModel(key=key, data=payload))
        db.commit()
        
        elapsed = (time.time() - compute_start) * 1000
        print(f"[ANALYSIS] Computed and cached telemetry in {elapsed:.2f}ms")
        
        return payload
    except Exception as e:
        print(f"[ANALYSIS] Failed to compute telemetry: {e}")
        return {"distance": [], "speed": [], "throttle": [], "brake": [], "gear": []}


def _fetch_or_compute_stints(year: int, round: int, driver: str, db: Session) -> list:
    """
    Fetch stints data from cache, or compute on-demand if not cached.
    Returns the stints payload.
    """
    key = f"stints_{year}_{round}_{driver}"
    
    # Check cache first
    record = db.query(AppCacheModel).filter(AppCacheModel.key == key).first()
    if record and record.data:
        return record.data
    
    # Cache miss: compute on-demand
    print(f"[ANALYSIS] Computing stints on-demand for {year} round {round} driver {driver}")
    compute_start = time.time()
    
    try:
        sess = fastf1.get_session(year, round, "R")
        sess.load(laps=True, telemetry=False, weather=False, messages=False)
        
        payload = _build_stints_payload(sess, driver)
        
        # Cache the result
        if record:
            record.data = payload
        else:
            db.add(AppCacheModel(key=key, data=payload))
        db.commit()
        
        elapsed = (time.time() - compute_start) * 1000
        print(f"[ANALYSIS] Computed and cached stints in {elapsed:.2f}ms")
        
        return payload
    except Exception as e:
        print(f"[ANALYSIS] Failed to compute stints: {e}")
        return []


@router.get("/laps")
def analysis_laps(year: int, round: int, db: Session = Depends(get_db)):
    """
    Serve laps payload from cache, or compute on-demand if not available.
    First request may be slower as it loads from FastF1, subsequent requests are instant.
    """
    return _fetch_or_compute_laps(year, round, db)


@router.get("/telemetry")
def analysis_telemetry(year: int, round: int, driver: str, db: Session = Depends(get_db)):
    """
    Serve telemetry payload from cache, or compute on-demand if not available.
    First request may be slower as it loads from FastF1, subsequent requests are instant.
    """
    return _fetch_or_compute_telemetry(year, round, driver, db)


@router.get("/stints")
def analysis_stints(year: int, round: int, driver: str, db: Session = Depends(get_db)):
    """
    Serve stints payload from cache, or compute on-demand if not available.
    First request may be slower as it loads from FastF1, subsequent requests are instant.
    """
    return _fetch_or_compute_stints(year, round, driver, db)
