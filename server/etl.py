"""Legacy ETL entrypoint.

The ETL logic lives in app/services/f1_service.py.
This module remains as a thin wrapper for backward compatibility.
"""

from app.services.f1_service import run_etl


if __name__ == "__main__":
    run_etl()
