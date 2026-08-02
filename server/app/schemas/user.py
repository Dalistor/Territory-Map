"""DTOs of the publisher: registration by the admin, and redemption by the app.

Two audiences share this module. The admin sees the access code while it is alive
(`UserOut`, `AccessCodeOut`); the phone only ever sends one back (`ActivateIn`) and
receives a token in exchange (`ActivateOut`).
"""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints, field_validator

from app.core.security import ACCESS_CODE_LENGTH
from app.schemas.auth import CongregationOut
from app.schemas.common import OutSchema, ShortText

# The code is read out loud and typed by hand, so it arrives with stray spaces from a
# copy-paste and in whatever case the keyboard was in. Its length is fixed by the
# server that mints it -- `app/core/security.py` is the single source of that number.
AccessCode = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=ACCESS_CODE_LENGTH,
        max_length=ACCESS_CODE_LENGTH,
    ),
]


class UserCreateIn(BaseModel):
    """What the admin fills in to register a publisher: the name, and nothing else.

    There is no `congregation_id` here by design -- the tenant is derived from the
    admin's token, never accepted from the client.
    """

    name: ShortText


class UserOut(OutSchema):
    """A publisher as the admin sees them.

    `token_version` is deliberately absent: it is an internal revocation counter, of
    no use to a client and a hint about the account's token state. `password_hash`
    is not a field of this entity at all -- users have no password.

    `access_code` and its expiry are nullable rather than omitted: after redemption
    the admin needs to see that there is no live code, which is different from the
    field not having been asked for.
    """

    id: UUID
    name: str
    access_code: str | None = None
    access_code_expires_at: datetime | None = None
    activated_at: datetime | None = None
    is_active: bool


class UserBriefOut(OutSchema):
    """Just enough of a publisher to greet them by name on their own device."""

    id: UUID
    name: str


class UserPatchIn(BaseModel):
    """The only thing the admin may change on a publisher: whether access is on.

    Required, not optional: this endpoint exists to flip the flag, and a body without
    it is a request that means nothing.
    """

    is_active: bool


class AccessCodeOut(OutSchema):
    """A freshly minted code and the moment it stops working.

    Shown once, on the admin's screen, so the code can be handed to the person. It
    is a credential: never log it, never put it in a URL.
    """

    access_code: str
    access_code_expires_at: datetime


class ActivateIn(BaseModel):
    """The code the publisher types on first launch."""

    access_code: AccessCode

    @field_validator("access_code")
    @classmethod
    def normalise_case(cls, value: str) -> str:
        """Uppercase the code so the phone keyboard's case never costs an attempt.

        The alphabet the server draws from is uppercase-only, so lowercase input is
        a typing accident, not a different code.
        """
        return value.upper()


class ActivateOut(OutSchema):
    """The exchange result: a permanent app token, plus who and where the user is."""

    token: str
    user: UserBriefOut
    congregation: CongregationOut
