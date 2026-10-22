"""DTOs of the territory assignment -- the S-13 card, one row per stint.

An assignment is not a flag on the territory: it is a dated record that outlives the
person currently responsible. The territory's `assigned_user` is a projection of the
open row in this history, not a separate truth.
"""

from datetime import UTC, datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from app.schemas.campaign import CampaignBriefOut
from app.schemas.common import OutSchema
from app.schemas.territory import TerritoryBriefOut
from app.schemas.user import UserBriefOut


class AssignmentCreateIn(BaseModel):
    """Who the admin is handing the territory to.

    Only the publisher is sent. The territory comes from the URL and the congregation
    from the admin's token, and the start date is the server's clock -- a client-chosen
    `started_at` would let a mistyped date rewrite the card's chronology.
    """

    user_id: UUID


class AssignmentUpdateIn(BaseModel):
    """Admin updating an assignment record (active or past).

    Allows changing the publisher, start date, or completion date.
    Can also clear the completion date to reopen an assignment, provided
    no other assignment is currently open for the territory.
    """

    user_id: UUID | None = None
    started_at: AwareDatetime | None = None
    completed_at: AwareDatetime | None = None
    clear_completed_at: bool = False


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

    A row held by a campaign names no publisher: `user` is null and `campaign` names
    the campaign instead -- the people are the campaign's, and they can change while the
    line is open. Exactly one of the two is filled on every row.
    """

    id: UUID
    user: UserBriefOut | None = None
    campaign: CampaignBriefOut | None = None
    started_at: datetime
    completed_at: datetime | None = None


class AssignmentWithTerritoryOut(AssignmentOut):
    """One row of the congregation-wide listing (`GET /admin/assignments`).

    Same record as `AssignmentOut`, plus the territory it belongs to. The per-territory
    listing can leave it out because the territory is already in the URL that asked for
    it; here every row comes from a different card, so each one has to say which
    territory it is from or the list cannot be grouped or read.
    """

    territory: TerritoryBriefOut


class AssignmentHistoryQuery(BaseModel):
    """Optional filters for the congregation-wide assignment history.

    The interval is made of instants, rather than calendar dates. Clients choose the
    local day boundaries they need and this DTO preserves those instants in UTC, so
    the server never guesses a congregation time zone.
    """

    from_instant: datetime | None = Field(default=None, alias="from")
    to_instant: datetime | None = Field(default=None, alias="to")
    publisher_id: UUID | None = None
    territory_id: UUID | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=100)

    @model_validator(mode="after")
    def normalize_instants_and_validate_period(self) -> "AssignmentHistoryQuery":
        if self.from_instant is not None:
            self.from_instant = _normalize_utc(self.from_instant)
        if self.to_instant is not None:
            self.to_instant = _normalize_utc(self.to_instant)
        if (
            self.from_instant is not None
            and self.to_instant is not None
            and self.from_instant >= self.to_instant
        ):
            raise ValueError("from must be before to")
        return self


def _normalize_utc(instant: datetime) -> datetime:
    if instant.tzinfo is None or instant.utcoffset() is None:
        raise ValueError("timestamps must include a timezone")
    return instant.astimezone(UTC)


class AssignmentHistoryPageOut(OutSchema):
    """One page of the congregation-wide assignment history."""

    items: list[AssignmentWithTerritoryOut]
    total: int
    page: int
    page_size: int
