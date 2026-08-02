"""Data access for `BlockWorkLog`, the append-only record of a block being worked."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.block_work_log import BlockWorkLog


class BlockWorkLogRepository:
    """Queries over the `block_work_logs` table.

    Nothing geometric here: the log answers *who* and *when*, never *where* beyond the
    block it points at. The design decision it carries is that work is a sequence of
    events rather than a column, which is what lets two publishers mark the same block
    offline and sync later without a conflict to resolve.
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, log_id: UUID) -> BlockWorkLog | None:
        """Fetch a log by id, or `None`.

        The id is minted by the mobile app, so this doubles as the idempotency check
        for a resend: a log that is already here must not be stored twice.
        """
        return self.session.get(BlockWorkLog, log_id)

    def create(
        self,
        log_id: UUID,
        block_id: UUID,
        user_id: UUID,
        worked_at: datetime,
    ) -> BlockWorkLog:
        """Insert a log with the id the client generated, and flush.

        `log_id` comes from outside on purpose -- it is what makes an offline resend
        recognisable. There is no server-side default to fall back on.
        """
        log = BlockWorkLog(
            id=log_id,
            block_id=block_id,
            user_id=user_id,
            worked_at=worked_at,
        )
        self.session.add(log)
        self.session.flush()
        return log

    def list_by_block(self, block_id: UUID) -> list[BlockWorkLog]:
        """The history of a block, most recent visit first.

        The order matches `ix_block_work_logs_block_id_worked_at`, so the index serves
        the read directly.
        """
        return list(
            self.session.scalars(
                select(BlockWorkLog)
                .where(BlockWorkLog.block_id == block_id)
                .order_by(BlockWorkLog.worked_at.desc())
            )
        )

    def delete(self, log: BlockWorkLog) -> None:
        """Remove one log. Recomputing `Block.last_worked_at` is the caller's job."""
        self.session.delete(log)
        self.session.flush()

    def latest_worked_at(self, block_id: UUID) -> datetime | None:
        """The most recent `worked_at` recorded for the block, or `None` if never worked.

        This is the source of truth behind `Block.last_worked_at`: the maximum of the
        events, computed in the database, rather than whatever the last write happened
        to leave in the column. Recomputing it from here is what makes a late arrival
        from an offline device harmless and a deleted log correctly undo itself.
        """
        return self.session.scalar(
            select(func.max(BlockWorkLog.worked_at)).where(BlockWorkLog.block_id == block_id)
        )
