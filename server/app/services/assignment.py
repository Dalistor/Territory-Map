"""Business rules of the territory assignment: who is responsible, and for how long."""

# `list` is one of this service's methods, which shadows the builtin inside the class
# body. Postponing annotation evaluation keeps `list[TerritoryAssignment]` readable as
# a type instead of resolving to the method at class-creation time.
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from app.core.exceptions import (
    CampaignAssignmentManagedError,
    InvalidAssignmentDatesError,
    NotFoundError,
    OpenAssignmentConflictError,
    TerritoryInCampaignError,
)
from app.models.campaign import Campaign
from app.models.territory import Territory
from app.models.territory_assignment import TerritoryAssignment
from app.models.user import User
from app.repositories.territory import TerritoryRepository
from app.repositories.territory_assignment import TerritoryAssignmentRepository
from app.repositories.user import UserRepository


class AssignmentService:
    """The lifecycle of a territory's designation: opened, closed, or erased.

    Responsibility is stored as a history of stretches of time
    (`TerritoryAssignment`), not as the single column it used to be, for the same
    reason work is stored as a log: the useful question is who had this territory
    and since when, and one overwritten column answers none of it. The paper S-13
    card this replaces is literally that list.

    `Territory.assigned_user_id` survives as a projection of the open assignment,
    and every method here leaves it consistent through `_refresh_assigned_user` or
    an explicit write. That is what keeps the app's rule
    (`WorkLogService._refuse_unassigned_territory`) working untouched: it still
    reads one column, while the truth behind it became a history.

    Every method is scoped to the congregation of the caller's token, and the two
    ways of failing that -- an id from another congregation, an id that names
    nothing -- raise the same `NotFoundError`.

    A row may also be a campaign's line (`campaign_designation_id`), written by
    `CampaignService`. This service reads those rows -- they are part of the card --
    but never writes them: designating over one, and editing, completing or deleting
    one from the card, are refused with a message pointing at the campaign, because
    the line only means anything together with the rest of the campaign.
    """

    def __init__(
        self,
        assignments: TerritoryAssignmentRepository,
        territories: TerritoryRepository,
        users: UserRepository,
        now_provider: Callable[[], datetime],
    ) -> None:
        self._assignments = assignments
        self._territories = territories
        self._users = users
        self._now_provider = now_provider

    def designate(
        self,
        congregation_id: UUID,
        territory_id: UUID,
        user_id: UUID,
        now: datetime | None = None,
    ) -> TerritoryAssignment:
        """Hand this territory to this publisher, from now on.

        An assignment already in force is closed at this same moment rather than
        refused. The paper S-13 card this replaces carries two dates per line, so
        "handed it back" and "completed it" are one event, and demanding an explicit
        completion first would cost the admin the single click they have today to
        change who is responsible.

        A campaign's line is the exception: the territory is in an active campaign, and
        handing it to one person would take it out of the campaign behind the admin's
        back. That is refused, naming the campaign.
        """
        now = now if now is not None else self._now_provider()
        territory = self._territory_of_congregation(congregation_id, territory_id)
        publisher = self._publisher_of_congregation(congregation_id, user_id)
        open_assignment = self._assignments.get_open(territory.id)
        if open_assignment is not None:
            if open_assignment.campaign_designation is not None:
                campaign = open_assignment.campaign_designation.campaign
                raise TerritoryInCampaignError(
                    f"O território “{territory.name}” está na campanha “{campaign.name}”, em "
                    "andamento. Conclua a campanha ou tire o território dela antes de designá-lo "
                    "a um publicador."
                )
            self._assignments.close(open_assignment, now)
        assignment = self._assignments.create(
            territory_id=territory.id,
            user_id=publisher.id,
            user_name=publisher.name,
            started_at=now,
        )
        self._territories.set_assigned_user(territory, user_id)
        return assignment

    def complete(
        self,
        congregation_id: UUID,
        territory_id: UUID,
        now: datetime | None = None,
    ) -> TerritoryAssignment:
        """Close the assignment in force, leaving the territory free for the next one.

        The publisher loses the right to mark blocks here the moment this returns,
        because `Territory.assigned_user_id` -- the projection the app's rule reads
        -- is cleared in the same call.
        """
        now = now if now is not None else self._now_provider()
        territory = self._territory_of_congregation(congregation_id, territory_id)
        open_assignment = self._assignments.get_open(territory.id)
        if open_assignment is None:
            raise NotFoundError
        self._refuse_campaign_line(open_assignment)
        closed = self._assignments.close(open_assignment, now)
        self._territories.set_assigned_user(territory, None)
        return closed

    def update(
        self,
        congregation_id: UUID,
        assignment_id: UUID,
        *,
        territory_id: UUID | None = None,
        user_id: UUID | None = None,
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
        clear_completed_at: bool = False,
    ) -> TerritoryAssignment:
        """Update an existing assignment, open or completed.

        Allows correcting who was responsible, or the start and completion dates.
        Reopening a closed stint (clear_completed_at=True) is permitted only if no other
        assignment is currently open for the territory.
        """
        assignment = self._assignments.get_in_congregation(congregation_id, assignment_id)
        if assignment is None:
            raise NotFoundError
        if territory_id is not None and assignment.territory_id != territory_id:
            raise NotFoundError
        self._refuse_campaign_line(assignment)

        if user_id is not None:
            publisher = self._publisher_of_congregation(congregation_id, user_id)
            assignment.user_id = publisher.id
            assignment.user_name = publisher.name

        if started_at is not None:
            assignment.started_at = started_at

        if clear_completed_at:
            if assignment.completed_at is not None:
                open_assignment = self._assignments.get_open(assignment.territory_id)
                if open_assignment is not None and open_assignment.id != assignment.id:
                    raise OpenAssignmentConflictError
                assignment.completed_at = None
        elif completed_at is not None:
            assignment.completed_at = completed_at

        if assignment.completed_at is not None and assignment.started_at > assignment.completed_at:
            raise InvalidAssignmentDatesError

        self._assignments.session.flush()
        self._refresh_assigned_user(assignment.territory)
        return assignment

    def delete(self, congregation_id: UUID, assignment_id: UUID) -> None:
        """Erase one record from the history, as if it had never been written.

        This is the admin undoing a designation that was a mistake, so the row
        really goes -- unlike `complete`, which turns it into a closed stretch of
        time the card is meant to keep. Whatever that does to
        `Territory.assigned_user_id` follows from the assignments that remain.
        """
        assignment = self._assignments.get_in_congregation(congregation_id, assignment_id)
        if assignment is None:
            raise NotFoundError
        self._refuse_campaign_line(assignment)
        territory = assignment.territory
        self._assignments.delete(assignment)
        self._refresh_assigned_user(territory)

    def list(self, congregation_id: UUID, territory_id: UUID) -> list[TerritoryAssignment]:
        """The whole history of a territory, most recent assignment first."""
        territory = self._territory_of_congregation(congregation_id, territory_id)
        return self._assignments.list_by_territory(territory.id)

    def list_all(self, congregation_id: UUID) -> list[TerritoryAssignment]:
        """The whole history of the congregation, most recent assignment first.

        This is what the admin's History page reads: every assignment at once,
        open and completed alike, instead of one territory at a time. There is no
        rule of its own to apply here -- the congregation scope, the only rule this
        listing has, is the repository's `WHERE`, so filtering again in Python
        would be a second place to get it wrong rather than a second barrier.
        """
        return self._assignments.list_by_congregation(congregation_id)

    def open_started_by_territory(self, congregation_id: UUID) -> dict[UUID, datetime]:
        """When the assignment in force started, for every territory that has one."""
        return {
            assignment.territory_id: assignment.started_at
            for assignment in self._assignments.list_open_by_congregation(congregation_id)
        }

    def open_campaign_by_territory(self, congregation_id: UUID) -> dict[UUID, Campaign]:
        """The active campaign holding each territory that is in one.

        Read off the open rows of the card, which is where an active campaign lives for
        a territory -- the same statement that tells since when each one is out.
        """
        return {
            assignment.territory_id: assignment.campaign_designation.campaign
            for assignment in self._assignments.list_open_by_congregation(congregation_id)
            if assignment.campaign_designation is not None
        }

    def list_page(
        self,
        congregation_id: UUID,
        *,
        publisher_id: UUID | None = None,
        territory_id: UUID | None = None,
        from_instant: datetime | None = None,
        to_instant: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[TerritoryAssignment], int]:
        """Orchestrate one congregation-scoped page of assignment history."""
        return self._assignments.list_page_by_congregation(
            congregation_id,
            publisher_id=publisher_id,
            territory_id=territory_id,
            from_instant=from_instant,
            to_instant=to_instant,
            limit=page_size,
            offset=(page - 1) * page_size,
        )

    def _territory_of_congregation(self, congregation_id: UUID, territory_id: UUID) -> Territory:
        """Return the territory, provided it belongs to this congregation.

        A territory of another congregation and one that does not exist raise the
        same `NotFoundError`, which the router answers with 404 rather than 403: a
        403 would confirm that the id names a real territory somewhere, and the
        congregation boundary is the only thing separating one tenant from another.
        """
        territory = self._territories.get(congregation_id, territory_id)
        if territory is None:
            raise NotFoundError
        return territory

    def _publisher_of_congregation(self, congregation_id: UUID, user_id: UUID) -> User:
        """Return the publisher, provided they belong to this congregation.

        This was a pure check until the S-13 line started carrying `user_name`. It
        now returns the person as well, because the name written into the row is
        the one they have at this moment -- and the validation had already loaded
        them, so naming the holder costs no extra query.

        Deliberately the same `NotFoundError` the territory check raises, so the
        caller cannot learn which of the two ids was the bad one -- and therefore
        cannot use this endpoint to discover that a user id exists elsewhere.
        """
        user = self._users.get(user_id)
        if user is None or user.congregation_id != congregation_id:
            raise NotFoundError
        return user

    def _refuse_campaign_line(self, assignment: TerritoryAssignment) -> None:
        """Refuse to touch, from the card, a line that belongs to a campaign."""
        if assignment.campaign_designation is not None:
            campaign = assignment.campaign_designation.campaign
            raise CampaignAssignmentManagedError(
                f"Esta linha do cartão pertence à campanha “{campaign.name}”. Para alterá-la, "
                "concluí-la ou removê-la, use a página Campanhas."
            )

    def _refresh_assigned_user(self, territory: Territory) -> None:
        """Rewrite the territory's read cache from the assignment that is open now.

        `Territory.assigned_user_id` is a projection, not the truth, exactly as
        `Block.last_worked_at` is for the work log -- so it is recomputed from what
        currently exists rather than set to whatever the last write happened to
        carry. That one rule is what makes deleting a record undo itself precisely:
        removing the open assignment frees the territory, and removing a completed
        one changes nothing, without either case being special-cased here.

        A campaign's open line projects to nobody: the territory is the campaign's, and
        the app reads the campaign's publishers from the line, not from this column.
        """
        open_assignment = self._assignments.get_open(territory.id)
        holder = (
            open_assignment.user_id
            if open_assignment is not None and open_assignment.campaign_designation_id is None
            else None
        )
        self._territories.set_assigned_user(territory, holder)
