"""Security primitives: password hashing, access-code generation and JWT tokens."""

import secrets
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings

#: Raised by `decode_token` for every untrustworthy token -- bad signature, expired,
#: or not a JWT at all. Aliased here so the rest of the app never imports `jose`:
#: swapping the JWT library stays a change to this module alone.
#:
#: Deliberately *not* a `DomainError`. A rejected token is an authentication failure
#: handled by the auth dependency, not a business-rule violation, and the caller must
#: answer with one generic 401 that never says which of the conditions failed.
TokenError = JWTError

_password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

#: Alphabet of the access code. The admin reads it out loud and the publisher types it
#: by hand, so every character that can be misread is out: `0`/`O`, `1`/`I`/`L`.
#:
#: This is the spec's alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` minus `L`. The spec
#: gave that literal string and, in the same breath, required the code to exclude
#: `0 O 1 I L` -- but the string still contained `L`. Dropping `L` is the one reading
#: that satisfies both: the output stays a subset of the stated alphabet *and* holds
#: none of the forbidden characters. 31 symbols still give 31**8 codes for a
#: single-use credential that lives 24 hours.
ACCESS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

ACCESS_CODE_LENGTH = 8

#: Value of the `type` claim. The two tokens have very different powers, so the auth
#: dependency checks this claim to keep an app token from ever reaching an admin
#: endpoint -- a valid signature alone must not be enough.
ADMIN_TOKEN_TYPE = "admin"
APP_TOKEN_TYPE = "app"


def _encode(payload: dict[str, Any]) -> str:
    settings = get_settings()
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def hash_password(raw: str) -> str:
    """Return a bcrypt hash of `raw`, with a fresh random salt embedded in it."""
    return _password_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    """Return whether `raw` is the password behind `hashed`."""
    return _password_context.verify(raw, hashed)


def generate_access_code(length: int = ACCESS_CODE_LENGTH) -> str:
    """Return a cryptographically random access code drawn from `ACCESS_CODE_ALPHABET`.

    `secrets`, never `random`: this is a credential, and `random` is a predictable
    Mersenne Twister that would let an attacker reproduce the sequence.
    """
    return "".join(secrets.choice(ACCESS_CODE_ALPHABET) for _ in range(length))


def create_admin_token(congregation_id: UUID | str, now: datetime) -> str:
    """Return the admin JWT, expiring `ADMIN_TOKEN_TTL_HOURS` after `now`.

    `now` is a parameter and never `datetime.now()`: the caller owns the clock, which
    is what makes expiry testable without sleeping or freezing time.
    """
    expires_at = now + timedelta(hours=get_settings().ADMIN_TOKEN_TTL_HOURS)
    return _encode(
        {
            "congregation_id": str(congregation_id),
            "type": ADMIN_TOKEN_TYPE,
            "exp": expires_at,
        }
    )


def create_app_token(
    user_id: UUID | str,
    congregation_id: UUID | str,
    token_version: int,
) -> str:
    """Return the publisher's app token, which never expires.

    There is no `exp` on purpose: the phone keeps this token forever. What makes it
    revocable is `token_version` -- every code redemption bumps the counter on the
    row, so the auth dependency can reject a token whose version fell behind. That
    check hits the database on every request; this token is not stateless.

    No clock is involved, so unlike `create_admin_token` this takes no `now`.
    """
    return _encode(
        {
            "user_id": str(user_id),
            "congregation_id": str(congregation_id),
            "token_version": token_version,
            "type": APP_TOKEN_TYPE,
        }
    )


def decode_token(token: str) -> dict[str, Any]:
    """Return the payload of `token`, or raise `TokenError` if it cannot be trusted.

    Rejects a bad signature, an expired token and anything that is not a JWT at all.
    """
    settings = get_settings()
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
