from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import DATABASE_URL


Base = declarative_base()


def _normalize_database_url(url: str) -> str:
    # Render sometimes provides postgres:// but SQLAlchemy expects postgresql://
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def _build_database_url() -> str:
    if DATABASE_URL:
        return _normalize_database_url(DATABASE_URL)

    # Safe local fallback when DATABASE_URL isn't provided.
    # Keeps dev experience smooth.
    local_path = Path(__file__).resolve().parents[1] / "pitwall.db"  # server/pitwall.db
    return f"sqlite:///{local_path.as_posix()}"


SQLALCHEMY_DATABASE_URL = _build_database_url()


engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Ensure models are imported/registered before creating tables.
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
