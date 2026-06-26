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
    def _add_column(table: str, column: str, sqlite_type: str, pg_ddl: str) -> None:
        try:
            with engine.begin() as conn:
                if _is_sqlite:
                    cols = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                    names = {row[1] for row in cols}
                    if cols and column not in names:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {sqlite_type}"))
                else:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {pg_ddl}"))
        except Exception as e:  # pragma: no cover - never block startup on migration
            print(f"[MIGRATION] {table}.{column} skipped: {e}")

    _add_column("session_results", "fetched_at", "DATETIME", "TIMESTAMPTZ DEFAULT now()")
    # Clerk identity column for the users table.
    _add_column("users", "clerk_user_id", "VARCHAR", "VARCHAR")
    # Individual session dates on the races table.
    for col in ("session1_date", "session2_date", "session3_date", "session4_date", "session5_date"):
        _add_column("races", col, "VARCHAR", "VARCHAR")
