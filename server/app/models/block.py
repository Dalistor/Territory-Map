"""The `blocks` table: a numbered city block inside a territory."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, EntityMixin

if TYPE_CHECKING:
    from app.models.block_work_log import BlockWorkLog
    from app.models.territory import Territory


class Block(Base, EntityMixin):
    """The unit of field work: the numbered block a publisher actually covers.

    `last_worked_at` is a read cache derived from the most recent `BlockWorkLog`,
    never a source of truth. It is recomputed whenever a log is inserted or removed
    and must not be written directly from an endpoint - the log is what survives an
    offline sync, the column is only what makes the map fast to draw.

    `status_override` is the status the *admin* forced on this block, and both
    clients honour it above the date-based calculation when they pick a colour.
    NULL - the value of every block that already exists - means "derive the colour
    from the work logs, as always", which is exactly today's behaviour.

    The override lives alongside `last_worked_at` instead of replacing it: the work
    log stays the truth about *who was there and when*, and the override only says
    *how to paint* the block.
    """

    __tablename__ = "blocks"
    __table_args__ = (
        # Block numbers usually come from paper maps the congregation already uses,
        # so they are chosen by the admin; uniqueness is only required inside the
        # territory that owns them.
        UniqueConstraint("territory_id", "number", name="uq_blocks_territory_number"),
        # Only the two states the admin can force are spellable: "recent" is never
        # forced (it is what a fresh work log already produces), so the database
        # rejects anything but these two and NULL.
        CheckConstraint(
            "status_override IN ('overdue', 'never')",
            name="ck_blocks_status_override",
        ),
    )

    territory_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("territories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    polygon: Mapped[WKBElement] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True),
        nullable=False,
    )
    last_worked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    status_override: Mapped[str | None] = mapped_column(String(16), nullable=True)

    territory: Mapped["Territory"] = relationship(back_populates="blocks")
    work_logs: Mapped[list["BlockWorkLog"]] = relationship(
        back_populates="block",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
