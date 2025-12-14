from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint

from app.database import Base


class RaceModel(Base):
    __tablename__ = "races"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True)
    round = Column(Integer, index=True)
    event_name = Column(String)
    country = Column(String)
    location = Column(String)
    date = Column(String)  # ISO format string
    event_format = Column(String)


class DriverModel(Base):
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
    __tablename__ = "session_results"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True)
    round = Column(Integer, index=True)
    session_code = Column(String, index=True)
    position = Column(String, nullable=True)  # practice sessions can be missing positions
    driver_number = Column(String)
    broadcast_name = Column(String)
    team_name = Column(String)
    time = Column(String)
    status = Column(String)
    points = Column(Integer)


class UserModel(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
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
