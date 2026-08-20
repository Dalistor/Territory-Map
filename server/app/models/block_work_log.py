"""The `block_work_logs` table: the append-only record of a block being worked."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.block import Block


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
    # No foreign key, on purpose. The row has to outlive the publisher: the admin
    # can delete a person, and the record of who covered which block must still be
    # readable afterwards. A key pointing at `users` would either block that
    # deletion or leave the row unable to name anyone, so the name is copied into
    # the row at write time instead - see `user_name` below.
    #
    # What is left here is a plain id with no constraint behind it. While the
    # publisher exists it is still the reliable way to group work by person (and to
    # tell two namesakes apart); once they are deleted it is an orphan id that
    # points nowhere, which is harmless because the name is already stored.
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    # A photograph of the publisher's name at the moment the visit was recorded,
    # not a live view of it. Accepted consequence: renaming a publisher does not
    # rewrite the history - old rows keep the name the person had that day. That is
    # the price of denormalising, and it is exactly what lets the record survive the
    # deletion of the person. Same length as `User.name`, and NOT NULL for the same
    # reason `user_id` always was: a log with no author would be of no use.
    user_name: Mapped[str] = mapped_column(String(120), nullable=False)
    worked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    block: Mapped["Block"] = relationship(back_populates="work_logs")
    # There is deliberately no `user` relationship. With the foreign key gone the
    # database no longer guarantees that join, and it would resolve to None in
    # precisely the case this design exists to serve - a deleted publisher. Readers
    # build the author from `user_id` + `user_name`, which are always there.
