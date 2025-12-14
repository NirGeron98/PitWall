# server/main.py
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler
import uvicorn
import fastf1
from fastf1.ergast import Ergast
import os
import requests
import traceback
import pandas as pd
import numpy as np
from datetime import datetime, timezone, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from typing import Optional, List

from database import (
    SessionLocal, RaceModel, DriverModel, DriverStandingModel,
    TeamStandingModel, SessionResultModel, UserModel, FavoriteModel, init_db
)
from etl import run_etl

# --- APP SETUP ---
scheduler = BackgroundScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initial Check
    try:
        db = SessionLocal()
        if db.query(RaceModel).count() == 0:
            print("[INIT] Database empty. Running initial ETL...")
            run_etl() 
        db.close()
    except Exception as e:
        print(f"[WARN] Initial ETL check failed: {e}")

    scheduler.add_job(run_etl, 'interval', hours=24)
    scheduler.start()
    yield
    scheduler.shutdown()

app = FastAPI(title="PitWall API", lifespan=lifespan)

cors_origins_env = os.getenv("CORS_ORIGINS")
frontend_url_env = os.getenv("FRONTEND_URL")

if cors_origins_env:
    allow_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
elif frontend_url_env:
    allow_origins = [frontend_url_env.strip()]
else:
    allow_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CACHE_DIR = 'cache'
if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)
fastf1.Cache.enable_cache(CACHE_DIR)
init_db()

