"""DTOs of the territory assignment -- the S-13 card, one row per stint.

An assignment is not a flag on the territory: it is a dated record that outlives the
person currently responsible. The territory's `assigned_user` is a projection of the
open row in this history, not a separate truth.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import OutSchema
from app.schemas.user import UserBriefOut


class AssignmentCreateIn(BaseModel):
    """Who the admin is handing the territory to.

    Only the publisher is sent. The territory comes from the URL and the congregation
    from the admin's token, and the start date is the server's clock -- a client-chosen
    `started_at` would let a mistyped date rewrite the card's chronology.
    """

    user_id: UUID


class AssignmentOut(OutSchema):
    """One row of a territory's assignment card.

    `completed_at` is what separates the present from the past. Null means the
    assignment is **open**: this is the stint that holds now, the publisher named here
    is the one who may mark blocks in the territory, and it is the row the territory's
    `assigned_user` projects. A filled `completed_at` means the stint is closed and the
    row is history -- kept so the admin can see who worked the territory and when,
    exactly as the paper card does.

    The publisher is nested rather than flattened into a name string, for the same
    reason as `WorkLogOut.user`: it lets the admin tell two people with the same first
    name apart, and `UserBriefOut` carries only the identity, never the account's
    internal state.
    """

    id: UUID
    user: UserBriefOut
    started_at: datetime
    completed_at: datetime | None = None
