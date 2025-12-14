from __future__ import annotations

import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv


def _load_local_env() -> None:
    """Load a local .env file if present.

    Production platforms (Render, etc.) provide environment variables directly.
    """

    env_path = Path(__file__).resolve().parents[2] / ".env"  # server/.env
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)


_load_local_env()


# --- Security ---
JWT_SECRET: str = os.getenv("JWT_SECRET", "pitwall-dev-secret-key")
JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7)))


# --- CORS ---
# Accept either:
# - CORS_ORIGINS="https://a.com,https://b.com"
# - FRONTEND_URL="https://a.com"

def cors_allow_origins() -> List[str]:
    cors_origins_env = os.getenv("CORS_ORIGINS")
    frontend_url_env = os.getenv("FRONTEND_URL")

    if cors_origins_env:
        return [o.strip() for o in cors_origins_env.split(",") if o.strip()]
    if frontend_url_env:
        return [frontend_url_env.strip()]

    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://pit-wall.vercel.app",
    ]


# --- FastF1 cache ---
CACHE_DIR: str = os.getenv("FASTF1_CACHE_DIR", "cache")


# --- Database ---
DATABASE_URL: str | None = os.getenv("DATABASE_URL")
