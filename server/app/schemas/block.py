"""DTOs of the block -- the numbered outline that is the real unit of field work."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OutSchema
from app.schemas.geo import RingIn, RingOut

# Blocks are numbered the way the paper map numbers them, starting at one; zero and
# negatives are not numbering, they are a bug in the client.
MIN_BLOCK_NUMBER = 1


class BlockCreateIn(BaseModel):
    """A new block inside a territory.

    `number` is optional: left out, the server assigns the lowest free integer of the
    territory. Sent, the admin's choice wins -- the numbering usually already exists
    on paper, and the system's job is to record it, not to impose its own.
    """

    number: int | None = Field(default=None, ge=MIN_BLOCK_NUMBER)
    polygon: RingIn


class BlockPatchIn(BaseModel):
    """A partial edit of a block. Every field absent means "leave this alone"."""

    number: int | None = Field(default=None, ge=MIN_BLOCK_NUMBER)
    polygon: RingIn | None = None


class BlockOut(OutSchema):
    """A block as both clients read it.

    `last_worked_at` is the projection of the work log, and `None` means the block has
    never been covered -- which is exactly the state the map has to highlight.
    """

    id: UUID
    number: int
    polygon: RingOut
    last_worked_at: datetime | None = None
