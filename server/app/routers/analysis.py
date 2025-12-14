from __future__ import annotations

from typing import Optional

import fastf1
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from app.services.f1_service import to_ms


router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/laps")
def analysis_laps(year: int, round: int, drivers: Optional[str] = None):
    try:
        sess = fastf1.get_session(year, round, "R")
        sess.load(laps=True, telemetry=False, weather=False, messages=False)
        laps = sess.laps

        if drivers:
            driver_filter = [d.strip() for d in drivers.split(",") if d.strip()]
            laps = laps[laps["DriverNumber"].isin(driver_filter)]

        payload = []
        for _, lap in laps.iterrows():
            payload.append(
                {
                    "driverNumber": str(lap.get("DriverNumber", "")),
                    "lapNumber": int(lap["LapNumber"]) if not pd.isna(lap["LapNumber"]) else None,
                    "lapTimeMs": to_ms(lap["LapTime"]),
                    "s1Ms": to_ms(lap.get("Sector1Time", None)),
                    "s2Ms": to_ms(lap.get("Sector2Time", None)),
                    "s3Ms": to_ms(lap.get("Sector3Time", None)),
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
            print(f"[analysis_laps] driver meta failed: {e}")

        return {"laps": payload, "drivers": driver_meta}
    except Exception as e:
        print(f"[analysis_laps] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/telemetry")
def analysis_telemetry(
    year: int,
    round: int,
    driver: str,
    lap: Optional[int] = None,
    downsample: int = 400,
):
    try:
        sess = fastf1.get_session(year, round, "R")
        sess.load(laps=True, telemetry=True, weather=False, messages=False)
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
            return {"distance": [], "speed": [], "throttle": [], "brake": [], "gear": []}

        car_data = target_lap.get_car_data()
        if car_data.empty:
            return {"distance": [], "speed": [], "throttle": [], "brake": [], "gear": []}

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
    except Exception as e:
        print(f"[analysis_telemetry] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stints")
def analysis_stints(year: int, round: int, driver: str):
    try:
        sess = fastf1.get_session(year, round, "R")
        sess.load(laps=True, telemetry=False, weather=False, messages=False)
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
    except Exception as e:
        print(f"[analysis_stints] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
