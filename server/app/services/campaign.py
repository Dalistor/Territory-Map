"""Business rules of campaigns: several territories handed to several publishers at once."""

# `list` is one of this service's methods, which shadows the builtin inside the class
# body -- same reason as in `app/services/assignment.py`.
from __future__ import annotations

from collections.abc import Callable, Iterable
from datetime import datetime
from uuid import UUID

from app.core.exceptions import (
    CampaignActiveError,
    CampaignWithoutPublishersError,
    DuplicateNameError,
    NotFoundError,
    TerritoryInCampaignError,
)
from app.models.campaign import Campaign
from app.models.campaign_designation import CampaignDesignation
from app.models.territory import Territory
from app.models.user import User
from app.repositories.campaign import CampaignRepository, PublisherRef
from app.repositories.territory import TerritoryRepository
from app.repositories.territory_assignment import TerritoryAssignmentRepository
from app.repositories.user import UserRepository

DUPLICATE_CAMPAIGN_NAME = "Já existe uma campanha com esse nome na congregação. Escolha outro nome."
DESIGNATED_ALREADY = (
    "Esta campanha já está designada. Para mudar quem trabalha nela, troque os "
    "publicadores do período em andamento, ou conclua a campanha antes de designá-la de novo."
)


class CampaignService:
    """The lifecycle of a campaign: grouped, designated, worked, completed.

    A campaign replaces the individual designation of its territories while it is out.
    That replacement is written where the individual one lives -- one open line per
    territory on the S-13 card, pointing at the campaign's period -- so the partial
    unique index of the card keeps a territory in at most one active campaign and away
    from any individual designation meanwhile, and `Territory.assigned_user_id` (the
    projection of the open individual row) is simply left empty.

    Every method is scoped to the caller's congregation, and an id from another
    congregation is the same `NotFoundError` as one that names nothing.
    """

    def __init__(
        self,
        campaigns: CampaignRepository,
        assignments: TerritoryAssignmentRepository,
        territories: TerritoryRepository,
        users: UserRepository,
        now_provider: Callable[[], datetime],
    ) -> None:
        self._campaigns = campaigns
        self._assignments = assignments
        self._territories = territories
        self._users = users
        self._now_provider = now_provider

    def list(self, congregation_id: UUID) -> list[Campaign]:
        """Every campaign of the congregation, active or not, ordered by name."""
        return self._campaigns.list_by_congregation(congregation_id)

    def get(self, congregation_id: UUID, campaign_id: UUID) -> Campaign:
        """One campaign of this congregation."""
        campaign = self._campaigns.get(congregation_id, campaign_id)
        if campaign is None:
            raise NotFoundError
        return campaign

    def create(self, congregation_id: UUID, name: str, territory_ids: list[UUID]) -> Campaign:
        """Group these territories under a new name. Nothing is designated yet."""
        self._refuse_taken_name(congregation_id, name)
        territories = self._territories_of_congregation(congregation_id, territory_ids)
        return self._campaigns.create(congregation_id, name, territories)

    def update(
        self,
        congregation_id: UUID,
        campaign_id: UUID,
        *,
        name: str | None = None,
        territory_ids: list[UUID] | None = None,
        now: datetime | None = None,
    ) -> Campaign:
        """Rename the campaign, regroup its territories, or both.

        On an active campaign a change of territories takes effect at once, because the
        app reads the card on the next marking: a territory added is handed to the
        campaign exactly as designating would hand it, and one removed has its line
        closed today, leaving it without a dirigente until the admin designates it.
        """
        now = now if now is not None else self._now_provider()
        campaign = self.get(congregation_id, campaign_id)
        if name is not None and name != campaign.name:
            self._refuse_taken_name(congregation_id, name)
            self._campaigns.rename(campaign, name)
        if territory_ids is not None:
            territories = self._territories_of_congregation(congregation_id, territory_ids)
            period = self._campaigns.get_open_designation(campaign.id)
            if period is not None:
                self._move_lines(campaign, period, territories, now)
            self._campaigns.set_territories(campaign, territories)
        return campaign

    def delete(self, congregation_id: UUID, campaign_id: UUID) -> None:
        """Remove a campaign that is not out, together with its past periods.

        An active one is refused rather than completed on the way: completing stamps a
        date on every card it holds, and inventing that date on the way to a deletion
        would write a fact nobody stated -- the same reasoning that refuses deleting a
        publisher who still holds a territory.
        """
        campaign = self.get(congregation_id, campaign_id)
        if self._campaigns.get_open_designation(campaign.id) is not None:
            raise CampaignActiveError
        self._campaigns.delete(campaign)

    def designate(
        self,
        congregation_id: UUID,
        campaign_id: UUID,
        user_ids: list[UUID],
        now: datetime | None = None,
    ) -> Campaign:
        """Open a period of the campaign for these publishers, starting now.

        Every territory of the campaign has its individual designation closed at this
        same moment -- the campaign replaces it, as handing a territory to a new
        dirigente does -- and gets a line of the campaign on its card instead. A
        territory held by *another* active campaign is refused before anything is
        written, naming both, because two campaigns cannot share a territory.
        """
        now = now if now is not None else self._now_provider()
        campaign = self.get(congregation_id, campaign_id)
        publishers = self._publishers_of_congregation(congregation_id, user_ids)
        if self._campaigns.get_open_designation(campaign.id) is not None:
            raise CampaignActiveError(DESIGNATED_ALREADY)
        self._refuse_territories_held_elsewhere(campaign.territories)
        period = self._campaigns.open_designation(campaign, now, publishers)
        for territory in campaign.territories:
            self._hand_to_campaign(territory, period, now)
        return campaign

    def set_publishers(
        self,
        congregation_id: UUID,
        campaign_id: UUID,
        user_ids: list[UUID],
    ) -> Campaign:
        """Make these the publishers of the open period, from the next marking on."""
        campaign = self.get(congregation_id, campaign_id)
        publishers = self._publishers_of_congregation(congregation_id, user_ids)
        period = self._open_period(campaign)
        self._campaigns.set_publishers(period, publishers)
        return campaign

    def complete(
        self,
        congregation_id: UUID,
        campaign_id: UUID,
        now: datetime | None = None,
    ) -> Campaign:
        """Close the open period and every line it holds on the cards, with one date.

        The publishers lose the right to mark blocks in the campaign's territories the
        moment this returns: the marking rule reads the open line, and there is none
        left. The territories stay without a dirigente -- their projection was already
        empty while the campaign held them.
        """
        now = now if now is not None else self._now_provider()
        campaign = self.get(congregation_id, campaign_id)
        period = self._open_period(campaign)
        for line in self._assignments.list_open_by_campaign_designation(period.id):
            self._assignments.close(line, now)
        self._campaigns.close_designation(period, now)
        return campaign

    def active_for_publisher(self, user: User) -> list[CampaignDesignation]:
        """The open periods this publisher is in -- the phone's Campaigns tab."""
        return self._campaigns.list_open_for_publisher(user.congregation_id, user.id)

    def _open_period(self, campaign: Campaign) -> CampaignDesignation:
        """The campaign's open period; a campaign that is not out has none to address."""
        period = self._campaigns.get_open_designation(campaign.id)
        if period is None:
            raise NotFoundError
        return period

    def _move_lines(
        self,
        campaign: Campaign,
        period: CampaignDesignation,
        territories: list[Territory],
        now: datetime,
    ) -> None:
        """Apply a change of territories to the cards of an active campaign."""
        kept = {territory.id for territory in territories}
        before = {territory.id for territory in campaign.territories}
        added = [territory for territory in territories if territory.id not in before]
        self._refuse_territories_held_elsewhere(added)
        for territory in campaign.territories:
            if territory.id not in kept:
                line = self._assignments.get_open(territory.id)
                if line is not None and line.campaign_designation_id == period.id:
                    self._assignments.close(line, now)
        for territory in added:
            self._hand_to_campaign(territory, period, now)

    def _hand_to_campaign(
        self,
        territory: Territory,
        period: CampaignDesignation,
        now: datetime,
    ) -> None:
        """Close the territory's individual designation, if any, and open the campaign's."""
        open_assignment = self._assignments.get_open(territory.id)
        if open_assignment is not None:
            self._assignments.close(open_assignment, now)
        self._assignments.create_campaign_line(territory.id, period.id, now)
        self._territories.set_assigned_user(territory, None)

    def _refuse_territories_held_elsewhere(self, territories: Iterable[Territory]) -> None:
        """Refuse when any of these territories has an open line of another campaign.

        Only ever asked about territories that are joining this campaign, so any
        campaign line found is another campaign's. Checked for all of them before
        anything is written, so a refusal names the first conflict and leaves every
        card exactly as it was.
        """
        for territory in territories:
            line = self._assignments.get_open(territory.id)
            if line is None or line.campaign_designation is None:
                continue
            other = line.campaign_designation.campaign
            raise TerritoryInCampaignError(
                f"O território “{territory.name}” já está na campanha “{other.name}”, que "
                "está em andamento. Conclua essa campanha ou tire o território dela antes."
            )

    def _refuse_taken_name(self, congregation_id: UUID, name: str) -> None:
        if self._campaigns.get_by_name(congregation_id, name) is not None:
            raise DuplicateNameError(DUPLICATE_CAMPAIGN_NAME)

    def _territories_of_congregation(
        self,
        congregation_id: UUID,
        territory_ids: list[UUID],
    ) -> list[Territory]:
        """Each territory once, all of them of this congregation -- or `NotFoundError`."""
        territories = []
        for territory_id in dict.fromkeys(territory_ids):
            territory = self._territories.get(congregation_id, territory_id)
            if territory is None:
                raise NotFoundError
            territories.append(territory)
        return territories

    def _publishers_of_congregation(
        self,
        congregation_id: UUID,
        user_ids: list[UUID],
    ) -> list[PublisherRef]:
        """Each publisher once, with the name to copy into the period.

        At least one is required: a period nobody is in would take the territories from
        their dirigentes and give them to no one. A deactivated publisher passes, as in
        an individual designation -- deactivation revokes the app, not responsibility.
        """
        if not user_ids:
            raise CampaignWithoutPublishersError
        publishers = []
        for user_id in dict.fromkeys(user_ids):
            user = self._users.get(user_id)
            if user is None or user.congregation_id != congregation_id:
                raise NotFoundError
            publishers.append((user.id, user.name))
        return publishers
