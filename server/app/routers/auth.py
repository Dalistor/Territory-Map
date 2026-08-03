"""The two public routes: the admin signs in, the publisher redeems a code.

These are the only endpoints reachable without a token, and both hand one out. What
they have in common is that failure here must never be informative -- wrong name,
wrong city, wrong password and unknown code all come back as the same 401, produced
by the domain errors the services raise and translated in `app/main.py`.
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.rate_limit import (
    ACTIVATE_RATE_LIMIT,
    LOGIN_RATE_LIMIT,
    REGISTER_RATE_LIMIT,
    limiter,
)
from app.core.security import create_admin_token
from app.repositories.congregation import CongregationRepository
from app.repositories.user import UserRepository
from app.schemas.auth import CongregationOut, LoginIn, RegisterIn, TokenOut
from app.schemas.user import ActivateIn, ActivateOut, UserBriefOut
from app.services.auth import AuthService
from app.services.congregation import CongregationService
from app.services.user import UserService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_session)]


def utc_now() -> datetime:
    """Read the wall clock, timezone-aware.

    The router is the composition root, so this is where the clock is allowed to be
    read: services receive it as `now_provider` and never call `datetime.now()`
    themselves, which is what lets their tests pin expiry without sleeping.
    """
    return datetime.now(UTC)


def get_auth_service(session: DbSession) -> AuthService:
    return AuthService(CongregationRepository(session), utc_now)


def get_user_service(session: DbSession) -> UserService:
    return UserService(UserRepository(session), utc_now)


@router.post("/auth/login", tags=["auth"])
@limiter.limit(LOGIN_RATE_LIMIT)
def login(
    request: Request,
    payload: LoginIn,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenOut:
    """Exchange the admin's credentials for a JWT scoped to their congregation.

    `request` is here for the throttle, which keys on the caller's address; the
    endpoint itself never reads it. Every call counts against the quota, successes
    included -- counting only failures would let a guesser reset their budget with
    one valid request.
    """
    congregation, token = service.login(payload.name, payload.city, payload.password)
    # `CongregationOut` has no `password_hash` field, so validating the row through
    # it drops the digest -- the response cannot carry it even by accident.
    return TokenOut(
        access_token=token,
        congregation=CongregationOut.model_validate(congregation),
    )


@router.post("/app/activate", tags=["app"])
@limiter.limit(ACTIVATE_RATE_LIMIT)
def activate(
    request: Request,
    payload: ActivateIn,
    service: Annotated[UserService, Depends(get_user_service)],
) -> ActivateOut:
    """Spend a single-use access code and return the phone's permanent token.

    Throttled per IP: this is the one endpoint where a short credential could be
    found by trying, and the roomier limit still leaves a guesser needing centuries
    against an 8-character alphabet that also expires in a day.
    """
    user, token = service.activate(payload.access_code)
    return ActivateOut(
        token=token,
        user=UserBriefOut.model_validate(user),
        # The congregation is read off the resolved user, never off the request:
        # the code alone identifies the tenant.
        congregation=CongregationOut.model_validate(user.congregation),
    )
