"""Legacy database module.

The canonical database + models live under the app/ package.
This module re-exports the old names so existing imports keep working.
"""

from app.database import Base, SessionLocal, init_db  # noqa: F401
from app.models import (  # noqa: F401
    DriverModel,
    DriverStandingModel,
    FavoriteModel,
    RaceModel,
    SessionResultModel,
    TeamStandingModel,
    UserModel,
)