"""DTOs of the admin login.

`POST /auth/login` takes name, city and password together and answers with a token
plus the congregation it belongs to, so the desktop app can show whose data it is
looking at without a second request.
"""

from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import OutSchema, Password, ShortText


class LoginIn(BaseModel):
    """The admin's credentials. The three fields are only ever validated together."""

    name: ShortText
    city: ShortText
    password: Password


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
