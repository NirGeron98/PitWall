from __future__ import annotations

from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from app.core.config import CLERK_ISSUER, CLERK_JWKS_URL
from app.database import get_db
from app.models import UserModel


# Clerk sends the session token as a Bearer token in the Authorization header.
bearer_scheme = HTTPBearer(auto_error=False)

# Cache the JWKS client so we don't refetch signing keys on every request.
_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if not CLERK_JWKS_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Clerk auth is not configured (set CLERK_ISSUER).",
        )
    if _jwks_client is None:
        _jwks_client = PyJWKClient(CLERK_JWKS_URL)
    return _jwks_client


def _verify_clerk_token(token: str) -> dict:
    """Verify a Clerk session JWT against the issuer's JWKS and return its claims."""
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            # Clerk session tokens don't carry an `aud` claim by default.
            options={"verify_aud": False},
        )
        return claims
    except Exception as exc:  # invalid signature, expired, wrong issuer, etc.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> UserModel:
    """Resolve the authenticated Clerk user, upserting a local row keyed by Clerk id."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = _verify_clerk_token(credentials.credentials)
    clerk_user_id = claims.get("sub")
    if not clerk_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    # Clerk can be configured to include email/name claims; fall back gracefully.
    email = claims.get("email") or None
    full_name = claims.get("name") or None

    user = db.query(UserModel).filter(UserModel.clerk_user_id == clerk_user_id).first()
    if user is None:
        user = UserModel(
            clerk_user_id=clerk_user_id,
            email=email,
            full_name=full_name,
            password_hash="",  # legacy NOT NULL safety; Clerk owns credentials
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Keep local copy fresh if Clerk provides updated profile claims.
        changed = False
        if email and user.email != email:
            user.email = email
            changed = True
        if full_name and user.full_name != full_name:
            user.full_name = full_name
            changed = True
        if changed:
            db.commit()
            db.refresh(user)

    return user
