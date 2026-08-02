"""DTOs of the work log -- the only write the mobile app is allowed to make."""

from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel

from app.schemas.common import OutSchema
from app.schemas.user import UserBriefOut


class WorkedIn(BaseModel):
    """A publisher reporting that a block is done.

    `log_id` is minted on the phone, not here: a marking made with no signal sits in a
    local queue and may be sent more than once, and the client-side id is what lets the
    server recognise the resend instead of recording a second visit.

    `worked_at` must carry an offset. The moment is read from the device's clock,
    possibly days before it reaches the server and possibly in another timezone, so a
    naive timestamp would be an unplaceable point on the timeline -- and the service's
    "not in the future, not older than 90 days" rules would compare against nothing.
    Whether the moment is plausible is that service's call; this layer only demands
    that it be a moment at all.
    """

    log_id: UUID
    worked_at: AwareDatetime


class WorkLogOut(OutSchema):
    """One recorded visit, as the admin browses the history of a block.

    The publisher is nested rather than flattened into a name string so the admin can
    tell two people with the same first name apart -- and `UserBriefOut` carries only
    the identity, never the account's internal state.

    `worked_at` is when the block was finished; `created_at` is when the record reached
    the server. They differ by however long the phone stayed offline, and the admin
    needs both to make sense of a late sync.
    """

    id: UUID
    block_id: UUID
    user: UserBriefOut
    worked_at: datetime
    created_at: datetime
