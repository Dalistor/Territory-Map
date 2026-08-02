"""Pieces every DTO in this package is built from.

Two things live here: the base class for outputs, and the annotated `str` types that
carry the project's text rules. Declaring `ShortText` once is what keeps a name from
being trimmed in one endpoint and not in another -- the difference nobody notices
until two rows that look identical are not.
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

# Matches `String(120)` on every name-like column of the schema. Whitespace is
# stripped *before* the length is measured, so "  " is a blank name, not a valid
# two-character one.
MAX_TEXT_LENGTH = 120
ShortText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TEXT_LENGTH),
]

# A password is never stripped: it is a secret byte sequence, not a display string,
# and trimming it would authenticate against something other than what was typed.
# The cap only keeps a multi-megabyte body from reaching bcrypt -- note that bcrypt
# itself reads no further than the first 72 bytes.
MAX_PASSWORD_LENGTH = 128
Password = Annotated[str, StringConstraints(min_length=1, max_length=MAX_PASSWORD_LENGTH)]


class OutSchema(BaseModel):
    """Base of every response DTO.

    `from_attributes` lets a response be validated straight off an ORM row or a
    domain object. Fields are opt-in, which is the whole security value of this
    layer: `password_hash` and `token_version` are simply never declared, so no
    refactor of a model can leak them into a response by accident.
    """

    model_config = ConfigDict(from_attributes=True)
