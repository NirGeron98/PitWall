from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None

    class Config:
        orm_mode = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AuthPayload(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class FavoritePayload(BaseModel):
    driver_id: Optional[str] = None
    team_id: Optional[str] = None


class FavoriteOut(BaseModel):
    id: int
    driver_id: Optional[str] = None
    team_id: Optional[str] = None

    class Config:
        orm_mode = True
