from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models import FavoriteModel, UserModel
from app.schemas import FavoriteOut, FavoritePayload


router = APIRouter(prefix="/api", tags=["user"])


@router.get("/favorites", response_model=List[FavoriteOut])
def list_favorites(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    favorites = db.query(FavoriteModel).filter(FavoriteModel.user_id == current_user.id).all()
    return favorites


@router.post("/favorites", response_model=FavoriteOut)
def add_favorite(
    payload: FavoritePayload,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not payload.driver_id and not payload.team_id:
        raise HTTPException(status_code=400, detail="driver_id or team_id must be provided")

    existing = (
        db.query(FavoriteModel)
        .filter(
            FavoriteModel.user_id == current_user.id,
            FavoriteModel.driver_id == payload.driver_id,
            FavoriteModel.team_id == payload.team_id,
        )
        .first()
    )
    if existing:
        return existing

    favorite = FavoriteModel(
        user_id=current_user.id,
        driver_id=payload.driver_id,
        team_id=payload.team_id,
    )
    db.add(favorite)
    db.commit()
    db.refresh(favorite)
    return favorite


@router.delete("/favorites/{favorite_id}", status_code=204)
def remove_favorite(
    favorite_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    favorite = (
        db.query(FavoriteModel)
        .filter(
            FavoriteModel.id == favorite_id,
            FavoriteModel.user_id == current_user.id,
        )
        .first()
    )
    if not favorite:
        raise HTTPException(status_code=404, detail="Favorite not found")

    db.delete(favorite)
    db.commit()
    return None
