"""Data access for `TerritoryAssignment`, the history of who was responsible for a territory."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.territory import Territory
from app.models.territory_assignment import TerritoryAssignment


class TerritoryAssignmentRepository:
    """Queries over the `territory_assignments` table.

    Nothing geometric here either: an assignment answers *who* and *for how long*,
    never *where*. The design decision it carries is that responsibility is a
    sequence of stretches of time rather than a single column -- the same choice
    already made for work logs -- which is what lets the admin panel and the Excel
    export read a territory's past instead of only its present.

    The publisher is *not* joined in: there is no relationship to join any more,
    because the foreign key to `users` is gone. Each row carries `user_id` and
    `user_name` of its own, so a reader names the author without a second table --
    which is the whole point, since that author may since have been deleted. The
    one eager load left is `territory`, in `list_by_congregation`, where every row
    is displayed as "publisher -- territory".
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    def create(
        self,
        territory_id: UUID,
        user_id: UUID,
        user_name: str,
        started_at: datetime,
    ) -> TerritoryAssignment:
        """Open an assignment for this publisher, and flush.

        `started_at` comes from outside because it is the date the admin typed on
        the card, which is not necessarily today -- the clock is read by the router
        or the job, never here.

        `user_name` is stored alongside `user_id` rather than looked up on read: the
        line has to keep naming its holder after the publisher is deleted, and the
        caller already holds the person, so the name is copied in here at write time.

        The flush is what surfaces a second open assignment for the same territory
        as an integrity error from `uq_territory_assignments_open`, inside the
        caller's transaction, rather than at commit time far from the cause.
        """
        assignment = TerritoryAssignment(
            territory_id=territory_id,
            user_id=user_id,
            user_name=user_name,
            started_at=started_at,
        )
        self.session.add(assignment)
        self.session.flush()
        return assignment

    def get_open(self, territory_id: UUID) -> TerritoryAssignment | None:
        """The assignment currently in force for the territory, or `None`.

        Open means `completed_at IS NULL`, and the partial unique index guarantees
        there is at most one such row -- so `one_or_none()` is a statement of the
        invariant, not optimism: more than one row here is a bug worth raising.
        """
        return self.session.scalars(
            select(TerritoryAssignment).where(
                TerritoryAssignment.territory_id == territory_id,
                TerritoryAssignment.completed_at.is_(None),
            )
        ).one_or_none()

    def has_open_for_user(self, user_id: UUID) -> bool:
        """Whether this publisher is currently responsible for any territory.

        Asked before deleting the person, and answered in SQL rather than by
        loading their history: the caller needs a yes or a no, and the rows behind
        it are of no use to anybody. `user_id` carries no foreign key any more, so
        this is a plain column filter -- which is also why it is safe after a
        deletion: an orphan id simply matches nothing.
        """
        return (
            self.session.scalars(
                select(TerritoryAssignment.id).where(
                    TerritoryAssignment.user_id == user_id,
                    TerritoryAssignment.completed_at.is_(None),
                )
            ).first()
            is not None
        )

    def list_by_territory(self, territory_id: UUID) -> list[TerritoryAssignment]:
        """The whole history of a territory, most recent assignment first.

        The order matches `ix_territory_assignments_territory_started`, so the index
        serves the read directly, and it is the order the admin panel and the S-13
        style sheet display: the open assignment on top, the past below it.
        """
        return list(
            self.session.scalars(
                select(TerritoryAssignment)
                .where(TerritoryAssignment.territory_id == territory_id)
                .order_by(TerritoryAssignment.started_at.desc())
            )
        )

    def list_by_congregation(self, congregation_id: UUID) -> list[TerritoryAssignment]:
        """The whole history of the congregation, most recent assignment first.

        This is the general listing behind the admin's History page, which shows
        every assignment at once instead of one territory at a time. The join on
        `Territory` is the scope: same reasoning as `get_in_congregation` -- the
        congregation of the token filters the rows in the statement itself, so data
        from another congregation is never loaded to begin with.

        The order is the same as `list_by_territory` (newest first), because the
        page groups the rows client-side and each group must keep that order.

        Both `user` and `territory` are eager-loaded here, not just `user` as in the
        reads above: every row of this listing is displayed as "publisher --
        territory", so lazy loading either one would cost a SELECT per record.
        """
        return list(
            self.session.scalars(
                select(TerritoryAssignment)
                .join(Territory, TerritoryAssignment.territory_id == Territory.id)
                .options(joinedload(TerritoryAssignment.territory))
                .where(Territory.congregation_id == congregation_id)
                .order_by(TerritoryAssignment.started_at.desc())
            )
        )

    def get_in_congregation(
        self,
        congregation_id: UUID,
        assignment_id: UUID,
    ) -> TerritoryAssignment | None:
        """Fetch an assignment only if its territory belongs to this congregation.

        Same reasoning as `BlockRepository.get_in_congregation`: an assignment
        reached from a URL is filtered by the congregation of the token in the same
        statement, so one belonging to another congregation is indistinguishable
        from one that does not exist. Never loading the row is the cheapest way to
        guarantee that -- a check made after loading is a check that can be
        forgotten by the next caller.
        """
        return self.session.scalars(
            select(TerritoryAssignment)
            .join(Territory, TerritoryAssignment.territory_id == Territory.id)
            .where(
                TerritoryAssignment.id == assignment_id,
                Territory.congregation_id == congregation_id,
            )
        ).one_or_none()

    def close(
        self,
        assignment: TerritoryAssignment,
        completed_at: datetime,
    ) -> TerritoryAssignment:
        """Stamp the completion date, turning the row into history, and flush.

        Closing is what frees the territory for the next publisher: with
        `completed_at` set, the partial unique index no longer counts this row, so a
        new open assignment may be created. Recomputing
        `Territory.assigned_user_id` is the caller's job.
        """
        assignment.completed_at = completed_at
        self.session.flush()
        return assignment

    def delete(self, assignment: TerritoryAssignment) -> None:
        """Remove one assignment from the history.

        This is the admin correcting a record that should not have existed, so the
        row really goes -- there is no soft delete to reason about later.
        Recomputing `Territory.assigned_user_id` is the caller's job, exactly as it
        is when a work log is deleted.
        """
        self.session.delete(assignment)
        self.session.flush()
