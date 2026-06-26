from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, text
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

_is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

_engine_options = {
    "pool_pre_ping": True,
}

if _is_sqlite:
    _engine_options["connect_args"] = {"check_same_thread": False}
else:
    # Keeps long-lived Render workers healthy when Neon closes idle pooled connections.
    _engine_options["pool_recycle"] = 300


engine = create_engine(SQLALCHEMY_DATABASE_URL, **_engine_options)

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
    _run_lightweight_migrations()


def _run_lightweight_migrations() -> None:
    """Idempotent column additions for tables that already exist in prod.

    create_all() never ALTERs existing tables, so new columns on long-lived
    tables (e.g. session_results.fetched_at) must be added explicitly. Kept
    minimal and safe to run on every startup.
    """

    # Postgres supports IF NOT EXISTS; SQLite does not, so guard via PRAGMA.
    try:
        with engine.begin() as conn:
            if _is_sqlite:
                cols = conn.execute(text("PRAGMA table_info(session_results)")).fetchall()
                names = {row[1] for row in cols}
                if cols and "fetched_at" not in names:
                    conn.execute(text("ALTER TABLE session_results ADD COLUMN fetched_at DATETIME"))
            else:
                conn.execute(
                    text(
                        "ALTER TABLE session_results "
                        "ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ DEFAULT now()"
                    )
                )
    except Exception as e:  # pragma: no cover - never block startup on migration
        print(f"[MIGRATION] session_results.fetched_at skipped: {e}")
