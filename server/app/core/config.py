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
ADMIN_SYNC_SECRET: str | None = os.getenv("ADMIN_SYNC_SECRET")


# --- Clerk authentication ---
# Issuer is the Clerk Frontend API domain, e.g. https://<slug>.clerk.accounts.dev
# (no trailing slash). JWKS is derived from it unless overridden.
CLERK_ISSUER: str | None = (os.getenv("CLERK_ISSUER") or "").rstrip("/") or None
CLERK_JWKS_URL: str | None = os.getenv("CLERK_JWKS_URL") or (
    f"{CLERK_ISSUER}/.well-known/jwks.json" if CLERK_ISSUER else None
)
# Secret key (sk_...) is optional for JWKS verification but kept for any
# server-side Clerk API calls.
CLERK_SECRET_KEY: str | None = os.getenv("CLERK_SECRET_KEY")


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
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://pit-wall.vercel.app",
    ]


# --- FastF1 cache ---
def _default_cache_dir() -> str:
    """Choose a sensible default FastF1 cache directory.

    The repo includes a top-level 'cache/' directory (PitWall/cache). If we run the
    API from a different working directory (e.g. PitWall/server), a relative
    'cache' path points to the wrong place and FastF1 will re-download data.
    """

    # server/app/core/config.py -> PitWall/server/app/core
    server_root = Path(__file__).resolve().parents[2]  # PitWall/server
    repo_root = Path(__file__).resolve().parents[3]  # PitWall

    repo_cache = repo_root / "cache"
    if repo_cache.exists():
        return str(repo_cache)

    # Fallback for deployments that expect a server-local cache.
    return str(server_root / "cache")


CACHE_DIR: str = os.getenv("FASTF1_CACHE_DIR") or _default_cache_dir()


# --- Database ---
DATABASE_URL: str | None = os.getenv("DATABASE_URL")


# --- Session result caching ---
# A weekend is considered "live" (results may still change) when the race date is
# within +/- LIVE_WINDOW_DAYS of today. Outside this window a completed session is
# treated as immutable and always served from the DB cache.
LIVE_WINDOW_DAYS: int = int(os.getenv("LIVE_WINDOW_DAYS", "4"))

# Inside the live window, cached session rows older than this TTL trigger a
# stale-while-revalidate refresh from FastF1 (cached rows are still returned first).
LIVE_SESSION_TTL_SECONDS: int = int(os.getenv("LIVE_SESSION_TTL_SECONDS", "120"))
