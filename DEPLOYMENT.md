# PitWall Free Production Deployment

## Target Architecture

- Frontend: Vercel static Vite app from `client/`
- Backend: Render free web service from `server/`
- Database: Neon Postgres free tier, using the pooled connection string
- Keep-alive: UptimeRobot pings `GET /health` every 5-10 minutes

## Backend Environment

Set these on Render:

- `DATABASE_URL`: Neon pooled Postgres URL, including `sslmode=require`
- `CLERK_ISSUER`: Clerk Frontend API URL, e.g. `https://<slug>.clerk.accounts.dev` (no trailing slash)
- `CLERK_SECRET_KEY`: Clerk secret key (`sk_live_...` in production)
- `CORS_ORIGINS`: deployed frontend URL, plus local dev if needed
- `FRONTEND_URL`: deployed frontend URL
- `FASTF1_CACHE_DIR`: `/tmp/fastf1-cache`
- `ADMIN_SYNC_SECRET`: long random secret for `/api/admin/sync`

The `JWT_*` variables are legacy and no longer used (Clerk owns authentication).

## Frontend Environment

Set these on Vercel:

- `VITE_API_BASE_URL`: Render backend URL
- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk publishable key (`pk_live_...` in production)

## Authentication (Clerk)

Login/registration is handled by [Clerk](https://dashboard.clerk.com); the backend
only verifies Clerk session tokens (JWKS, RS256) via `CLERK_ISSUER`.

One-time dashboard setup:

1. Create an application in the Clerk dashboard.
2. **User & Authentication → Social Connections → Google → enable.** (For dev
   instances Clerk provides shared Google credentials; for production add your own
   Google OAuth client ID/secret.)
3. **API Keys** → copy the Publishable key (frontend) and Secret key (backend);
   the "Frontend API URL" there is your `CLERK_ISSUER`.
4. Add your deployed frontend domain under **Domains** for production instances.

Local dev uses `pk_test_`/`sk_test_` keys in `client/.env` and `server/.env`.

## First Production Seed

From the repo root:

```bash
DATABASE_URL="postgresql://..." python server/scripts/seed_neon.py --copy-sqlite
```

If you prefer to fetch fresh F1 data instead of copying local data:

```bash
DATABASE_URL="postgresql://..." python server/scripts/seed_neon.py --etl-if-empty
```

## Keep Warm and Refresh Data

Use UptimeRobot against:

```text
https://your-backend.onrender.com/health
```

Refresh F1 cache data manually or from GitHub Actions:

```bash
curl -X POST "https://your-backend.onrender.com/api/admin/sync?year=2026" \
  -H "x-admin-sync-secret: $ADMIN_SYNC_SECRET"
```

### Warming session results (fast race modal)

`/api/admin/sync` now warms **every session** (FP1/FP2/FP3, Qualifying, Sprint,
Race) of every completed round into the `session_results` table, so opening a
race details modal is served from the DB instead of cold-loading FastF1 on the
user's first click. Completed sessions outside the live window (`LIVE_WINDOW_DAYS`,
default 4) are treated as immutable and never refetched; sessions inside the live
window revalidate after `LIVE_SESSION_TTL_SECONDS` (default 120s).

The warm step is idempotent — already-cached sessions are skipped — so it is safe
to run after every deploy. To warm an already-seeded DB without a full ETL:

```bash
# One season
python server/etl.py --warm --year 2026
# All seasons (2020 -> current)
python server/etl.py --warm
```

A `--full` ETL (`python server/etl.py --full`) also warms all completed sessions
across all years automatically.
