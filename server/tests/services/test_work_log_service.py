"""Behaviour of the work log: append-only, idempotent, and `last_worked_at` derived.

These tests run against in-memory repositories rather than PostGIS. Nothing in this
service is geometric -- a block is only an identity here, never an outline -- so the
database would contribute set-up cost and no confidence. What it *does* contribute
elsewhere (`ST_Within` at the border, `ST_Touches` on a shared edge) is exercised by
the territory and block suites, which is where those predicates are actually the rule.

The two fakes carry the same interface as the real repositories, including the parts
the service leans on: the history comes back most recent first, and `latest_worked_at`
is the maximum of the events rather than the last one written.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from app.core.exceptions import (
    DomainError,
    InvalidWorkedAtError,
    NotFoundError,
    TerritoryNotAssignedError,
)
from app.models.block import Block
from app.models.block_work_log import BlockWorkLog
from app.models.territory import Territory
from app.models.user import User
from app.services.work_log import MAX_WORKED_AT_AGE, WorkLogService

NOW = datetime(2026, 8, 2, 12, 0, tzinfo=UTC)


class FakeBlockWorkLogRepository:
    """In-memory stand-in for `BlockWorkLogRepository`, with the same interface."""

    def __init__(self) -> None:
        self.logs: dict[UUID, BlockWorkLog] = {}

    def get(self, log_id: UUID) -> BlockWorkLog | None:
        return self.logs.get(log_id)

    def create(
        self,
        log_id: UUID,
        block_id: UUID,
        user_id: UUID,
        user_name: str,
        worked_at: datetime,
    ) -> BlockWorkLog:
        log = BlockWorkLog(
            id=log_id,
            block_id=block_id,
            user_id=user_id,
            user_name=user_name,
            worked_at=worked_at,
        )
        self.logs[log_id] = log
        return log

    def list_by_block(self, block_id: UUID) -> list[BlockWorkLog]:
        found = [log for log in self.logs.values() if log.block_id == block_id]
        return sorted(found, key=lambda log: log.worked_at, reverse=True)

    def delete(self, log: BlockWorkLog) -> None:
        self.logs.pop(log.id, None)

    def list_by_user_with_details(self, user_id: UUID) -> list[tuple[BlockWorkLog, int, UUID, str]]:
        found = [log for log in self.logs.values() if log.user_id == user_id]
        found.sort(key=lambda log: log.worked_at, reverse=True)
        # The block number and territory come from the join in the real query;
        # the fake stands in with placeholders, since the service only forwards.
        return [(log, 1, log.block_id, "Território") for log in found]

    def latest_worked_at(self, block_id: UUID) -> datetime | None:
        return max(
            (log.worked_at for log in self.logs.values() if log.block_id == block_id),
            default=None,
        )


class FakeBlockRepository:
    """In-memory stand-in for `BlockRepository`, limited to what the work log uses."""

    def __init__(self) -> None:
        self.blocks: dict[UUID, Block] = {}
        # Stands in for the join through `territories`: a block belongs to a
        # congregation only through the territory that owns it.
        self.congregation_of_territory: dict[UUID, UUID] = {}

    def get_in_congregation(self, congregation_id: UUID, block_id: UUID) -> Block | None:
        block = self.blocks.get(block_id)
        if block is None:
            return None
        if self.congregation_of_territory.get(block.territory_id) != congregation_id:
            return None
        return block

    def set_last_worked_at(self, block: Block, worked_at: datetime | None) -> None:
        block.last_worked_at = worked_at

    def set_status_override(self, block: Block, status: str | None) -> None:
        block.status_override = status


class FakeUserRepository:
    """In-memory stand-in for `UserRepository`, limited to what the work log uses."""

    def __init__(self) -> None:
        self.users: dict[UUID, User] = {}

    def get(self, user_id: UUID) -> User | None:
        return self.users.get(user_id)


def draw_block(
    blocks: FakeBlockRepository,
    congregation_id: UUID,
    number: int = 1,
    assigned_user_id: UUID | None = None,
) -> Block:
    """Put a block of this congregation on the map, in its own territory.

    `assigned_user_id` mirrors `Territory.assigned_user_id`: `None` (the default)
    means the territory has nobody designated to it, same as a fresh territory the
    admin never assigned.
    """
    territory_id = uuid4()
    territory = Territory(
        id=territory_id,
        congregation_id=congregation_id,
        assigned_user_id=assigned_user_id,
    )
    block = Block(id=uuid4(), territory_id=territory_id, number=number, last_worked_at=None)
    block.territory = territory
    blocks.blocks[block.id] = block
    blocks.congregation_of_territory[territory_id] = congregation_id
    return block


def make_user(congregation_id: UUID, name: str = "Ana") -> User:
    """A publisher of this congregation, activated and with access."""
    return User(
        id=uuid4(),
        congregation_id=congregation_id,
        name=name,
        token_version=0,
        is_active=True,
    )


@pytest.fixture
def congregation_id() -> UUID:
    return uuid4()


@pytest.fixture
def work_logs() -> FakeBlockWorkLogRepository:
    return FakeBlockWorkLogRepository()


@pytest.fixture
def blocks() -> FakeBlockRepository:
    return FakeBlockRepository()


@pytest.fixture
def users() -> FakeUserRepository:
    return FakeUserRepository()


@pytest.fixture
def service(
    work_logs: FakeBlockWorkLogRepository,
    blocks: FakeBlockRepository,
    users: FakeUserRepository,
) -> WorkLogService:
    return WorkLogService(
        work_logs=work_logs,
        blocks=blocks,
        users=users,
        now_provider=lambda: NOW,
    )


@pytest.fixture
def user(congregation_id: UUID, users: FakeUserRepository) -> User:
    publisher = make_user(congregation_id)
    users.users[publisher.id] = publisher
    return publisher


@pytest.fixture
def block(blocks: FakeBlockRepository, user: User) -> Block:
    """A block whose territory is already designated to `user` -- the ordinary case
    every test in this file other than the designation tests themselves cares about.
    """
    return draw_block(blocks, user.congregation_id, assigned_user_id=user.id)


def test_marking_a_block_records_the_visit_as_a_new_log(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    log_id = uuid4()
    worked_at = NOW - timedelta(hours=3)

    log, created = service.mark_worked(log_id, block.id, user, worked_at, NOW)

    assert created is True
    assert (log.id, log.block_id, log.user_id, log.worked_at) == (
        log_id,
        block.id,
        user.id,
        worked_at,
    )


def test_marking_a_block_moves_its_last_worked_at_to_the_reported_moment(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    worked_at = NOW - timedelta(hours=3)

    service.mark_worked(uuid4(), block.id, user, worked_at, NOW)

    assert block.last_worked_at == worked_at


def test_resending_the_same_log_id_returns_the_stored_log_without_recording_a_visit(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    user: User,
    block: Block,
) -> None:
    """The phone retries a queued marking until the server confirms it."""
    log_id = uuid4()
    worked_at = NOW - timedelta(hours=3)
    first, _ = service.mark_worked(log_id, block.id, user, worked_at, NOW)

    again, created = service.mark_worked(log_id, block.id, user, worked_at, NOW)

    assert created is False
    assert again is first
    assert len(work_logs.list_by_block(block.id)) == 1


def test_resending_a_log_id_with_a_different_moment_does_not_rewrite_the_stored_visit(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """The first arrival wins: a resend is a repeat, never a correction."""
    log_id = uuid4()
    worked_at = NOW - timedelta(days=2)
    service.mark_worked(log_id, block.id, user, worked_at, NOW)

    again, _ = service.mark_worked(log_id, block.id, user, NOW, NOW)

    assert again.worked_at == worked_at
    assert block.last_worked_at == worked_at


def test_the_same_publisher_working_the_block_twice_records_two_visits(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    user: User,
    block: Block,
) -> None:
    """Covering the same block again in a new cycle is a second visit, not a repeat."""
    first_visit = NOW - timedelta(days=40)
    second_visit = NOW - timedelta(days=1)

    service.mark_worked(uuid4(), block.id, user, first_visit, NOW)
    service.mark_worked(uuid4(), block.id, user, second_visit, NOW)

    recorded = work_logs.list_by_block(block.id)
    assert [log.worked_at for log in recorded] == [second_visit, first_visit]
    assert {log.user_id for log in recorded} == {user.id}


def test_a_marking_older_than_the_last_one_is_recorded_without_moving_last_worked_at_back(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    user: User,
    block: Block,
) -> None:
    """A phone that was offline for days syncs after someone who marked it yesterday."""
    recent = NOW - timedelta(days=1)
    stale = NOW - timedelta(days=10)
    service.mark_worked(uuid4(), block.id, user, recent, NOW)

    service.mark_worked(uuid4(), block.id, user, stale, NOW)

    assert block.last_worked_at == recent
    assert len(work_logs.list_by_block(block.id)) == 2


def test_a_marking_newer_than_the_last_one_moves_last_worked_at_forward(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    stale = NOW - timedelta(days=10)
    recent = NOW - timedelta(days=1)
    service.mark_worked(uuid4(), block.id, user, stale, NOW)

    service.mark_worked(uuid4(), block.id, user, recent, NOW)

    assert block.last_worked_at == recent


def test_marking_with_a_moment_in_the_future_is_refused(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """A block cannot have been worked tomorrow: the device's clock is wrong."""
    with pytest.raises(InvalidWorkedAtError):
        service.mark_worked(uuid4(), block.id, user, NOW + timedelta(seconds=1), NOW)


