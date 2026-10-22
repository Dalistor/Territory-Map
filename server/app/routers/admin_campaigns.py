"""Admin routes for campaigns: group territories, designate them, complete them.

Every route is behind `current_congregation`, so the campaign, its territories and its
publishers can only ever be the caller's own -- an id from another congregation comes
back 404 exactly like one that names nothing.

The designation of a campaign is addressed as a sub-resource: `POST .../designations`
opens a period, and the period that is open is always `designations/current`, because
there is at most one and the admin never needs its id to reach it. Every write answers
with the whole campaign, so the screen redraws from the reply instead of reading again.

No rule lives here. What designating does to each territory's card, and which conflicts
refuse it, is `CampaignService`'s business; this module resolves the session, names the
clock and turns models into DTOs.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.models.campaign import Campaign
from app.models.campaign_designation import CampaignDesignation
from app.repositories.campaign import CampaignRepository
from app.repositories.territory import TerritoryRepository
from app.repositories.territory_assignment import TerritoryAssignmentRepository
from app.repositories.user import UserRepository
from app.routers.admin_territories import AdminCongregation
from app.routers.auth import utc_now
from app.schemas.campaign import (
    CampaignCreateIn,
    CampaignDesignationOut,
    CampaignOut,
    CampaignPatchIn,
    CampaignPublishersIn,
    CampaignTerritoryOut,
)
from app.schemas.user import UserBriefOut
from app.services.campaign import CampaignService

router = APIRouter(prefix="/admin/campaigns", tags=["admin: campaigns"])

DbSession = Annotated[Session, Depends(get_session)]


def get_campaign_service(session: DbSession) -> CampaignService:
    """Build the campaign service on the request's session and the real clock."""
    return CampaignService(
        campaigns=CampaignRepository(session),
        assignments=TerritoryAssignmentRepository(session),
        territories=TerritoryRepository(session),
        users=UserRepository(session),
        now_provider=utc_now,
    )


Campaigns = Annotated[CampaignService, Depends(get_campaign_service)]


def designation_out(designation: CampaignDesignation) -> CampaignDesignationOut:
    """One period, with its publishers named from the names copied into it."""
    return CampaignDesignationOut(
        id=designation.id,
        started_at=designation.started_at,
        completed_at=designation.completed_at,
        publishers=[
            UserBriefOut(id=publisher.user_id, name=publisher.user_name)
            for publisher in designation.publishers
        ],
    )


def campaign_out(campaign: Campaign) -> CampaignOut:
    """A campaign with its territories, its open period and its whole history."""
    designations = [designation_out(designation) for designation in campaign.designations]
    return CampaignOut(
        id=campaign.id,
        name=campaign.name,
        created_at=campaign.created_at,
        territories=[
            CampaignTerritoryOut(id=territory.id, name=territory.name)
            for territory in campaign.territories
        ],
        current_designation=next(
            (designation for designation in designations if designation.completed_at is None),
            None,
        ),
        designations=designations,
    )


@router.get("")
def list_campaigns(congregation: AdminCongregation, campaigns: Campaigns) -> list[CampaignOut]:
    """Every campaign of the congregation, active or not, ordered by name."""
    return [campaign_out(campaign) for campaign in campaigns.list(congregation.id)]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_campaign(
    payload: CampaignCreateIn,
    congregation: AdminCongregation,
    campaigns: Campaigns,
) -> CampaignOut:
    """Group territories under a new name. Nobody is designated yet."""
    return campaign_out(campaigns.create(congregation.id, payload.name, payload.territory_ids))


@router.get("/{campaign_id}")
def get_campaign(
    campaign_id: UUID, congregation: AdminCongregation, campaigns: Campaigns
) -> CampaignOut:
    """One campaign, with every period it was out and who worked each one."""
    return campaign_out(campaigns.get(congregation.id, campaign_id))


@router.patch("/{campaign_id}")
def patch_campaign(
    campaign_id: UUID,
    payload: CampaignPatchIn,
    congregation: AdminCongregation,
    campaigns: Campaigns,
) -> CampaignOut:
    """Rename the campaign, replace its territories, or both.

    On an active campaign the new territories are handed over at once and the removed
    ones have their line closed today -- the reply shows the result.
    """
    campaign = campaigns.update(
        congregation.id,
        campaign_id,
        name=payload.name,
        territory_ids=payload.territory_ids,
    )
    return campaign_out(campaign)


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(
    campaign_id: UUID, congregation: AdminCongregation, campaigns: Campaigns
) -> Response:
    """Remove a campaign that is not out. An active one answers 409 `campaign_active`."""
    campaigns.delete(congregation.id, campaign_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{campaign_id}/designations", status_code=status.HTTP_201_CREATED)
def designate_campaign(
    campaign_id: UUID,
    payload: CampaignPublishersIn,
    congregation: AdminCongregation,
    campaigns: Campaigns,
) -> CampaignOut:
    """Open a period for these publishers, replacing the dirigente of every territory.

    201 because a period is added to the campaign's history, and a line to the card of
    each of its territories.
    """
    return campaign_out(campaigns.designate(congregation.id, campaign_id, payload.user_ids))


@router.put("/{campaign_id}/designations/current/publishers")
def replace_campaign_publishers(
    campaign_id: UUID,
    payload: CampaignPublishersIn,
    congregation: AdminCongregation,
    campaigns: Campaigns,
) -> CampaignOut:
    """Make these the publishers of the open period. 404 when the campaign is not out."""
    return campaign_out(campaigns.set_publishers(congregation.id, campaign_id, payload.user_ids))


@router.post("/{campaign_id}/designations/current/complete")
def complete_campaign(
    campaign_id: UUID,
    congregation: AdminCongregation,
    campaigns: Campaigns,
) -> CampaignOut:
    """Close the open period and every line it holds. 404 when the campaign is not out."""
    return campaign_out(campaigns.complete(congregation.id, campaign_id))
