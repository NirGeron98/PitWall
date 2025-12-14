"""Legacy entrypoint.

The production-ready app lives in app/main.py.
This module remains as a thin wrapper so existing deploy/run commands keep working.
"""

import uvicorn

from app.main import app


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)