def test_marking_at_the_current_moment_is_accepted(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """Finishing a block right now is the ordinary case, not a clock in the future."""
    log, created = service.mark_worked(uuid4(), block.id, user, NOW, NOW)

    assert created is True
    assert log.worked_at == NOW


def test_marking_more_than_ninety_days_ago_is_refused(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """Nobody syncs a three-month-old queue; the device's clock is wrong."""
    with pytest.raises(InvalidWorkedAtError):
        service.mark_worked(
            uuid4(),
            block.id,
            user,
            NOW - timedelta(days=90, seconds=1),
            NOW,
        )


def test_marking_exactly_ninety_days_ago_is_accepted(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """The limit is the last moment still trusted, not the first one refused."""
    worked_at = NOW - MAX_WORKED_AT_AGE

    log, created = service.mark_worked(uuid4(), block.id, user, worked_at, NOW)

    assert created is True
    assert log.worked_at == worked_at


def test_a_refused_marking_leaves_no_log_and_no_trace_on_the_block(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    user: User,
    block: Block,
) -> None:
    worked_at = NOW - timedelta(days=2)
    service.mark_worked(uuid4(), block.id, user, worked_at, NOW)

    with pytest.raises(InvalidWorkedAtError):
        service.mark_worked(uuid4(), block.id, user, NOW + timedelta(days=1), NOW)

    assert len(work_logs.list_by_block(block.id)) == 1
    assert block.last_worked_at == worked_at


def test_marking_a_block_whose_territory_has_no_designation_is_refused(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    blocks: FakeBlockRepository,
    congregation_id: UUID,
    user: User,
) -> None:
    """A publisher with no territory designated to them cannot mark any block."""
    unassigned_block = draw_block(blocks, congregation_id, number=2)

    with pytest.raises(TerritoryNotAssignedError):
        service.mark_worked(uuid4(), unassigned_block.id, user, NOW, NOW)

    assert work_logs.list_by_block(unassigned_block.id) == []
    assert unassigned_block.last_worked_at is None


def test_marking_a_block_of_a_territory_designated_to_someone_else_is_refused(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    blocks: FakeBlockRepository,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    """Being responsible for one territory does not open every block in the congregation."""
    other_block = draw_block(blocks, congregation_id, number=2, assigned_user_id=uuid4())

    with pytest.raises(TerritoryNotAssignedError):
        service.mark_worked(uuid4(), other_block.id, user, NOW, NOW)

    assert work_logs.list_by_block(other_block.id) == []
    assert other_block.last_worked_at is None


def test_a_resend_is_confirmed_even_after_the_territorys_designation_changed(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """A stored visit is a fact; revoking the designation afterward cannot undo it."""
    log_id = uuid4()
    worked_at = NOW - timedelta(hours=2)
    service.mark_worked(log_id, block.id, user, worked_at, NOW)

    block.territory.assigned_user_id = None

    again, created = service.mark_worked(log_id, block.id, user, worked_at, NOW)

    assert created is False
    assert again.worked_at == worked_at


def test_marking_a_block_of_another_congregation_is_not_found(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    blocks: FakeBlockRepository,
    user: User,
) -> None:
    """Never 403: saying "not yours" would already confirm the block exists."""
    stranger = draw_block(blocks, uuid4())

    with pytest.raises(NotFoundError):
        service.mark_worked(uuid4(), stranger.id, user, NOW, NOW)

    assert work_logs.list_by_block(stranger.id) == []
    assert stranger.last_worked_at is None


def test_a_resend_is_confirmed_even_after_the_visit_became_too_old_to_accept(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """A stored visit is a fact; re-judging it would leave the phone retrying forever."""
    log_id = uuid4()
    worked_at = NOW - timedelta(days=89)
    service.mark_worked(log_id, block.id, user, worked_at, NOW)
    much_later = NOW + timedelta(days=30)

    again, created = service.mark_worked(log_id, block.id, user, worked_at, much_later)

    assert created is False
    assert again.worked_at == worked_at


def test_a_log_id_already_used_for_another_block_is_refused_instead_of_confirmed(
    service: WorkLogService,
    blocks: FakeBlockRepository,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    """Confirming it would hand back a visit to a block the request never named."""
    elsewhere = draw_block(blocks, congregation_id, number=2, assigned_user_id=user.id)
    log_id = uuid4()
    worked_at = NOW - timedelta(hours=1)
    service.mark_worked(log_id, elsewhere.id, user, worked_at, NOW)

    with pytest.raises(DomainError) as raised:
        service.mark_worked(log_id, block.id, user, worked_at, NOW)

    assert type(raised.value) is DomainError
    assert block.last_worked_at is None


def test_marking_without_a_moment_of_its_own_reads_the_injected_clock(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """The service never asks the machine what time it is; the clock is handed to it."""
    with pytest.raises(InvalidWorkedAtError):
        service.mark_worked(uuid4(), block.id, user, NOW + timedelta(hours=1))


def test_the_history_of_a_block_is_listed_from_the_most_recent_visit(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    older = NOW - timedelta(days=30)
    newer = NOW - timedelta(days=2)
    service.mark_worked(uuid4(), block.id, user, older, NOW)
    service.mark_worked(uuid4(), block.id, user, newer, NOW)

    history = service.list_by_block(user.congregation_id, block.id)

    assert [log.worked_at for log in history] == [newer, older]


def test_the_history_of_a_block_of_another_congregation_is_not_found(
    service: WorkLogService,
    blocks: FakeBlockRepository,
    congregation_id: UUID,
) -> None:
    stranger = draw_block(blocks, uuid4())

    with pytest.raises(NotFoundError):
        service.list_by_block(congregation_id, stranger.id)


def test_the_history_of_a_block_never_worked_is_empty(
    service: WorkLogService,
    congregation_id: UUID,
    block: Block,
) -> None:
    assert service.list_by_block(congregation_id, block.id) == []


def test_the_visits_of_a_deactivated_publisher_stay_in_the_history(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """Revoking access is not erasing the past: the admin still sees who was there."""
    worked_at = NOW - timedelta(days=5)
    service.mark_worked(uuid4(), block.id, user, worked_at, NOW)

    user.is_active = False

    history = service.list_by_block(user.congregation_id, block.id)
    assert [(log.user_id, log.worked_at) for log in history] == [(user.id, worked_at)]
    assert block.last_worked_at == worked_at


def test_deleting_a_visit_falls_back_to_the_most_recent_one_left(
    service: WorkLogService,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    """The admin removing a wrong entry must not leave the map claiming it happened."""
    older = NOW - timedelta(days=30)
    newer = NOW - timedelta(days=2)
    service.mark_worked(uuid4(), block.id, user, older, NOW)
    mistake_id = uuid4()
    service.mark_worked(mistake_id, block.id, user, newer, NOW)

    service.delete(congregation_id, mistake_id)

    assert block.last_worked_at == older
    assert [log.worked_at for log in service.list_by_block(congregation_id, block.id)] == [older]


def test_deleting_the_only_visit_makes_the_block_never_worked_again(
    service: WorkLogService,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    log_id = uuid4()
    service.mark_worked(log_id, block.id, user, NOW - timedelta(days=2), NOW)

    service.delete(congregation_id, log_id)

    assert block.last_worked_at is None
    assert service.list_by_block(congregation_id, block.id) == []


def test_deleting_a_visit_that_does_not_exist_is_not_found(
    service: WorkLogService,
    congregation_id: UUID,
) -> None:
    with pytest.raises(NotFoundError):
        service.delete(congregation_id, uuid4())


def test_deleting_a_visit_of_another_congregation_is_not_found(
    service: WorkLogService,
    blocks: FakeBlockRepository,
    congregation_id: UUID,
) -> None:
    """The admin of one congregation cannot reach into another's history."""
    other_congregation_id = uuid4()
    stranger = make_user(other_congregation_id, name="Bruno")
    stranger_block = draw_block(blocks, other_congregation_id, assigned_user_id=stranger.id)
    log_id = uuid4()
    worked_at = NOW - timedelta(days=2)
    service.mark_worked(log_id, stranger_block.id, stranger, worked_at, NOW)

    with pytest.raises(NotFoundError):
        service.delete(congregation_id, log_id)

    assert stranger_block.last_worked_at == worked_at
    assert len(service.list_by_block(other_congregation_id, stranger_block.id)) == 1


def test_the_admin_marking_a_block_records_the_visit_for_the_publisher_they_named(
    service: WorkLogService,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    """The admin is registering someone else's fieldwork, so the author is a parameter."""
    worked_at = NOW - timedelta(days=3)

    log = service.mark_worked_by_admin(congregation_id, block.id, user.id, worked_at, NOW)

    assert (log.block_id, log.user_id, log.worked_at) == (block.id, user.id, worked_at)
    assert block.last_worked_at == worked_at


def test_the_admin_marking_the_same_block_twice_records_two_visits(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    """Working the block again in a new cycle is a second visit, not a repeat."""
    first_visit = NOW - timedelta(days=200)
    second_visit = NOW - timedelta(days=1)

    first = service.mark_worked_by_admin(congregation_id, block.id, user.id, first_visit, NOW)
    second = service.mark_worked_by_admin(congregation_id, block.id, user.id, second_visit, NOW)

    recorded = work_logs.list_by_block(block.id)
    assert [log.worked_at for log in recorded] == [second_visit, first_visit]
    assert first.id != second.id


def test_the_admin_marking_an_older_visit_does_not_drag_last_worked_at_backwards(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    """Entering a visit off the paper card must not hide a more recent one."""
    recent = NOW - timedelta(days=1)
    stale = NOW - timedelta(days=150)
    service.mark_worked_by_admin(congregation_id, block.id, user.id, recent, NOW)

    service.mark_worked_by_admin(congregation_id, block.id, user.id, stale, NOW)

    assert block.last_worked_at == recent
    assert len(work_logs.list_by_block(block.id)) == 2


def test_the_admin_marking_a_block_of_another_congregation_is_not_found(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    blocks: FakeBlockRepository,
    congregation_id: UUID,
    user: User,
) -> None:
    """Never 403: saying "not yours" would already confirm the block exists."""
    stranger = draw_block(blocks, uuid4())

    with pytest.raises(NotFoundError):
        service.mark_worked_by_admin(congregation_id, stranger.id, user.id, NOW, NOW)

    assert work_logs.list_by_block(stranger.id) == []
    assert stranger.last_worked_at is None


def test_the_admin_marking_a_block_that_does_not_exist_is_not_found(
    service: WorkLogService,
    congregation_id: UUID,
    user: User,
) -> None:
    with pytest.raises(NotFoundError):
        service.mark_worked_by_admin(congregation_id, uuid4(), user.id, NOW, NOW)


def test_the_admin_naming_a_publisher_of_another_congregation_is_not_found(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    users: FakeUserRepository,
    congregation_id: UUID,
    block: Block,
) -> None:
    """The same 404 as an unknown id: a 403 would confirm the person exists elsewhere."""
    stranger = make_user(uuid4(), name="Bruno")
    users.users[stranger.id] = stranger

    with pytest.raises(NotFoundError):
        service.mark_worked_by_admin(congregation_id, block.id, stranger.id, NOW, NOW)

    assert work_logs.list_by_block(block.id) == []
    assert block.last_worked_at is None


def test_the_admin_naming_a_publisher_that_does_not_exist_is_not_found(
    service: WorkLogService,
    congregation_id: UUID,
    block: Block,
) -> None:
    with pytest.raises(NotFoundError):
        service.mark_worked_by_admin(congregation_id, block.id, uuid4(), NOW, NOW)


def test_the_admin_can_record_a_visit_for_a_deactivated_publisher(
    service: WorkLogService,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    """Revoking the app access does not remove the person from the history."""
    user.is_active = False
    worked_at = NOW - timedelta(days=2)

    log = service.mark_worked_by_admin(congregation_id, block.id, user.id, worked_at, NOW)

    assert (log.user_id, log.worked_at) == (user.id, worked_at)
    assert block.last_worked_at == worked_at


def test_the_admin_marking_a_visit_in_the_future_is_refused(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    """Nothing has been worked tomorrow, whoever is typing the date."""
    with pytest.raises(InvalidWorkedAtError):
        service.mark_worked_by_admin(
            congregation_id,
            block.id,
            user.id,
            NOW + timedelta(seconds=1),
            NOW,
        )

    assert work_logs.list_by_block(block.id) == []
    assert block.last_worked_at is None


def test_the_admin_marking_the_present_moment_is_accepted(
    service: WorkLogService,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    """Today is the dialog's default, and the border is accepted, not refused."""
    log = service.mark_worked_by_admin(congregation_id, block.id, user.id, NOW, NOW)

    assert log.worked_at == NOW


def test_the_admin_can_record_a_visit_far_older_than_the_app_would_accept(
    service: WorkLogService,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    """The 90-day floor catches a wrong clock; a date typed off the paper card has none."""
    long_ago = NOW - timedelta(days=200)

    log = service.mark_worked_by_admin(congregation_id, block.id, user.id, long_ago, NOW)

    assert log.worked_at == long_ago
    assert block.last_worked_at == long_ago
    with pytest.raises(InvalidWorkedAtError):
        service.mark_worked(uuid4(), block.id, user, long_ago, NOW)


def test_the_admin_can_mark_a_block_whose_territory_has_nobody_designated(
    service: WorkLogService,
    blocks: FakeBlockRepository,
    congregation_id: UUID,
    user: User,
) -> None:
    """The designation confines the app, not the admin, who knows what happened in field."""
    unassigned_block = draw_block(blocks, congregation_id, number=2)
    worked_at = NOW - timedelta(days=4)

    log = service.mark_worked_by_admin(
        congregation_id,
        unassigned_block.id,
        user.id,
        worked_at,
        NOW,
    )

    assert log.block_id == unassigned_block.id
    assert unassigned_block.last_worked_at == worked_at


def test_the_admin_marking_a_block_designated_to_someone_else_is_accepted(
    service: WorkLogService,
    blocks: FakeBlockRepository,
    congregation_id: UUID,
    user: User,
) -> None:
    """Who holds the territory today says nothing about who covered the block."""
    other_block = draw_block(blocks, congregation_id, number=3, assigned_user_id=uuid4())

    log = service.mark_worked_by_admin(congregation_id, other_block.id, user.id, NOW, NOW)

    assert log.user_id == user.id
    assert other_block.last_worked_at == NOW


def test_the_admin_marking_without_a_moment_of_its_own_reads_the_injected_clock(
    service: WorkLogService,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    """The service never asks the machine what time it is; the clock is handed to it."""
    with pytest.raises(InvalidWorkedAtError):
        service.mark_worked_by_admin(
            congregation_id,
            block.id,
            user.id,
            NOW + timedelta(hours=1),
        )


def test_marking_a_block_clears_the_status_the_admin_had_forced_on_it(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """A visit just recorded is the strongest evidence there is about the block.

    Leaving it painted "never worked" after someone reported working it would be the
    interface contradicting the history right under it.
    """
    block.status_override = "never"

    service.mark_worked(uuid4(), block.id, user, NOW - timedelta(hours=1), NOW)

    assert block.status_override is None


def test_the_admin_marking_a_block_clears_the_status_they_had_forced_on_it(
    service: WorkLogService,
    congregation_id: UUID,
    user: User,
    blocks: FakeBlockRepository,
) -> None:
    block = draw_block(blocks, congregation_id)
    block.status_override = "overdue"

    service.mark_worked_by_admin(
        congregation_id,
        block.id,
        user.id,
        NOW - timedelta(days=200),
        NOW,
    )

    assert block.status_override is None


def test_resending_an_already_recorded_marking_leaves_the_forced_status_alone(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """A resend records nothing, so it has no new evidence to overrule the admin."""
    log_id = uuid4()
    service.mark_worked(log_id, block.id, user, NOW - timedelta(hours=1), NOW)
    block.status_override = "never"

    service.mark_worked(log_id, block.id, user, NOW - timedelta(hours=1), NOW)

    assert block.status_override == "never"


def test_deleting_a_visit_leaves_the_forced_status_alone(
    service: WorkLogService,
    congregation_id: UUID,
    user: User,
    block: Block,
) -> None:
    """Deleting is the admin correcting the history; guessing their intention about
    the colour would be worse than leaving it as they set it."""
    log, _ = service.mark_worked(uuid4(), block.id, user, NOW - timedelta(hours=1), NOW)
    block.status_override = "overdue"

    service.delete(congregation_id, log.id)

    assert block.status_override == "overdue"


def test_marking_a_block_stores_the_publishers_name_on_the_row(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """The row names the person, so it stays readable after they are deleted."""
    log, _ = service.mark_worked(uuid4(), block.id, user, NOW - timedelta(hours=3), NOW)

    assert log.user_name == user.name


def test_the_admin_marking_a_block_stores_the_name_of_the_publisher_they_chose(
    service: WorkLogService,
    congregation_id: UUID,
    blocks: FakeBlockRepository,
    users: FakeUserRepository,
) -> None:
    """The name on the row is the person the admin picked, not whoever holds the
    territory: the admin is entering work that already happened, often for a cycle
    that was closed long ago.
    """
    designated = make_user(congregation_id, name="Ana")
    users.users[designated.id] = designated
    worker = make_user(congregation_id, name="Bruno")
    users.users[worker.id] = worker
    block = draw_block(blocks, congregation_id, assigned_user_id=designated.id)

    log = service.mark_worked_by_admin(
        congregation_id, block.id, worker.id, NOW - timedelta(days=200), NOW
    )

    assert (log.user_id, log.user_name) == (worker.id, "Bruno")


def test_renaming_the_publisher_afterwards_does_not_rewrite_the_rows_already_stored(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """The name on the row is a photograph, not a live view.

    This is the accepted price of dropping the foreign key: the history keeps the
    name the person had that day, which is precisely what lets it survive their
    deletion.
    """
    log, _ = service.mark_worked(uuid4(), block.id, user, NOW - timedelta(hours=3), NOW)

    user.name = "Ana Maria"

    assert log.user_name == "Ana"


def test_resending_a_known_log_id_neither_duplicates_the_row_nor_rewrites_its_name(
    service: WorkLogService,
    work_logs: FakeBlockWorkLogRepository,
    user: User,
    block: Block,
) -> None:
    """A resend is confirmed, never judged again -- and never rewritten either.

    The phone retries a queued marking until the server confirms it. If the admin
    renamed the publisher in between, the stored row must keep naming them as it
    did when the visit was accepted.
    """
    log_id = uuid4()
    first, _ = service.mark_worked(log_id, block.id, user, NOW - timedelta(hours=3), NOW)
    user.name = "Ana Maria"

    again, created = service.mark_worked(log_id, block.id, user, NOW - timedelta(hours=3), NOW)

    assert created is False
    assert again is first
    assert again.user_name == "Ana"
    assert len(work_logs.logs) == 1


def test_list_user_history_forwards_the_publisher_own_visits(
    service: WorkLogService,
    user: User,
    block: Block,
) -> None:
    """The app dashboard's detailed list: this publisher's visits, newest first."""
    service.mark_worked(
        log_id=uuid4(),
        block_id=block.id,
        user=user,
        worked_at=NOW - timedelta(days=2),
    )
    service.mark_worked(
        log_id=uuid4(),
        block_id=block.id,
        user=user,
        worked_at=NOW - timedelta(days=1),
    )

    history = service.list_user_history(user)

    assert [entry[0].worked_at for entry in history] == [
        NOW - timedelta(days=1),
        NOW - timedelta(days=2),
    ]


def test_list_user_history_is_empty_for_a_publisher_who_never_worked(
    service: WorkLogService,
    user: User,
) -> None:
    assert service.list_user_history(user) == []
