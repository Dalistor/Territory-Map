"""DTOs of the campaign -- territories grouped and handed to several publishers at once.

The campaign's id and name also travel inside other resources (`CampaignBriefOut` on a
card row and on a territory), which is why this module imports nothing from the
territory or assignment schemas: those import it.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import OutSchema, ShortText
from app.schemas.user import UserBriefOut


class CampaignCreateIn(BaseModel):
    """A new campaign: its name and the territories it groups.

    No congregation here -- it comes from the admin's token -- and no publishers: a
    campaign is created first and designated afterwards, which is the moment the
    territories change hands.
    """

    name: ShortText
    territory_ids: list[UUID] = Field(min_length=1)


class CampaignPatchIn(BaseModel):
    """A partial edit. A field left out is untouched; a list of territories replaces the old.

    On an active campaign, replacing the territories takes effect at once (see
    `CampaignService.update`). A body with neither field is refused with 422, as in
    `UserPatchIn`: accepting it would hide a client bug behind a 200.
    """

    name: ShortText | None = None
    territory_ids: list[UUID] | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def require_something_to_change(self) -> "CampaignPatchIn":
        if self.name is None and self.territory_ids is None:
            raise ValueError("Informe ao menos um campo para alterar.")
        return self


class CampaignPublishersIn(BaseModel):
    """The publishers of a period: who to designate the campaign to, or who works it now."""

    user_ids: list[UUID] = Field(min_length=1)


class CampaignBriefOut(OutSchema):
    """Just enough of a campaign to name it where a dirigente would otherwise be named."""

    id: UUID
    name: str


class CampaignTerritoryOut(OutSchema):
    """A territory as the campaign lists it: which one, by name."""

    id: UUID
    name: str


class CampaignDesignationOut(OutSchema):
    """One period of the campaign: since when, until when, and who works it.

    `completed_at` null means the period is open -- the campaign is active, and these
    publishers may mark blocks in every territory of it.
    """

    id: UUID
    started_at: datetime
    completed_at: datetime | None = None
    publishers: list[UserBriefOut]


class CampaignOut(OutSchema):
    """A campaign as the admin reads it, with its territories and its whole history.

    `current_designation` is the open period, or null when the campaign is not out; it
    is also the first item of `designations` (newest first), repeated here so a client
    does not have to search for it.
    """

    id: UUID
    name: str
    created_at: datetime
    territories: list[CampaignTerritoryOut]
    current_designation: CampaignDesignationOut | None = None
    designations: list[CampaignDesignationOut]


class AppCampaignOut(OutSchema):
    """An active campaign the publisher is in, as the phone's Campaigns tab lists it.

    `territory_ids` refer to the territories of `GET /app/territories`, which the phone
    already caches with their blocks -- so opening the campaign on the map needs no
    second copy of any outline.
    """

    id: UUID
    name: str
    started_at: datetime
    territory_ids: list[UUID]
