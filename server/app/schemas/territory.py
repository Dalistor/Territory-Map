"""DTOs of the territory -- the demarcated area, and the blocks drawn inside it."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.block import BlockOut
from app.schemas.campaign import CampaignBriefOut
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
    """A partial edit. A field left out is untouched; a boundary sent is redrawn.

    `rotation_days` is the one field where leaving it out and sending it as null mean
    different things: absent keeps whatever the territory has, null puts it back on the
    client's default cycle. The router tells the two apart by `model_fields_set`, never
    by the value, which is why the bound here is only on the number itself.
    """

    name: ShortText | None = None
    boundary: RingIn | None = None
    rotation_days: int | None = Field(default=None, ge=1, le=3650)


class LastWorkOut(BaseModel):
    """The most recent block work recorded anywhere in a territory."""

    user: UserBriefOut
    worked_at: datetime


class TerritoryOut(OutSchema):
    """A territory as both clients read it.

    `blocks` defaults to empty so the same model serves the listing (areas only) and
    the detail endpoint (areas with their numbered blocks), without a second DTO whose
    only difference would be one field.

    `assigned_user` is `None` when the territory has no publisher currently responsible
    for it -- nested rather than flattened to a name string for the same reason as
    `WorkLogOut.user`: it lets a client tell two people with the same first name apart.

    `rotation_days` is `None` for a territory the admin never configured, and both
    clients read that as "use the default cycle" -- the 120-day threshold they already
    apply today. It travels in the listing as well as the detail because the app colours
    its map offline, from whatever it cached.

    `assigned_since` is when the assignment in force started -- the "retirada" date of
    the S-13 card. Only the admin routes fill it; `None` means nobody has it now.

    `campaign` is the active campaign holding the territory, if any. Then
    `assigned_user` is `None` -- the campaign replaced the dirigente -- and clients show
    "Campanha: <nome>" in its place. Filled by the listings and the admin detail.
    """

    id: UUID
    name: str
    boundary: RingOut
    blocks: list[BlockOut] = []
    assigned_user: UserBriefOut | None = None
    rotation_days: int | None = None
    last_work: LastWorkOut | None = None
    assigned_since: datetime | None = None
    campaign: CampaignBriefOut | None = None


class TerritoryBriefOut(OutSchema):
    """Just enough of a territory to name it inside a listing of something else."""

    id: UUID
    name: str
