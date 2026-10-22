"""Data access for `Campaign` and its designation periods."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.campaign import Campaign
from app.models.campaign_designation import CampaignDesignation, CampaignDesignationPublisher
from app.models.territory import Territory

#: A publisher as a campaign period stores them: the id, and the name copied at write time.
PublisherRef = tuple[UUID, str]


class CampaignRepository:
    """Queries over `campaigns`, `campaign_territories` and the campaign periods.

    Every read that starts from an id reached through a URL is filtered by the
    congregation in the same statement, for the reason `TerritoryRepository.get` gives:
    a campaign of another congregation must be indistinguishable from one that does not
    exist, and never loading it is the cheapest way to guarantee that.

    The lines a campaign writes on the territory cards are *not* handled here -- they
    are `TerritoryAssignment` rows and live in `TerritoryAssignmentRepository`, next to
    the individual designations they replace.
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, congregation_id: UUID, campaign_id: UUID) -> Campaign | None:
        """Fetch one campaign *of this congregation*, or `None`."""
        return self.session.scalars(
            select(Campaign).where(
                Campaign.congregation_id == congregation_id,
                Campaign.id == campaign_id,
            )
        ).one_or_none()

    def get_by_name(self, congregation_id: UUID, name: str) -> Campaign | None:
        """Fetch the campaign with this name inside the congregation, or `None`."""
        return self.session.scalars(
            select(Campaign).where(
                Campaign.congregation_id == congregation_id,
                Campaign.name == name,
            )
        ).one_or_none()

    def list_by_congregation(self, congregation_id: UUID) -> list[Campaign]:
        """Every campaign of the congregation, ordered by name, ready to be displayed.

        The territories and the periods with their publishers are loaded up front: the
        listing shows all of them for every campaign, and loading them lazily would cost
        three SELECTs per row.
        """
        return list(
            self.session.scalars(
                select(Campaign)
                .where(Campaign.congregation_id == congregation_id)
                .options(
                    selectinload(Campaign.territories),
                    selectinload(Campaign.designations).selectinload(
                        CampaignDesignation.publishers
                    ),
                )
                .order_by(Campaign.name)
            )
        )

    def create(
        self,
        congregation_id: UUID,
        name: str,
        territories: list[Territory],
    ) -> Campaign:
        """Insert a campaign grouping these territories, and flush.

        The territories are expired after the flush, as in `set_territories`, so the
        next read comes back in the relationship's order (by name) rather than in the
        order the client happened to send them.
        """
        campaign = Campaign(congregation_id=congregation_id, name=name, territories=territories)
        self.session.add(campaign)
        self.session.flush()
        self.session.expire(campaign, ["territories"])
        return campaign

    def rename(self, campaign: Campaign, name: str) -> Campaign:
        """Change the campaign's name, and flush."""
        campaign.name = name
        self.session.flush()
        return campaign

    def set_territories(self, campaign: Campaign, territories: list[Territory]) -> Campaign:
        """Replace the territories the campaign groups, and flush."""
        campaign.territories = territories
        self.session.flush()
        self.session.expire(campaign, ["territories"])
        return campaign

    def delete(self, campaign: Campaign) -> None:
        """Remove the campaign; the FK cascades take its periods and their card lines."""
        self.session.delete(campaign)
        self.session.flush()

    def get_open_designation(self, campaign_id: UUID) -> CampaignDesignation | None:
        """The period currently open for the campaign, or `None`.

        `uq_campaign_designations_open` guarantees at most one, so `one_or_none()`
        states the invariant rather than hoping for it.
        """
        return self.session.scalars(
            select(CampaignDesignation).where(
                CampaignDesignation.campaign_id == campaign_id,
                CampaignDesignation.completed_at.is_(None),
            )
        ).one_or_none()

    def open_designation(
        self,
        campaign: Campaign,
        started_at: datetime,
        publishers: list[PublisherRef],
    ) -> CampaignDesignation:
        """Open a period of the campaign handed to these publishers, and flush.

        The campaign's loaded list of periods is expired afterwards, so whoever reads it
        next in this request sees the new period in the right place (newest first)
        instead of appended at the end of a stale collection.
        """
        designation = CampaignDesignation(
            campaign_id=campaign.id,
            started_at=started_at,
            publishers=[
                CampaignDesignationPublisher(user_id=user_id, user_name=user_name)
                for user_id, user_name in publishers
            ],
        )
        self.session.add(designation)
        self.session.flush()
        self.session.expire(campaign, ["designations"])
        return designation

    def set_publishers(
        self,
        designation: CampaignDesignation,
        publishers: list[PublisherRef],
    ) -> CampaignDesignation:
        """Make these the publishers of the period, and flush.

        Applied as a difference rather than by swapping the whole list: a publisher who
        stays keeps the row -- and the name -- they were added with, and rewriting the
        collection would delete and re-insert the same primary key in one flush.
        """
        wanted = dict(publishers)
        for row in list(designation.publishers):
            if row.user_id not in wanted:
                designation.publishers.remove(row)
        present = {row.user_id for row in designation.publishers}
        for user_id, user_name in publishers:
            if user_id not in present:
                designation.publishers.append(
                    CampaignDesignationPublisher(user_id=user_id, user_name=user_name)
                )
        self.session.flush()
        return designation

    def close_designation(
        self,
        designation: CampaignDesignation,
        completed_at: datetime,
    ) -> CampaignDesignation:
        """Stamp the period's completion date, turning it into history, and flush."""
        designation.completed_at = completed_at
        self.session.flush()
        return designation

    def list_open_for_publisher(
        self,
        congregation_id: UUID,
        user_id: UUID,
    ) -> list[CampaignDesignation]:
        """The open periods, in this congregation, that include this publisher.

        Each comes with its campaign and the campaign's territories, which is everything
        the phone needs to list the campaign and open it on the map.
        """
        return list(
            self.session.scalars(
                select(CampaignDesignation)
                .join(Campaign, CampaignDesignation.campaign_id == Campaign.id)
                .join(
                    CampaignDesignationPublisher,
                    CampaignDesignationPublisher.campaign_designation_id == CampaignDesignation.id,
                )
                .where(
                    Campaign.congregation_id == congregation_id,
                    CampaignDesignation.completed_at.is_(None),
                    CampaignDesignationPublisher.user_id == user_id,
                )
                .options(
                    selectinload(CampaignDesignation.campaign).selectinload(Campaign.territories)
                )
                .order_by(Campaign.name)
            )
        )
