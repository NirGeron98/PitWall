# server/etl.py
import os
import fastf1
from fastf1.ergast import Ergast
from database import (
    init_db,
    SessionLocal,
    RaceModel,
    DriverModel,
    DriverStandingModel,
    TeamStandingModel,
)

# Enable Cache
CACHE_DIR = 'cache'
if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)
fastf1.Cache.enable_cache(CACHE_DIR)


def process_year(year, db):
    """Process a single year: races, drivers, and cache standings."""
    print(f"[ETL] Processing Year: {year}...")

    # --- RACES ---
    if db.query(RaceModel).filter(RaceModel.year == year).first():
        print(f"   Using existing races for {year}.")
    else:
        try:
            schedule = fastf1.get_event_schedule(year)
            count = 0
            for _, race in schedule.iterrows():
                if race['EventFormat'] == 'testing':
                    continue

                race_entry = RaceModel(
                    year=year,
                    round=race['RoundNumber'],
                    event_name=race['EventName'],
                    country=race['Country'],
                    location=race['Location'],
                    date=str(race['Session5Date']),
                    event_format=race['EventFormat']
                )
                db.add(race_entry)
                count += 1
            db.commit()
            print(f"   Added {count} races.")
        except Exception as e:
            print(f"   Warning: Could not fetch schedule for {year}: {e}")

    # --- DRIVERS ---
    if db.query(DriverModel).filter(DriverModel.year == year).first():
        print(f"   Using existing drivers for {year}.")
    else:
        try:
            session = fastf1.get_session(year, 1, 'R')
            session.load(laps=False, telemetry=False, weather=False, messages=False)

            count = 0
            for drv_name in session.drivers:
                drv = session.get_driver(drv_name)
                driver_entry = DriverModel(
                    year=year,
                    driver_number=str(drv['DriverNumber']),
                    broadcast_name=drv['BroadcastName'],
                    full_name=drv['FullName'],
                    team_name=drv['TeamName'],
                    team_color=f"#{drv['TeamColor']}" if drv['TeamColor'] else "#333333",
                    headshot_url=drv['HeadshotUrl']
                )
                db.add(driver_entry)
                count += 1
            db.commit()
            print(f"   Added {count} drivers.")
        except Exception as e:
            print(f"   Warning: Could not fetch drivers for {year} (Season might not have started): {e}")

    # --- STANDINGS (Drivers/Teams) ---
    try:
        ergast = Ergast()
        driver_standings = ergast.get_driver_standings(season=year)
        constructor_standings = ergast.get_constructor_standings(season=year)

        if driver_standings.content:
            df = driver_standings.content[0].fillna('')
            db.query(DriverStandingModel).filter(DriverStandingModel.year == year).delete()
            for _, row in df.iterrows():
                constructor_name = ''
                if isinstance(row.get('constructorNames', None), list) and row['constructorNames']:
                    constructor_name = row['constructorNames'][0]
                db.add(DriverStandingModel(
                    year=year,
                    position=int(row.get('position', 0)) if str(row.get('position', '')).isdigit() else row.get('position', 0),
                    points=str(row.get('points', '0')),
                    wins=int(row.get('wins', 0)) if str(row.get('wins', '')).isdigit() else row.get('wins', 0),
                    driver_id=row.get('driverId', ''),
                    driver_number=str(row.get('driverNumber', '')),
                    given_name=row.get('givenName', ''),
                    family_name=row.get('familyName', ''),
                    constructor_name=constructor_name,
                    headshot_url=None,
                    team_color=None,
                    broadcast_name='',
                    team_name=constructor_name
                ))
            db.commit()
            print(f"   Cached driver standings for {year}.")

        if constructor_standings.content:
            df = constructor_standings.content[0].fillna('')
            db.query(TeamStandingModel).filter(TeamStandingModel.year == year).delete()
            for _, row in df.iterrows():
                constructor_name = row.get('constructorName', '')
                if not constructor_name and isinstance(row.get('constructorNames', None), list) and row['constructorNames']:
                    constructor_name = row['constructorNames'][0]
                db.add(TeamStandingModel(
                    year=year,
                    position=int(row.get('position', 0)) if str(row.get('position', '')).isdigit() else row.get('position', 0),
                    points=str(row.get('points', '0')),
                    wins=int(row.get('wins', 0)) if str(row.get('wins', '')).isdigit() else row.get('wins', 0),
                    constructor_id=row.get('constructorId', ''),
                    constructor_name=constructor_name,
                    nationality=row.get('constructorNationality', '')
                ))
            db.commit()
            print(f"   Cached team standings for {year}.")
    except Exception as e:
        print(f"   Warning: Could not cache standings for {year}: {e}")


def run_etl():
    print("[ETL] Starting Multi-Year ETL Process...")
    init_db()
    db = SessionLocal()

    years_to_process = [2020, 2021, 2022, 2023, 2024, 2025]

    for year in years_to_process:
        process_year(year, db)

    db.close()
    print("[ETL] Complete.")


if __name__ == "__main__":
    run_etl()
