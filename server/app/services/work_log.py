"""Business rules of the work log: who covered which block, and when."""

from collections.abc import Callable
from datetime import datetime, timedelta
from uuid import UUID, uuid4

from app.core.exceptions import (
    DomainError,
    InvalidWorkedAtError,
    NotFoundError,
    TerritoryNotAssignedError,
)
from app.models.block import Block
from app.models.block_work_log import BlockWorkLog
from app.models.user import User
from app.repositories.block import BlockRepository
from app.repositories.block_work_log import BlockWorkLogRepository
from app.repositories.user import UserRepository

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
        users: UserRepository,
        now_provider: Callable[[], datetime],
    ) -> None:
        self._work_logs = work_logs
        self._blocks = blocks
        self._users = users
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

        The order of the checks is deliberate. Ownership comes first, so a block of
        another congregation is never even acknowledged. The already-stored log comes
        next, so a retry is confirmed rather than judged again: the visit is already a
        fact, and re-running the designation or the clock rule against it could refuse
        what was accepted before, leaving the phone retrying a marking the server will
        never take. Only a genuinely new visit is measured against the designation and
        the clock.
        """
        now = now if now is not None else self._now_provider()
        block = self._block_of_congregation(user.congregation_id, block_id)

        stored = self._work_logs.get(log_id)
        if stored is not None:
            self._refuse_resend_for_another_block(stored, block_id)
            return stored, False

        self._refuse_unassigned_territory(block, user)
        self._refuse_implausible_moment(worked_at, now)
        log = self._work_logs.create(
            log_id=log_id,
            block_id=block_id,
            user_id=user.id,
            user_name=user.name,
            worked_at=worked_at,
        )
        self._refresh_last_worked_at(block)
        self._clear_status_override(block)
        return log, True

    def mark_worked_by_admin(
        self,
        congregation_id: UUID,
        block_id: UUID,
        user_id: UUID,
        worked_at: datetime,
        now: datetime | None = None,
    ) -> BlockWorkLog:
        """Record, on the admin's word, that a publisher worked a block.

        Same event as `mark_worked` and the same projection rule -- the log is written
        and `Block.last_worked_at` is recomputed from the logs, never assigned -- but
        the three rules that exist to defend against a phone are dropped here, because
        there is no phone:

        * **No designation check.** The app is confined to the territory designated to
          the publisher holding the token; the admin is the person who knows what
          happened in the field, and may record any publisher of their congregation on
          any block of it, including a territory nobody is designated to.
        * **No 90-day floor.** That floor catches a device whose clock is wrong. Here
          the date is typed on purpose, quite possibly to enter old work coming off the
          paper card, so an old date is the feature rather than the symptom.
        * **No idempotency by client id.** The admin has no offline queue to retry, so
          there is nothing to recognise: the `log_id` is minted here, and a second call
          is a second visit -- which is what working the block again actually is.

        What remains is what is not about the device: a `worked_at` in the future is
        refused, and both the block and the publisher must belong to the caller's
        congregation.
        """
        now = now if now is not None else self._now_provider()
        block = self._block_of_congregation(congregation_id, block_id)
        publisher = self._user_of_congregation(congregation_id, user_id)
        self._refuse_future_moment(worked_at, now)
        log = self._work_logs.create(
            log_id=uuid4(),
            block_id=block.id,
            user_id=publisher.id,
            user_name=publisher.name,
            worked_at=worked_at,
        )
        self._refresh_last_worked_at(block)
        self._clear_status_override(block)
        return log

    def list_by_block(self, congregation_id: UUID, block_id: UUID) -> list[BlockWorkLog]:
        """The visits recorded for one block, most recent first."""
        block = self._block_of_congregation(congregation_id, block_id)
        return self._work_logs.list_by_block(block.id)

    def list_worked_territories(self, user: User) -> list[tuple[UUID, str, datetime]]:
        """Every territory this publisher has worked in -- the app dashboard's list."""
        return self._work_logs.list_worked_territories(user.id)

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

    def _refuse_unassigned_territory(self, block: Block, user: User) -> None:
        """Reject a first-time marking outside the territory designated to this publisher.

        A territory has at most one publisher designated to it at a time, so this is a
        plain identity check. It only ever runs for a genuinely new visit -- a resend
        of an already-stored log returns before reaching here, on purpose: the visit
        was accepted under whatever designation held at the time, and a later change
        by the admin must not retroactively undo it.
        """
        if block.territory.assigned_user_id != user.id:
            raise TerritoryNotAssignedError

    def _user_of_congregation(self, congregation_id: UUID, user_id: UUID) -> User:
        """Return the publisher, provided they belong to this congregation.

        A publisher of another congregation and one that does not exist raise the same
        `NotFoundError`, for the same reason blocks do: telling the two apart would
        confirm that the id names a real person somewhere else. A deactivated publisher
        passes -- revoking the app token does not remove the person from the history
        the admin is writing.
        """
        user = self._users.get(user_id)
        if user is None or user.congregation_id != congregation_id:
            raise NotFoundError
        return user

    def _refuse_future_moment(self, worked_at: datetime, now: datetime) -> None:
        """Reject a visit dated after the present moment.

        Nothing has been worked tomorrow, whoever is reporting it, and a future date
        pins the block to the top of the "recently worked" list forever -- which is the
        number the admin reads to decide where the congregation goes next.
        """
        if worked_at > now:
            raise InvalidWorkedAtError

    def _refuse_implausible_moment(self, worked_at: datetime, now: datetime) -> None:
        """Reject a moment the device's clock cannot honestly have produced.

        Both ends are the same symptom -- a phone whose clock is wrong -- and both
        would poison `last_worked_at`: a date in the future pins a block to the top of
        the "recently worked" list forever, and one from months ago is far more likely
        to be a bad clock than a queue that survived a whole cycle offline. The floor
        is what the admin's own marking deliberately does without, since a date typed
        by hand carries no clock to distrust.
        """
        self._refuse_future_moment(worked_at, now)
        if worked_at < now - MAX_WORKED_AT_AGE:
            raise InvalidWorkedAtError

    def _clear_status_override(self, block: Block) -> None:
        """Drop the status the admin had forced, because work was just recorded.

        A visit that has just been written is the strongest evidence the system has
        about a block, stronger than a colour someone chose beforehand: keeping it
        painted "never worked" right above a history that says otherwise would be the
        interface contradicting itself. So both ways in -- the publisher's phone and
        the admin's own entry -- undo the override as they record.

        It sits next to `_refresh_last_worked_at` and is called in the same two
        places, deliberately *not* inside it: `delete` recomputes the projection too,
        and removing an entry must leave the override exactly as the admin set it.
        Deleting is the admin correcting the history, and guessing what that means for
        the colour would be worse than changing nothing. A resend never reaches here
        either -- it returns before anything is written, so it brings no new evidence.
        """
        self._blocks.set_status_override(block, None)

    def _refresh_last_worked_at(self, block: Block) -> None:
        """Rewrite the block's read cache from the logs that currently exist.

        `Block.last_worked_at` is a projection, not the truth, so it is recomputed as
        the maximum of the events rather than set to whatever the latest write carried.
        That single rule covers both directions: a marking that arrives late from a
        phone that was offline is stored without dragging the block backwards, and a
        log the admin removes correctly undoes itself.
        """
        self._blocks.set_last_worked_at(block, self._work_logs.latest_worked_at(block.id))
