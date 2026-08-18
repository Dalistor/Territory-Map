"""Business rules of the territory assignment: who is responsible, and for how long."""

# `list` is one of this service's methods, which shadows the builtin inside the class
# body. Postponing annotation evaluation keeps `list[TerritoryAssignment]` readable as
# a type instead of resolving to the method at class-creation time.
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from app.core.exceptions import NotFoundError
from app.models.territory import Territory
from app.models.territory_assignment import TerritoryAssignment
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
        """
        now = now if now is not None else self._now_provider()
        territory = self._territory_of_congregation(congregation_id, territory_id)
        self._refuse_stranger_publisher(congregation_id, user_id)
        open_assignment = self._assignments.get_open(territory.id)
        if open_assignment is not None:
            self._assignments.close(open_assignment, now)
        assignment = self._assignments.create(
            territory_id=territory.id,
            user_id=user_id,
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
        closed = self._assignments.close(open_assignment, now)
        self._territories.set_assigned_user(territory, None)
        return closed

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

    def _refuse_stranger_publisher(self, congregation_id: UUID, user_id: UUID) -> None:
        """Reject an id that does not name a publisher of this congregation.

        Deliberately the same `NotFoundError` the territory check raises, so the
        caller cannot learn which of the two ids was the bad one -- and therefore
        cannot use this endpoint to discover that a user id exists elsewhere.
        """
        user = self._users.get(user_id)
        if user is None or user.congregation_id != congregation_id:
            raise NotFoundError

    def _refresh_assigned_user(self, territory: Territory) -> None:
        """Rewrite the territory's read cache from the assignment that is open now.

        `Territory.assigned_user_id` is a projection, not the truth, exactly as
        `Block.last_worked_at` is for the work log -- so it is recomputed from what
        currently exists rather than set to whatever the last write happened to
        carry. That one rule is what makes deleting a record undo itself precisely:
        removing the open assignment frees the territory, and removing a completed
        one changes nothing, without either case being special-cased here.
        """
        open_assignment = self._assignments.get_open(territory.id)
        self._territories.set_assigned_user(
            territory,
            open_assignment.user_id if open_assignment is not None else None,
        )
