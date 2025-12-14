from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import authenticate_user, create_access_token, get_password_hash, get_current_user
from app.database import get_db
from app.models import UserModel
from app.schemas import AuthPayload, TokenResponse, UserOut


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register_user(payload: AuthPayload, db: Session = Depends(get_db)):
    email_normalized = payload.email.lower().strip()
    existing_user = db.query(UserModel).filter(UserModel.email == email_normalized).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = UserModel(
        email=email_normalized,
        password_hash=get_password_hash(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.post("/login", response_model=TokenResponse)
def login_user(payload: AuthPayload, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.email.lower().strip(), payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: UserModel = Depends(get_current_user)):
    return current_user
