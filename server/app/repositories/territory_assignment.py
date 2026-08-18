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

    Reads that feed `AssignmentOut` pull the publisher in the same statement with
    `joinedload`. There is no eager-loading precedent elsewhere in this layer, so
    the choice is stated here: the relationship is many-to-one and always needed
    (the DTO carries the publisher's name), and a join keeps it to one round trip
    instead of one extra SELECT per row of the history.
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    def create(
        self,
        territory_id: UUID,
        user_id: UUID,
        started_at: datetime,
    ) -> TerritoryAssignment:
        """Open an assignment for this publisher, and flush.

        `started_at` comes from outside because it is the date the admin typed on
        the card, which is not necessarily today -- the clock is read by the router
        or the job, never here.

        The flush is what surfaces a second open assignment for the same territory
        as an integrity error from `uq_territory_assignments_open`, inside the
        caller's transaction, rather than at commit time far from the cause.
        """
        assignment = TerritoryAssignment(
            territory_id=territory_id,
            user_id=user_id,
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
            select(TerritoryAssignment)
            .options(joinedload(TerritoryAssignment.user))
            .where(
                TerritoryAssignment.territory_id == territory_id,
                TerritoryAssignment.completed_at.is_(None),
            )
        ).one_or_none()

    def list_by_territory(self, territory_id: UUID) -> list[TerritoryAssignment]:
        """The whole history of a territory, most recent assignment first.

        The order matches `ix_territory_assignments_territory_started`, so the index
        serves the read directly, and it is the order the admin panel and the S-13
        style sheet display: the open assignment on top, the past below it.
        """
        return list(
            self.session.scalars(
                select(TerritoryAssignment)
                .options(joinedload(TerritoryAssignment.user))
                .where(TerritoryAssignment.territory_id == territory_id)
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
            .options(joinedload(TerritoryAssignment.user))
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
