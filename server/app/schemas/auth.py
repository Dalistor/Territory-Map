"""DTOs of the admin login.

`POST /auth/login` takes name, city and password together and answers with a token
plus the congregation it belongs to, so the desktop app can show whose data it is
looking at without a second request.
"""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from app.schemas.common import MAX_PASSWORD_LENGTH, OutSchema, Password, ShortText

#: Only the *new* password has a floor. Login must keep accepting whatever was set
#: before, or raising the bar here would lock out an existing admin instead of
#: prompting them to change it.
MIN_NEW_PASSWORD_LENGTH = 12

NewPassword = Annotated[
    str,
    StringConstraints(min_length=MIN_NEW_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH),
]


class LoginIn(BaseModel):
    """The admin's credentials. The three fields are only ever validated together."""

    name: ShortText
    city: ShortText
    password: Password


class RegisterIn(BaseModel):
    """A new congregation, as the admin fills it in on the sign-up screen."""

    name: ShortText
    city: ShortText
    password: NewPassword


class CongregationOut(OutSchema):
    """A congregation as the client sees it.

    `password_hash` is deliberately absent -- the field does not exist in this model,
    so validating a `Congregation` row through it drops the digest instead of
    relying on anyone to remember to exclude it.
    """

    id: UUID
    name: str
    city: str


class TokenOut(OutSchema):
    """A successful login: the admin JWT and the congregation it is scoped to."""

    access_token: str
    token_type: str = "bearer"
    congregation: CongregationOut
