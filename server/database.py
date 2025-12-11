# server/database.py
import os
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, UniqueConstraint, text
from sqlalchemy.orm import sessionmaker, declarative_base

# 1. Database Configuration
# Use environment variable for Prod (Render/Neon), default to local SQLite for Dev.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pitwall.db")

# Fix for Render: SQLAlchemy requires 'postgresql://', but Render provides 'postgres://'
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Connect args are needed only for SQLite to allow multi-threaded access
connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# 2. Database Models (Tables)

class RaceModel(Base):
    """
    Stores the schedule for a specific season.
    Allows for instant loading of the 'Races' tab.
    """
    __tablename__ = "races"
    
    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True)
    round = Column(Integer, index=True)
    event_name = Column(String)
    country = Column(String)
    location = Column(String)
    date = Column(String)       # ISO format string
    event_format = Column(String)

class DriverModel(Base):
    """
    Stores the driver lineup for a specific season.
    Allows for instant loading of the 'Drivers' tab.
    """
    __tablename__ = "drivers"
    
    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True)
    driver_number = Column(String)
    broadcast_name = Column(String)
    full_name = Column(String)
    team_name = Column(String)
    team_color = Column(String)
    headshot_url = Column(String, nullable=True)

class DriverStandingModel(Base):
    """
    Cached driver standings per season.
    """
    __tablename__ = "driver_standings"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True)
    position = Column(Integer)
    points = Column(String)
    wins = Column(Integer)
    driver_id = Column(String)
    driver_number = Column(String)
    given_name = Column(String)
    family_name = Column(String)
    constructor_name = Column(String)
    headshot_url = Column(String, nullable=True)
    team_color = Column(String, nullable=True)
    broadcast_name = Column(String, nullable=True)
    team_name = Column(String, nullable=True)

class TeamStandingModel(Base):
    """
    Cached constructor standings per season.
    """
    __tablename__ = "team_standings"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True)
    position = Column(Integer)
    points = Column(String)
    wins = Column(Integer)
    constructor_id = Column(String)
    constructor_name = Column(String)
    nationality = Column(String, nullable=True)

class SessionResultModel(Base):
    """
    Cached session results (P1, P2, P3, Q, R, S) for a given year/round.
    """
    __tablename__ = "session_results"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True)
    round = Column(Integer, index=True)
    session_code = Column(String, index=True)
    position = Column(String, nullable=True)  # String to handle practice sessions with no positions
    driver_number = Column(String)
    broadcast_name = Column(String)
    team_name = Column(String)
    time = Column(String)
    status = Column(String)
    points = Column(Integer)


class UserModel(Base):
    """
    Minimal user model for authentication.
    Passwords are stored as salted hashes (see main.py helpers).
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=True)


class FavoriteModel(Base):
    """
    Stores user favorites for drivers and/or teams.
    """
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    driver_id = Column(String, nullable=True)
    team_id = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "driver_id", "team_id", name="uq_user_favorite"),
    )

# 3. Initialization Function
def init_db():
    """Creates tables if they do not exist."""
    Base.metadata.create_all(bind=engine)
    _ensure_full_name_column()

def _ensure_full_name_column():
    """Add full_name to users table if missing (SQLite-safe)."""
    if "sqlite" not in DATABASE_URL:
        return
    with engine.connect() as conn:
        res = conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()
        cols = [r[1] for r in res]
        if "full_name" not in cols:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN full_name VARCHAR")
            conn.commit()
