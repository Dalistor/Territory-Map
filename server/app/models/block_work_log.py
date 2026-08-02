"""The `block_work_logs` table: the append-only record of a block being worked."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.block import Block
    from app.models.user import User


class BlockWorkLog(Base, TimestampMixin):
    """One event: this person finished this block at this moment.

    Work is stored as a log rather than as a column on `Block` because publishers
    mark blocks offline: two of them can cover the same block with no signal and
    sync afterwards. As events, both records simply coexist and `last_worked_at`
    is the maximum between them - there is no conflict to resolve.

    `worked_at` is when the block was actually finished (clock of the device);
    `created_at` is when the record reached the server. They differ by however long
    the phone stayed offline.
    """

    __tablename__ = "block_work_logs"
    __table_args__ = (
        # Serves both hot reads: the latest log of a block (recomputing
        # `Block.last_worked_at`) and the block history the admin browses.
        Index("ix_block_work_logs_block_id_worked_at", "block_id", text("worked_at DESC")),
    )

    # No default here, on purpose: the id is minted by the mobile app when the
    # marking is queued offline and travels with the request. That is what makes a
    # resend idempotent - the server recognises a log it already stored instead of
    # duplicating the visit.
    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)

    block_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("blocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    # RESTRICT, unlike every other FK in the schema: the history of who worked where
    # must not disappear with the person. Revoking access is `User.is_active = False`,
    # never a row deletion.
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    worked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    block: Mapped["Block"] = relationship(back_populates="work_logs")
    # One-sided on purpose: `User` deliberately has no `work_logs` collection, so
    # that nothing invites cascading a user deletion into the history.
    user: Mapped["User"] = relationship()
