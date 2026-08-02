"""FastAPI authentication dependencies: who is calling, and with which token.

Two tokens with very different powers reach this module through the same
`Authorization: Bearer` header, so each dependency accepts exactly one of them and
says so by checking the `type` claim. Everything they refuse is refused the same
way: one 401 with one message, never a hint about which condition failed.
"""

from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.security import (
    ADMIN_TOKEN_TYPE,
    APP_TOKEN_TYPE,
    TokenError,
    decode_token,
)
from app.models.congregation import Congregation
from app.models.user import User
from app.repositories.congregation import CongregationRepository
from app.repositories.user import UserRepository

#: The one thing a rejected request is ever told. Which condition failed -- no
#: header, bad signature, expired, wrong token type, stale version, revoked user --
#: is never disclosed: that would turn the 401 into an oracle about tokens and
#: users. The admin reads this in the app and knows what to do: sign in again.
UNAUTHORIZED_DETAIL = "Sessão inválida ou expirada. Entre de novo."

#: `auto_error=False` so that a missing or malformed header comes back as `None`
#: and is answered by the same 401 as every other failure -- Starlette's own error
#: would say "Not authenticated" and give the caller a distinguishable body.
_bearer = HTTPBearer(auto_error=False)

BearerCredentials = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
DbSession = Annotated[Session, Depends(get_session)]


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=UNAUTHORIZED_DETAIL,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _payload(credentials: HTTPAuthorizationCredentials | None) -> dict[str, Any]:
    """Return the payload of the bearer token, or raise the generic 401.

    Every way a token can be untrustworthy -- header absent, not a JWT, signed with
    another key, past its `exp` -- ends here with the same answer.
    """
    if credentials is None:
        raise _unauthorized()
    try:
        return decode_token(credentials.credentials)
    except TokenError as error:
        raise _unauthorized() from error


def _payload_of_type(
    credentials: HTTPAuthorizationCredentials | None,
    expected_type: str,
) -> dict[str, Any]:
    """Return the payload only if the token is of the type this route accepts.

    A valid signature is not enough. The two tokens have very different powers, and
    a route that skipped this check would let the phone's token -- which never
    expires -- reach an admin write endpoint through nothing worse than a routing
    mistake.
    """
    payload = _payload(credentials)
    if payload.get("type") != expected_type:
        raise _unauthorized()
    return payload


def _uuid_claim(payload: dict[str, Any], name: str) -> UUID:
    """Read an identifier claim as a `UUID`, or raise the generic 401.

    The token minters always write these claims, so a payload without one was not
    built by this application: refuse it like any other bad token rather than let a
    `ValueError` surface as a 500.
    """
    try:
        return UUID(str(payload[name]))
    except (KeyError, ValueError) as error:
        raise _unauthorized() from error


def current_congregation(
    credentials: BearerCredentials,
    session: DbSession,
) -> Congregation:
    """Resolve the congregation behind the admin token in `Authorization: Bearer`."""
    payload = _payload_of_type(credentials, ADMIN_TOKEN_TYPE)
    congregation = CongregationRepository(session).get(_uuid_claim(payload, "congregation_id"))
    if congregation is None:
        raise _unauthorized()
    return congregation


def current_app_user(
    credentials: BearerCredentials,
    session: DbSession,
) -> User:
    """Resolve the publisher behind the app token in `Authorization: Bearer`.

    This token never expires, so it is not stateless: the row is read on every
    single request and it -- never the payload -- decides. `is_active` false means
    the admin revoked the access, and a `token_version` other than the stored one
    means a code was redeemed on another device and this one is the old phone.

    The congregation follows from the resolved user (`user.congregation_id`); the
    claim in the token is never the source of the tenant.
    """
    payload = _payload_of_type(credentials, APP_TOKEN_TYPE)
    user = UserRepository(session).get(_uuid_claim(payload, "user_id"))
    if user is None or not user.is_active:
        raise _unauthorized()
    if payload.get("token_version") != user.token_version:
        raise _unauthorized()
    return user
