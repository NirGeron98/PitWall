from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DriverModel, DriverStandingModel, TeamStandingModel
from app.routers.drivers import serialize_driver_standings, serialize_team_standings
from app.routers.races import get_races
from app.services.f1_service import (
    hydrate_driver_standings,
    hydrate_team_standings,
    persist_driver_standings,
    persist_team_standings,
    sync_drivers_for_year,
)


router = APIRouter(prefix="/api", tags=["season"])


def _serialize_drivers(drivers: list[DriverModel]) -> list[dict]:
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


@router.get("/season")
def get_season(year: int, refresh: bool = False, db: Session = Depends(get_db)):
    """
    Return the full startup payload in one request.

    The endpoint is cache-first so the authenticated landing experience does not
    wait on multiple round trips or external F1 providers when the DB is seeded.
    """

    races = get_races(year=year, db=db)

    if refresh:
        sync_drivers_for_year(year, db, force_refresh=True)

    drivers = db.query(DriverModel).filter(DriverModel.year == year).all()
    if not drivers:
        sync_drivers_for_year(year, db, force_refresh=False)
        drivers = db.query(DriverModel).filter(DriverModel.year == year).all()

    driver_standings_cached = db.query(DriverStandingModel).filter(DriverStandingModel.year == year).all()
    if driver_standings_cached and not refresh:
        driver_standings = serialize_driver_standings(driver_standings_cached)
    else:
        driver_standings = hydrate_driver_standings(year, db)
        if driver_standings:
            persist_driver_standings(year, driver_standings, db)
        elif driver_standings_cached:
            driver_standings = serialize_driver_standings(driver_standings_cached)

    team_standings_cached = db.query(TeamStandingModel).filter(TeamStandingModel.year == year).all()
    if team_standings_cached and not refresh:
        team_standings = serialize_team_standings(team_standings_cached)
    else:
        team_standings = hydrate_team_standings(year)
        if team_standings:
            persist_team_standings(year, team_standings, db)
        elif team_standings_cached:
            team_standings = serialize_team_standings(team_standings_cached)

    return {
        "races": races,
        "drivers": _serialize_drivers(drivers),
        "driverStandings": driver_standings or [],
        "teamStandings": team_standings or [],
    }
