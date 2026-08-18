"""The `territory_assignments` table: the history of who was responsible for a territory."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, EntityMixin

if TYPE_CHECKING:
    from app.models.territory import Territory
    from app.models.user import User


class TerritoryAssignment(Base, EntityMixin):
    """One stretch of time in which a publisher was responsible for a territory.

    Assignment is stored as a log rather than only as `Territory.assigned_user_id`
    for the same reason work is (`BlockWorkLog`): the useful question in the field
    is historical - who had this territory, since when, and when did they hand it
    back - and a single overwritten column answers none of it. The paper S-13 card
    this replaces is literally a list of these rows.

    `Territory.assigned_user_id` survives as a projection of the open assignment,
    exactly as `Block.last_worked_at` projects the latest work log. The truth is
    here; that column is a read cache recomputed on every assign/complete/delete.

    `completed_at` being NULL is what makes an assignment *open*. At most one row
    per territory may be open at a time, and that is enforced by the database
    (see the partial unique index below), not only by the service.
    """

    __tablename__ = "territory_assignments"
    __table_args__ = (
        # The history is always read for one territory, newest first - that is the
        # panel the admin opens and the sheet the Excel export writes.
        Index(
            "ix_territory_assignments_territory_started",
            "territory_id",
            text("started_at DESC"),
        ),
        # The core invariant: a territory has at most one publisher responsible at a
        # time. A partial unique index says that in the schema, so a race between two
        # requests cannot produce two open assignments even if the service checks first.
        Index(
            "uq_territory_assignments_open",
            "territory_id",
            unique=True,
            postgresql_where=text("completed_at IS NULL"),
        ),
    )

    territory_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("territories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # RESTRICT, mirroring `block_work_logs.user_id`: the history names a person and
    # must not lose them silently. Revoking access is `User.is_active = False`,
    # never a row deletion.
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # NULL means the assignment is still open; a value turns the row into history.
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    territory: Mapped["Territory"] = relationship(back_populates="assignments")
    # One-sided on purpose, like `BlockWorkLog.user`: `User` deliberately has no
    # `assignments` collection, so that nothing invites cascading a user deletion
    # into the history.
    user: Mapped["User"] = relationship()