SECRET_KEY = os.getenv("JWT_SECRET", "pitwall-dev-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None

    class Config:
        orm_mode = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AuthPayload(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class FavoritePayload(BaseModel):
    driver_id: Optional[str] = None
    team_id: Optional[str] = None


class FavoriteOut(BaseModel):
    id: int
    driver_id: Optional[str] = None
    team_id: Optional[str] = None

    class Config:
        orm_mode = True


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_user_by_email(db: Session, email: str) -> Optional[UserModel]:
    return db.query(UserModel).filter(UserModel.email == email).first()


def authenticate_user(db: Session, email: str, password: str) -> Optional[UserModel]:
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> UserModel:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    return user


@app.post("/auth/register", response_model=TokenResponse)
def register_user(payload: AuthPayload, db: Session = Depends(get_db)):
    email_normalized = payload.email.lower().strip()
    existing_user = get_user_by_email(db, email_normalized)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = UserModel(email=email_normalized, password_hash=get_password_hash(payload.password), full_name=payload.full_name)
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.post("/auth/login", response_model=TokenResponse)
def login_user(payload: AuthPayload, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.email.lower().strip(), payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.get("/auth/me", response_model=UserOut)
def read_current_user(current_user: UserModel = Depends(get_current_user)):
    return current_user


@app.get("/api/favorites", response_model=List[FavoriteOut])
def list_favorites(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    favorites = db.query(FavoriteModel).filter(FavoriteModel.user_id == current_user.id).all()
    return favorites


@app.post("/api/favorites", response_model=FavoriteOut)
def add_favorite(
    payload: FavoritePayload,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not payload.driver_id and not payload.team_id:
        raise HTTPException(status_code=400, detail="driver_id or team_id must be provided")

    existing = db.query(FavoriteModel).filter(
        FavoriteModel.user_id == current_user.id,
        FavoriteModel.driver_id == payload.driver_id,
        FavoriteModel.team_id == payload.team_id
    ).first()
    if existing:
        return existing

    favorite = FavoriteModel(
        user_id=current_user.id,
        driver_id=payload.driver_id,
        team_id=payload.team_id
    )
    db.add(favorite)
    db.commit()
    db.refresh(favorite)
    return favorite


@app.delete("/api/favorites/{favorite_id}", status_code=204)
def remove_favorite(
    favorite_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    favorite = db.query(FavoriteModel).filter(
        FavoriteModel.id == favorite_id,
        FavoriteModel.user_id == current_user.id
    ).first()
    if not favorite:
        raise HTTPException(status_code=404, detail="Favorite not found")

    db.delete(favorite)
    db.commit()
    return None

# --- HELPERS FOR STANDINGS ---
def _hydrate_driver_standings(year: int, db: Session):
    ergast = Ergast()
    standings = ergast.get_driver_standings(season=year)
    if not standings.content: 
        return []

    df = standings.content[0].fillna('')

    drivers_db = db.query(DriverModel).filter(DriverModel.year == year).all()
    driver_meta_by_number = {d.driver_number: d for d in drivers_db}
    driver_meta_by_name = {d.full_name.lower(): d for d in drivers_db}

    records = []
    for _, row in df.iterrows():
        constructor_name = ''
        try:
            if isinstance(row['constructorNames'], list) and row['constructorNames']:
                constructor_name = row['constructorNames'][0]
        except Exception:
            constructor_name = ''

        meta = driver_meta_by_number.get(str(row.get('driverNumber', '')).strip())
        if not meta:
            full_name_key = f"{row.get('givenName', '')} {row.get('familyName', '')}".strip().lower()
            meta = driver_meta_by_name.get(full_name_key)
        
        driver_number = meta.driver_number if meta else str(row.get('driverNumber', '')).strip()
        records.append({
            "position": int(row.get('position', 0)) if str(row.get('position', '')).isdigit() else row.get('position', ''),
            "points": float(row.get('points', 0)) if str(row.get('points', '')).replace('.', '', 1).isdigit() else row.get('points', 0),
            "wins": int(row.get('wins', 0)) if str(row.get('wins', '')).isdigit() else row.get('wins', 0),
            "driverId": row.get('driverId', ''),
            "driverNumber": driver_number,
            "givenName": row.get('givenName', ''),
            "familyName": row.get('familyName', ''),
            "constructorName": constructor_name,
            "headshotUrl": meta.headshot_url if meta else None,
            "teamColor": meta.team_color if meta else "#2d2d35",
            "broadcastName": meta.broadcast_name if meta else "",
            "teamName": meta.team_name if meta else constructor_name
        })

    return records

def _persist_driver_standings(year: int, records: list, db: Session):
    db.query(DriverStandingModel).filter(DriverStandingModel.year == year).delete()
    for rec in records:
        db.add(DriverStandingModel(
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
        ))
    db.commit()

def _hydrate_team_standings(year: int):
    ergast = Ergast()
    standings = ergast.get_constructor_standings(season=year)
    if not standings.content:
        return []
    df = standings.content[0].fillna('')
    return df.to_dict(orient='records')

def _persist_team_standings(year: int, records: list, db: Session):
    db.query(TeamStandingModel).filter(TeamStandingModel.year == year).delete()
    for rec in records:
        db.add(TeamStandingModel(
            year=year,
            position=int(rec.get('position', 0)) if str(rec.get('position', '')).isdigit() else rec.get('position', 0),
            points=str(rec.get('points', '0')),
            wins=int(rec.get('wins', 0)) if str(rec.get('wins', '')).isdigit() else rec.get('wins', 0),
            constructor_id=rec.get('constructorId', rec.get('constructorIds', [''])[0] if isinstance(rec.get('constructorIds', None), list) else ''),
            constructor_name=rec.get('constructorName', rec.get('constructorNames', [''])[0] if isinstance(rec.get('constructorNames', None), list) else ''),
            nationality=rec.get('constructorNationality', '')
        ))
    db.commit()

# --- HELPERS FOR SESSION RESULTS ---
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
            else:
                 return f"{minutes:02d}:{seconds:02d}.{ms:03d}"
        except (ValueError, TypeError):
            return None
    return str(td)

def _serialize_cached_results(cached):
    cached_sorted = sorted(cached, key=lambda x: float(x.position) if x.position.replace('.','',1).isdigit() else 999)
    return [{
        "Position": c.position,
        "DriverNumber": c.driver_number,
        "BroadcastName": c.broadcast_name,
        "TeamName": c.team_name,
        "Time": c.time,
        "Status": c.status,
        "Points": c.points
    } for c in cached_sorted]

def _load_session_results(year: int, round: int, session_code: str, refresh: bool, db: Session):
    """
    Centralized loader that keeps DB cache in sync with FastF1.
    For completed events we always refresh from FastF1 to avoid stale pre-race data.
    """
    session_map = {"P1": "FP1", "P2": "FP2", "P3": "FP3", "Q": "Q", "S": "S", "R": "R"}
    f1_session_code = session_map.get(session_code)
    if not f1_session_code:
        raise HTTPException(status_code=400, detail="Invalid session code")

    # Detect live weekend and whether the event is already finished
    live_window = False
    event_finished = False
    try:
        race = db.query(RaceModel).filter(RaceModel.year == year, RaceModel.round == round).first()
        if race and race.date:
            race_date = datetime.fromisoformat(str(race.date)).date()
            today = datetime.now(timezone.utc).date()
            if abs((race_date - today).days) <= 4:
                live_window = True
            if today > race_date:
                event_finished = True
    except Exception as e:
        print(f"Could not determine live window: {e}")

    # Only use cached data when explicitly allowed (avoids stale results after a race finishes)
    if not refresh and not live_window and not event_finished:
        cached = db.query(SessionResultModel).filter(
            SessionResultModel.year == year,
            SessionResultModel.round == round,
            SessionResultModel.session_code == session_code
        ).order_by(SessionResultModel.position).all()
        if cached:
            return _serialize_cached_results(cached)

    # Fetch fresh data from FastF1
    try:
        print(f"[DEBUG] Loading {f1_session_code} for year={year}, round={round}")
        try:
            sess = fastf1.get_session(year, round, f1_session_code)
        except ValueError as ve:
            print(f"[WARN] Session '{f1_session_code}' not found for this event: {ve}")
            return []
        except Exception as e:
            print(f"[ERR] Failed to initialize session: {e}")
            raise e

        print(f"[DEBUG] Session: {sess.event['EventName']} - {sess.name} on {sess.date}")
        sess.load(laps=True, telemetry=False, weather=False, messages=False)
        results = sess.results.fillna('')
        laps = sess.laps
        print(f"[DEBUG] Loaded {len(results)} results for {f1_session_code}")

        db.query(SessionResultModel).filter(
            SessionResultModel.year == year,
            SessionResultModel.round == round,
            SessionResultModel.session_code == session_code
        ).delete()
        
        output = []
        for _, row in results.iterrows():
            driver_no = str(row.get('DriverNumber', ''))
            
            # Use official Position from FastF1
            pos_val = row.get('Position', 999)
            try:
                position = str(int(float(pos_val)))
            except Exception:
                position = str(pos_val)

            best_time = None
            try:
                drv_laps = laps.pick_drivers(driver_no)
                if not drv_laps.empty:
                    best_lap = drv_laps.pick_fastest()
                    if best_lap is not None and 'LapTime' in best_lap:
                        best_time = _fmt_td(best_lap['LapTime'])
            except Exception:
                best_time = None

            time_val = _fmt_td(row.get('Time', None)) or best_time or ""

            status = row.get('Status', '')
            if not time_val and status:
                 time_val = status

            record = {
                "Position": position,
                "DriverNumber": driver_no,
                "BroadcastName": row.get('BroadcastName', ''),
                "TeamName": row.get('TeamName', ''),
                "Time": time_val,
                "Status": status,
                "Points": int(row.get('Points', 0)) if str(row.get('Points', '')).replace('.','',1).isdigit() else 0
            }
            output.append(record)

            db.add(SessionResultModel(
                year=year,
                round=round,
                session_code=session_code,
                position=position,
                driver_number=record["DriverNumber"],
                broadcast_name=record["BroadcastName"],
                team_name=record["TeamName"],
                time=record["Time"],
                status=record["Status"],
                points=record["Points"]
            ))

        db.commit()
        return output

    except Exception as e:
        print(f"Error fetching session: {e}")
        traceback.print_exc()
        cached = db.query(SessionResultModel).filter(
            SessionResultModel.year == year,
            SessionResultModel.round == round,
            SessionResultModel.session_code == session_code
        ).order_by(SessionResultModel.position).all()
        if cached:
             return _serialize_cached_results(cached)
            
        raise HTTPException(status_code=500, detail=str(e))

# --- ENDPOINTS ---
@app.get("/api/races")
def get_races(year: int, db: Session = Depends(get_db)):
    races = db.query(RaceModel).filter(RaceModel.year == year).all()
    return [{
        "RoundNumber": r.round, "EventName": r.event_name,
        "Country": r.country, "Location": r.location,
        "Session5Date": r.date, "EventFormat": r.event_format
    } for r in races]

@app.get("/api/drivers")
def get_drivers(year: int, db: Session = Depends(get_db)):
    drivers = db.query(DriverModel).filter(DriverModel.year == year).all()
    return [{
        "DriverNumber": d.driver_number, "BroadcastName": d.broadcast_name,
        "FullName": d.full_name, "TeamName": d.team_name,
        "TeamColor": d.team_color, "HeadshotUrl": d.headshot_url
    } for d in drivers]

@app.get("/api/standings/drivers")
def get_driver_standings(year: int, db: Session = Depends(get_db)):
    try:
        records = _hydrate_driver_standings(year, db)
        if records:
            _persist_driver_standings(year, records, db)
            return records
        cached = db.query(DriverStandingModel).filter(DriverStandingModel.year == year).all()
        if cached:
            return [{
                "position": c.position,
                "points": float(c.points) if str(c.points).replace('.', '', 1).isdigit() else c.points,
                "wins": c.wins,
                "driverId": c.driver_id,
                "driverNumber": c.driver_number,
                "givenName": c.given_name,
                "familyName": c.family_name,
                "constructorName": c.constructor_name,
                "headshotUrl": c.headshot_url,
                "teamColor": c.team_color,
                "broadcastName": c.broadcast_name,
                "teamName": c.team_name
            } for c in cached]
        return []
    except Exception as e:
        print(f"Error fetching driver standings: {e}")
        return []

@app.get("/api/standings/teams")
def get_team_standings(year: int, db: Session = Depends(get_db)):
    try:
        records = _hydrate_team_standings(year)
        if records:
            _persist_team_standings(year, records, db)
            return records
        cached = db.query(TeamStandingModel).filter(TeamStandingModel.year == year).all()
        if cached:
            return [{
                "position": c.position,
                "points": float(c.points) if str(c.points).replace('.', '', 1).isdigit() else c.points,
                "wins": c.wins,
                "constructorId": c.constructor_id,
                "constructorName": c.constructor_name,
                "nationality": c.nationality
            } for c in cached]
        return []
    except Exception as e:
        print(f"Error fetching team standings: {e}")
        return []

@app.get("/api/driver/{driver_number}/stats")
def get_driver_stats(year: int, driver_number: str, db: Session = Depends(get_db)):
    """
    Fetch driver season results directly from Jolpica (Ergast V2), including standing position/points.
    """
    print(f"Fetching stats for Driver #{driver_number} in {year}...")
    
    driver_full_name = None
    try:
        cached_driver = db.query(DriverModel).filter(
            DriverModel.year == year,
            DriverModel.driver_number == driver_number
        ).first()
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
        drivers_list = resp['MRData']['StandingsTable']['StandingsLists'][0]['DriverStandings']
        
        for d in drivers_list:
            info = d['Driver']
            full_name = f"{info.get('givenName', '')} {info.get('familyName', '')}".strip().lower()
            
            if info.get('permanentNumber') == driver_number or info.get('driverId') == driver_number:
                driver_id = d['Driver']['driverId']
                standing_position = d.get('position')
                standing_points = d.get('points')
                break
            
            if driver_full_name and full_name == driver_full_name:
                driver_id = d['Driver']['driverId']
                standing_position = d.get('position')
                standing_points = d.get('points')
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
        
        races = data['MRData']['RaceTable']['Races']
        
        formatted_results = []
        for race in races:
            result = race['Results'][0]
            formatted_results.append({
                "round": race['round'],
                "raceName": race['raceName'],
                "date": race['date'],
                "grid": result['grid'],
                "position": result['position'],
                "status": result['status'],
                "points": result['points']
            })
        
        return {
            "standingPosition": standing_position,
            "standingPoints": standing_points,
            "results": formatted_results
        }

    except Exception as e:
        print(f"Direct fetch failed: {e}")
        return {"standingPosition": None, "standingPoints": None, "results": []}

@app.get("/api/race-results")
def get_race_results(year: int, round: int, refresh: bool = False, db: Session = Depends(get_db)):
    # Delegate to shared session loader to keep DB in sync and always refresh finished races
    return _load_session_results(year, round, "R", refresh, db)

@app.get("/api/session-results")
def get_session_results(year: int, round: int, session: str, refresh: bool = False, db: Session = Depends(get_db)):
    """
    Fetch results for a specific session (P1, P2, P3, Q, R, S).
    During race weekend (+/- 4 days) or when refresh=True, always pull fresh data and update cache.
    Also computes best lap time from laps to avoid NaT values.
    """
    session_code = session.upper()
    if session_code not in {"P1", "P2", "P3", "Q", "R", "S"}:
        raise HTTPException(status_code=400, detail="Invalid session code")

    return _load_session_results(year, round, session_code, refresh, db)

# --- ANALYSIS ENDPOINTS ---
def _to_ms(td):
    if td is None or (isinstance(td, pd.Timedelta) and pd.isna(td)):
        return None
    try:
        return int(td.total_seconds() * 1000)
    except Exception:
        return None

@app.get("/api/analysis/laps")
def analysis_laps(year: int, round: int, drivers: Optional[str] = None):
    try:
        sess = fastf1.get_session(year, round, "R")
        sess.load(laps=True, telemetry=False, weather=False, messages=False)
        laps = sess.laps
        driver_filter = None
        if drivers:
            driver_filter = [d.strip() for d in drivers.split(",") if d.strip()]
            laps = laps[laps["DriverNumber"].isin(driver_filter)]
        payload = []
        for _, lap in laps.iterrows():
            payload.append({
                "driverNumber": str(lap.get("DriverNumber", "")),
                "lapNumber": int(lap["LapNumber"]) if not pd.isna(lap["LapNumber"]) else None,
                "lapTimeMs": _to_ms(lap["LapTime"]),
                "s1Ms": _to_ms(lap.get("Sector1Time", None)),
                "s2Ms": _to_ms(lap.get("Sector2Time", None)),
                "s3Ms": _to_ms(lap.get("Sector3Time", None)),
                "compound": lap.get("Compound"),
                "stint": lap.get("Stint"),
                "position": int(lap["Position"]) if not pd.isna(lap["Position"]) else None,
            })
        # driver metadata per session to cover mid-season changes
        driver_meta = []
        try:
            for code in sess.drivers:
                drv = sess.get_driver(code)
                driver_meta.append({
                    "driverNumber": str(drv.get("DriverNumber", "")),
                    "broadcastName": drv.get("BroadcastName", ""),
                    "fullName": drv.get("FullName", ""),
                    "teamName": drv.get("TeamName", ""),
                    "teamColor": f"#{drv.get('TeamColor')}" if drv.get("TeamColor") else "#888",
                    "headshotUrl": drv.get("HeadshotUrl"),
                })
        except Exception as e:
            print(f"[analysis_laps] driver meta failed: {e}")

        return {"laps": payload, "drivers": driver_meta}
    except Exception as e:
        print(f"[analysis_laps] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analysis/telemetry")
def analysis_telemetry(year: int, round: int, driver: str, lap: Optional[int] = None, downsample: int = 400):
    try:
        sess = fastf1.get_session(year, round, "R")
        sess.load(laps=True, telemetry=True, weather=False, messages=False)
        laps = sess.laps.pick_driver(driver)
        target_lap = None
        if lap:
            target_lap = laps.loc[laps["LapNumber"] == lap].iloc[0] if not laps.empty and lap in laps["LapNumber"].values else None
        if target_lap is None and not laps.empty:
            target_lap = laps.pick_fastest()
        if target_lap is None:
            return {"distance": [], "speed": [], "throttle": [], "brake": [], "gear": []}
        car_data = target_lap.get_car_data()
        if car_data.empty:
            return {"distance": [], "speed": [], "throttle": [], "brake": [], "gear": []}
        # downsample
        if downsample and len(car_data) > downsample:
            idx = np.linspace(0, len(car_data) - 1, downsample).astype(int)
            car_data = car_data.iloc[idx]
        return {
            "distance": car_data["Distance"].tolist() if "Distance" in car_data else list(range(len(car_data))),
            "speed": car_data["Speed"].tolist(),
            "throttle": car_data["Throttle"].tolist(),
            "brake": car_data["Brake"].tolist() if "Brake" in car_data else [0]*len(car_data),
            "gear": car_data["nGear"].tolist() if "nGear" in car_data else [0]*len(car_data),
            "lapNumber": int(target_lap["LapNumber"]) if not pd.isna(target_lap["LapNumber"]) else None,
        }
    except Exception as e:
        print(f"[analysis_telemetry] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analysis/stints")
def analysis_stints(year: int, round: int, driver: str):
    try:
        sess = fastf1.get_session(year, round, "R")
        sess.load(laps=True, telemetry=False, weather=False, messages=False)
        laps = sess.laps.pick_driver(driver)
        if laps.empty:
            return []
        stints = []
        for stint_num, stint_df in laps.groupby("Stint"):
            stints.append({
                "stint": int(stint_num) if not pd.isna(stint_num) else None,
                "compound": stint_df["Compound"].iloc[0] if "Compound" in stint_df else None,
                "startLap": int(stint_df["LapNumber"].min()),
                "endLap": int(stint_df["LapNumber"].max()),
                "lapCount": int(stint_df["LapNumber"].max() - stint_df["LapNumber"].min() + 1),
            })
        return stints
    except Exception as e:
        print(f"[analysis_stints] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
