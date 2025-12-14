import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import sessionmaker, declarative_base

"""
Database setup.
This configuration is strictly for PostgreSQL (Production/Render).
"""

# ---------------------------------------------------------
# 1. Configuration & Connection
# ---------------------------------------------------------ַ

# Robustly find the .env file relative to this script
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

# Fetch the connection string from the environment
DATABASE_URL = os.getenv("DATABASE_URL")

# specific check to help debug if .env is not found
if not DATABASE_URL:
    print(f"DEBUG: Could not find .env file at: {env_path}")
    sys.exit("Error: DATABASE_URL environment variable is not set. Please check your .env file.")

# Fix for Render: SQLAlchemy requires 'postgresql://', but Render often provides 'postgres://'
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Create the engine
# Note: PostgreSQL does NOT use 'check_same_thread', so we don't pass connect_args
engine = create_engine(DATABASE_URL)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


# ---------------------------------------------------------
# 2. Database Models (Tables)
# ---------------------------------------------------------

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
    Passwords are stored as salted hashes.
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

# ---------------------------------------------------------
# 3. Initialization Function
# ---------------------------------------------------------

def init_db():
    """Creates tables if they do not exist."""
    Base.metadata.create_all(bind=engine)