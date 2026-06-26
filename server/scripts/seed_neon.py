"""
Seed or migrate the production Neon database.

Examples:
  # Create tables on DATABASE_URL and copy the local SQLite DB into Neon.
  DATABASE_URL="postgresql://..." python server/scripts/seed_neon.py --copy-sqlite

  # Create tables and run the existing ETL if the races table is empty.
  DATABASE_URL="postgresql://..." python server/scripts/seed_neon.py --etl-if-empty
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from app.database import Base, SessionLocal, engine, init_db  # noqa: E402
from app.models import (  # noqa: E402
    AppCacheModel,
    DriverModel,
    DriverStandingModel,
    FavoriteModel,
    RaceModel,
    SessionResultModel,
    TeamStandingModel,
    UserModel,
)
from app.services.f1_service import run_etl  # noqa: E402


MODELS = [
    RaceModel,
    DriverModel,
    DriverStandingModel,
    TeamStandingModel,
    SessionResultModel,
    UserModel,
    FavoriteModel,
    AppCacheModel,
]


def _model_values(row, model):
    return {
        column.name: getattr(row, column.name)
        for column in model.__table__.columns
        if column.name != "id"
    }


def copy_sqlite_to_target(sqlite_path: Path) -> None:
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite DB not found: {sqlite_path}")

    source_engine = create_engine(f"sqlite:///{sqlite_path.as_posix()}", connect_args={"check_same_thread": False})
    SourceSession = sessionmaker(bind=source_engine)

    source = SourceSession()
    target = SessionLocal()
    try:
        for model in MODELS:
            rows = source.query(model).all()
            if not rows:
                continue
            target.query(model).delete()
            target.flush()
            for row in rows:
                target.add(model(**_model_values(row, model)))
            target.commit()
            print(f"Copied {len(rows)} rows into {model.__tablename__}")
    except Exception:
        target.rollback()
        raise
    finally:
        source.close()
        target.close()


def run_etl_if_empty() -> None:
    db = SessionLocal()
    try:
        has_races = db.query(RaceModel).first() is not None
    finally:
        db.close()

    if has_races:
        print("Races already exist; skipping ETL seed.")
        return

    run_etl()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create and seed the PitWall production database.")
    parser.add_argument("--copy-sqlite", action="store_true", help="Copy rows from server/pitwall.db into DATABASE_URL.")
    parser.add_argument("--etl-if-empty", action="store_true", help="Run ETL only if the target races table is empty.")
    parser.add_argument(
        "--sqlite-path",
        type=Path,
        default=SERVER_ROOT / "pitwall.db",
        help="Path to the local SQLite DB used with --copy-sqlite.",
    )
    args = parser.parse_args()

    if not os.getenv("DATABASE_URL"):
        raise RuntimeError("DATABASE_URL must be set to the Neon/Postgres target before running this script.")

    init_db()
    Base.metadata.create_all(bind=engine)

    if args.copy_sqlite:
        copy_sqlite_to_target(args.sqlite_path)

    if args.etl_if_empty:
        run_etl_if_empty()

    if not args.copy_sqlite and not args.etl_if_empty:
        print("Tables created. Pass --copy-sqlite or --etl-if-empty to seed data.")


if __name__ == "__main__":
    main()
