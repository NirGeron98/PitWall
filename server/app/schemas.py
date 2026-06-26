from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class UserOut(BaseModel):
    id: int
    email: Optional[str] = None
    full_name: Optional[str] = None

    class Config:
        from_attributes = True


class FavoritePayload(BaseModel):
    driver_id: Optional[str] = None
    team_id: Optional[str] = None


class FavoriteOut(BaseModel):
    id: int
    driver_id: Optional[str] = None
    team_id: Optional[str] = None

    class Config:
        from_attributes = True
