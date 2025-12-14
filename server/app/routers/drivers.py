from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DriverModel, DriverStandingModel, TeamStandingModel
from app.services.f1_service import (
    get_driver_stats_from_jolpica,
    hydrate_driver_standings,
    hydrate_team_standings,
    persist_driver_standings,
    persist_team_standings,
)


router = APIRouter(prefix="/api", tags=["drivers"])


@router.get("/drivers")
def get_drivers(year: int, db: Session = Depends(get_db)):
    drivers = db.query(DriverModel).filter(DriverModel.year == year).all()
    return [
        {
            "DriverNumber": d.driver_number,
            "BroadcastName": d.broadcast_name,
            "FullName": d.full_name,
            "TeamName": d.team_name,
            "TeamColor": d.team_color,
            "HeadshotUrl": d.headshot_url,
        }
        for d in drivers
    ]


@router.get("/standings/drivers")
def get_driver_standings(year: int, db: Session = Depends(get_db)):
    try:
        records = hydrate_driver_standings(year, db)
        if records:
            persist_driver_standings(year, records, db)
            return records

        cached = db.query(DriverStandingModel).filter(DriverStandingModel.year == year).all()
        if cached:
            return [
                {
                    "position": c.position,
                    "points": float(c.points) if str(c.points).replace(".", "", 1).isdigit() else c.points,
                    "wins": c.wins,
                    "driverId": c.driver_id,
                    "driverNumber": c.driver_number,
                    "givenName": c.given_name,
                    "familyName": c.family_name,
                    "constructorName": c.constructor_name,
                    "headshotUrl": c.headshot_url,
                    "teamColor": c.team_color,
                    "broadcastName": c.broadcast_name,
                    "teamName": c.team_name,
                }
                for c in cached
            ]

        return []
    except Exception as e:
        print(f"Error fetching driver standings: {e}")
        return []


@router.get("/standings/teams")
def get_team_standings(year: int, db: Session = Depends(get_db)):
    try:
        records = hydrate_team_standings(year)
        if records:
            persist_team_standings(year, records, db)
            return records

        cached = db.query(TeamStandingModel).filter(TeamStandingModel.year == year).all()
        if cached:
            return [
                {
                    "position": c.position,
                    "points": float(c.points) if str(c.points).replace(".", "", 1).isdigit() else c.points,
                    "wins": c.wins,
                    "constructorId": c.constructor_id,
                    "constructorName": c.constructor_name,
                    "nationality": c.nationality,
                }
                for c in cached
            ]

        return []
    except Exception as e:
        print(f"Error fetching team standings: {e}")
        return []


@router.get("/driver/{driver_number}/stats")
def get_driver_stats(year: int, driver_number: str, db: Session = Depends(get_db)):
    return get_driver_stats_from_jolpica(year, driver_number, db)
