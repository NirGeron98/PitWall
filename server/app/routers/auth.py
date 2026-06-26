from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.models import UserModel
from app.schemas import UserOut


router = APIRouter(prefix="/auth", tags=["auth"])


# Registration and login are handled entirely by Clerk on the client. The backend
# only verifies Clerk-issued session tokens (see app.core.security.get_current_user).


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: UserModel = Depends(get_current_user)):
    return current_user
