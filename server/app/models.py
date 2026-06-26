from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON

from app.database import Base


class RaceModel(Base):
    __tablename__ = "races"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True)
    round = Column(Integer, index=True)
    event_name = Column(String)
    country = Column(String)
    location = Column(String)
    date = Column(String)  # ISO format string — Session5Date (race day)
    event_format = Column(String)
    # Individual session start times (ISO strings, nullable for older cached rows).
    # Used to determine whether a specific session (P1, Q, etc.) has already ended.
    session1_date = Column(String, nullable=True)  # FP1
    session2_date = Column(String, nullable=True)  # FP2 / Sprint Qualifying
    session3_date = Column(String, nullable=True)  # FP3 / Sprint
    session4_date = Column(String, nullable=True)  # Qualifying
    session5_date = Column(String, nullable=True)  # Race
    
    __table_args__ = (
        # Composite index for the common query pattern: filter by year, order by round
        # This makes queries like "WHERE year = X ORDER BY round" very fast
        Index("idx_races_year_round", "year", "round"),
        UniqueConstraint("year", "round", name="uq_races_year_round"),
    )


class DriverModel(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True)
    driver_number = Column(String, index=True)
    broadcast_name = Column(String)
    full_name = Column(String)
    team_name = Column(String)
    team_color = Column(String)
    headshot_url = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("year", "driver_number", name="uq_drivers_year_number"),
    )


class DriverStandingModel(Base):
    __tablename__ = "driver_standings"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True)
    position = Column(Integer)
    points = Column(String)
    wins = Column(Integer)
    driver_id = Column(String)
    driver_number = Column(String, index=True)
    given_name = Column(String)
    family_name = Column(String)
    constructor_name = Column(String)
    headshot_url = Column(String, nullable=True)
    team_color = Column(String, nullable=True)
    broadcast_name = Column(String, nullable=True)
    team_name = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("year", "driver_id", name="uq_driver_standings_year_driver"),
    )


class TeamStandingModel(Base):
    __tablename__ = "team_standings"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True)
    position = Column(Integer)
    points = Column(String)
    wins = Column(Integer)
    constructor_id = Column(String, index=True)
    constructor_name = Column(String)
    nationality = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("year", "constructor_id", name="uq_team_standings_year_constructor"),
    )


class SessionResultModel(Base):
    __tablename__ = "session_results"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True)
    round = Column(Integer, index=True)
    session_code = Column(String, index=True)
    position = Column(String, nullable=True)  # practice sessions can be missing positions
    driver_number = Column(String, index=True)
    broadcast_name = Column(String)
    team_name = Column(String)
    time = Column(String)
    status = Column(String)
    points = Column(Integer)
    # When these rows were last fetched from FastF1. Drives stale-while-revalidate
    # inside the live weekend window and lets warming skip already-fresh sessions.
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("year", "round", "session_code", "driver_number", name="uq_session_results_driver"),
        Index("idx_session_results_lookup", "year", "round", "session_code"),
    )


class UserModel(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # Clerk user id (the JWT "sub" claim). Primary external identity.
    clerk_user_id = Column(String, unique=True, index=True, nullable=True)
    email = Column(String, index=True, nullable=True)
    # Legacy password auth removed (Clerk owns credentials); kept nullable so the
    # column survives on existing databases without a destructive migration.
    password_hash = Column(String, nullable=True)
    full_name = Column(String, nullable=True)


class FavoriteModel(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    driver_id = Column(String, nullable=True)
    team_id = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "driver_id", "team_id", name="uq_user_favorite"),
    )


class AppCacheModel(Base):
    """
    Generic cache table for precomputed heavy payloads (analysis, telemetry, standings, etc.).
    Example keys:
      - analysis_laps_2024_1
      - telemetry_2024_1_44
      - stints_2024_1_44
    """

    __tablename__ = "app_cache"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    # Use JSONB on Postgres, JSON otherwise (SQLite dev fallback).
    data = Column(JSONB().with_variant(JSON, "sqlite"), nullable=False)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
