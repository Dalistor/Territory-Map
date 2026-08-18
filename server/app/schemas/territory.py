"""DTOs of the territory -- the demarcated area, and the blocks drawn inside it."""

from uuid import UUID

from pydantic import BaseModel

from app.schemas.block import BlockOut
from app.schemas.common import OutSchema, ShortText
from app.schemas.geo import RingIn, RingOut
from app.schemas.user import UserBriefOut


class TerritoryCreateIn(BaseModel):
    """A new territory: what it is called and where it is.

    The congregation is not a field -- it comes from the admin's token, which is the
    only barrier between the data of one congregation and another's.
    """

    name: ShortText
    boundary: RingIn


class TerritoryPatchIn(BaseModel):
    """A partial edit. A field left out is untouched; a boundary sent is redrawn."""

    name: ShortText | None = None
    boundary: RingIn | None = None


class TerritoryOut(OutSchema):
    """A territory as both clients read it.

    `blocks` defaults to empty so the same model serves the listing (areas only) and
    the detail endpoint (areas with their numbered blocks), without a second DTO whose
    only difference would be one field.

    `assigned_user` is `None` when the territory has no publisher currently responsible
    for it -- nested rather than flattened to a name string for the same reason as
    `WorkLogOut.user`: it lets a client tell two people with the same first name apart.
    """

    id: UUID
    name: str
    boundary: RingOut
    blocks: list[BlockOut] = []
    assigned_user: UserBriefOut | None = None
