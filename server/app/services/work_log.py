"""Business rules of the work log: who covered which block, and when."""

from collections.abc import Callable
from datetime import datetime, timedelta
from uuid import UUID

from app.core.exceptions import DomainError, InvalidWorkedAtError, NotFoundError
from app.models.block import Block
from app.models.block_work_log import BlockWorkLog
from app.models.user import User
from app.repositories.block import BlockRepository
from app.repositories.block_work_log import BlockWorkLogRepository

#: How far back a reported `worked_at` may reach. Long enough to absorb any real
#: offline queue -- a publisher out of signal for a whole territory cycle -- and short
#: enough that a device whose clock is plainly wrong is caught instead of recorded.
MAX_WORKED_AT_AGE = timedelta(days=90)


class WorkLogService:
    """Recording, reading and correcting the history of a block being worked.

    Marking a block is the one write the mobile app is allowed to make, and it is made
    under the worst conditions in the system: from a phone with no signal, whose queue
    is flushed later, possibly more than once, with a clock nobody controls. The three
    rules here all answer that. The `log_id` comes from the phone, so a resend is
    recognised instead of duplicated. `worked_at` is measured against an injected
    clock, so a device that is plainly wrong cannot poison the map. And
    `Block.last_worked_at` is always recomputed from the logs rather than assigned,
    so events that arrive out of order simply settle into place.

    Deleting is the admin's alone -- the app never unmarks -- and it goes through the
    same recomputation, which is what makes a removed entry undo itself exactly.
    """

    def __init__(
        self,
        work_logs: BlockWorkLogRepository,
        blocks: BlockRepository,
        now_provider: Callable[[], datetime],
    ) -> None:
        self._work_logs = work_logs
        self._blocks = blocks
        self._now_provider = now_provider

    def mark_worked(
        self,
        log_id: UUID,
        block_id: UUID,
        user: User,
        worked_at: datetime,
        now: datetime | None = None,
    ) -> tuple[BlockWorkLog, bool]:
        """Record that this publisher finished this block at `worked_at`.

        Returns the log together with whether it was created now -- the router answers
        201 for a new visit and 200 for a resend the server had already stored.

        The order of the three checks is deliberate. Ownership comes first, so a block
        of another congregation is never even acknowledged. The already-stored log
        comes next, so a retry is confirmed rather than judged again: the visit is
        already a fact, and re-running the clock rule against it could refuse what was
        accepted before, leaving the phone retrying a marking the server will never
        take. Only a genuinely new visit is measured against the clock.
        """
        now = now if now is not None else self._now_provider()
        block = self._block_of_congregation(user.congregation_id, block_id)

        stored = self._work_logs.get(log_id)
        if stored is not None:
            self._refuse_resend_for_another_block(stored, block_id)
            return stored, False

        self._refuse_implausible_moment(worked_at, now)
        log = self._work_logs.create(
            log_id=log_id,
            block_id=block_id,
            user_id=user.id,
            worked_at=worked_at,
        )
        self._refresh_last_worked_at(block)
        return log, True

    def list_by_block(self, congregation_id: UUID, block_id: UUID) -> list[BlockWorkLog]:
        """The visits recorded for one block, most recent first."""
        block = self._block_of_congregation(congregation_id, block_id)
        return self._work_logs.list_by_block(block.id)

    def delete(self, congregation_id: UUID, log_id: UUID) -> None:
        """Remove one recorded visit, on the admin's word.

        The app can only add: correcting the history is the admin's job, and the only
        way an entry ever leaves. Whatever the removal does to `last_worked_at` follows
        from the logs that remain -- there is nothing to undo by hand.
        """
        log = self._work_logs.get(log_id)
        if log is None:
            raise NotFoundError
        block = self._block_of_congregation(congregation_id, log.block_id)
        self._work_logs.delete(log)
        self._refresh_last_worked_at(block)

    def _block_of_congregation(self, congregation_id: UUID, block_id: UUID) -> Block:
        """Return the block, provided it belongs to this congregation.

        A block of another congregation and a block that does not exist raise the same
        `NotFoundError`, which the router answers with 404 rather than 403: a 403 would
        confirm that the id names a real block somewhere, and the congregation boundary
        is the only thing separating one tenant's map from another's.
        """
        block = self._blocks.get_in_congregation(congregation_id, block_id)
        if block is None:
            raise NotFoundError
        return block

    def _refuse_resend_for_another_block(self, stored: BlockWorkLog, block_id: UUID) -> None:
        """Reject a `log_id` already spent on a block other than the one requested.

        The id is minted on the phone, so a clash with an existing log of a different
        block is either a broken client or someone probing ids. Treating it as a resend
        would hand back a visit -- its block, its publisher, its moment -- that the
        request never named, and the caller has only been cleared for the block they
        asked about.
        """
        if stored.block_id != block_id:
            raise DomainError(
                "Esta marcação já foi registrada para outra quadra. "
                "Reinstale ou atualize o aplicativo e marque a quadra de novo."
            )

    def _refuse_implausible_moment(self, worked_at: datetime, now: datetime) -> None:
        """Reject a moment the device's clock cannot honestly have produced.

        Both ends are the same symptom -- a phone whose clock is wrong -- and both
        would poison `last_worked_at`, which is the number the admin reads to decide
        where the congregation goes next: a date in the future pins a block to the top
        of the "recently worked" list forever, and one from months ago is far more
        likely to be a bad clock than a queue that survived a whole cycle offline.
        """
        if worked_at > now or worked_at < now - MAX_WORKED_AT_AGE:
            raise InvalidWorkedAtError

    def _refresh_last_worked_at(self, block: Block) -> None:
        """Rewrite the block's read cache from the logs that currently exist.

        `Block.last_worked_at` is a projection, not the truth, so it is recomputed as
        the maximum of the events rather than set to whatever the latest write carried.
        That single rule covers both directions: a marking that arrives late from a
        phone that was offline is stored without dragging the block backwards, and a
        log the admin removes correctly undoes itself.
        """
        self._blocks.set_last_worked_at(block, self._work_logs.latest_worked_at(block.id))
