"""DTOs of the block -- the numbered outline that is the real unit of field work."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OutSchema
from app.schemas.geo import RingIn, RingOut

# The status the admin pins on a block, overriding the colour the dates would give it.
# `"overdue"` is the orange of a block whose rotation ran out, `"never"` the red of one
# that was never covered -- the same two states the map already paints on its own, made
# available to an admin who knows something the work log does not.
BlockStatusOverride = Literal["overdue", "never"]

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
    """A partial edit of a block. Every field absent means "leave this alone".

    `status_override` is the one field where absent and null are *not* the same thing:
    absent leaves the pinned status untouched, while an explicit null hands the block
    back to the automatic colour computed from its dates. The router tells the two
    apart by `model_fields_set`, never by the value -- exactly as it already does with
    `rotation_days` in `TerritoryPatchIn` (spec 0009).
    """

    number: int | None = Field(default=None, ge=MIN_BLOCK_NUMBER)
    polygon: RingIn | None = None
    status_override: BlockStatusOverride | None = None


class BlockOut(OutSchema):
    """A block as both clients read it.

    `last_worked_at` is the projection of the work log, and `None` means the block has
    never been covered -- which is exactly the state the map has to highlight.

    `status_override` is `None` for the ordinary block, whose colour both clients work
    out from the dates. Set, it is the colour the admin pinned, and it wins over that
    calculation on the map -- so it travels in every read, including the listing the
    app caches to colour its map offline.
    """

    id: UUID
    number: int
    polygon: RingOut
    last_worked_at: datetime | None = None
    status_override: BlockStatusOverride | None = None
