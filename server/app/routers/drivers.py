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
    sync_drivers_for_year,
    get_last_completed_round,
)


router = APIRouter(prefix="/api", tags=["drivers"])


@router.get("/drivers")
def get_drivers(year: int, refresh: bool = False, db: Session = Depends(get_db)):
    """
    Get all drivers for a given season year.
    
    Args:
        year: Season year
        refresh: If True, force re-sync from latest completed round (useful for mid-season changes)
        
    Returns:
        List of driver info with current team associations
    """
    # If refresh requested, sync from latest round
    if refresh:
        sync_drivers_for_year(year, db, force_refresh=True)
    
    # Return drivers from DB
    drivers = db.query(DriverModel).filter(DriverModel.year == year).all()
    
    # If no drivers found, try to sync
    if not drivers:
        sync_drivers_for_year(year, db, force_refresh=False)
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


@router.post("/drivers/sync")
def sync_drivers(year: int, db: Session = Depends(get_db)):
    """
    Force sync driver roster from the latest completed session.
    Use this endpoint to update drivers after mid-season team changes
    (e.g., Tsunoda moving to Red Bull, Lawson to Racing Bulls).
    
    Returns:
        Sync result with number of drivers updated/inserted and the round used
    """
    result = sync_drivers_for_year(year, db, force_refresh=True)
    
    return {
        "success": not result.get("error"),
        "year": year,
        "round_synced": result.get("round", 1),
        "updated": result.get("updated", 0),
        "inserted": result.get("inserted", 0),
        "total_drivers": result.get("total", 0),
        "message": f"Synced from round {result.get('round', 1)}: {result.get('updated', 0)} updated, {result.get('inserted', 0)} inserted",
        "error": result.get("error"),
    }


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
