"""Tests for the work-log DTOs."""

from datetime import UTC, datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from app.schemas.work_log import WorkedIn, WorkLogOut
from pydantic import ValidationError

AWARE = datetime(2026, 7, 30, 15, 0, tzinfo=UTC)
NAIVE = datetime(2026, 7, 30, 15, 0)
SAO_PAULO = timezone(timedelta(hours=-3))


def test_worked_in_accepts_a_log_id_and_a_timezone_aware_moment():
    log_id = uuid4()

    body = WorkedIn(log_id=log_id, worked_at=AWARE)

    assert body.log_id == log_id
    assert body.worked_at == AWARE


def test_worked_in_accepts_the_offset_the_phone_actually_sends():
    body = WorkedIn(log_id=uuid4(), worked_at="2026-07-30T12:00:00-03:00")

    assert body.worked_at == datetime(2026, 7, 30, 12, 0, tzinfo=SAO_PAULO)
    assert body.worked_at == AWARE


def test_worked_in_rejects_a_naive_datetime():
    # A moment without an offset is unplaceable on a timeline: the publisher may be in
    # another timezone than the server, and "15:00" alone does not say which one.
    with pytest.raises(ValidationError):
        WorkedIn(log_id=uuid4(), worked_at=NAIVE)


def test_worked_in_rejects_an_iso_string_without_an_offset():
    with pytest.raises(ValidationError):
        WorkedIn(log_id=uuid4(), worked_at="2026-07-30T15:00:00")


def test_worked_in_accepts_a_log_id_sent_as_a_string():
    log_id = uuid4()

    assert WorkedIn(log_id=str(log_id), worked_at=AWARE).log_id == log_id


def test_worked_in_rejects_a_log_id_that_is_not_a_uuid():
    # The id is minted by the phone and is what makes an offline resend idempotent;
    # anything but a UUID would let a client collide with someone else's log.
    with pytest.raises(ValidationError):
        WorkedIn(log_id="42", worked_at=AWARE)


@pytest.mark.parametrize("missing", ["log_id", "worked_at"])
def test_worked_in_requires_both_fields(missing):
    body = {"log_id": uuid4(), "worked_at": AWARE}
    del body[missing]

    with pytest.raises(ValidationError):
        WorkedIn(**body)


def test_work_log_out_names_the_publisher_behind_the_visit():
    row = SimpleNamespace(
        id=uuid4(),
        block_id=uuid4(),
        user_id=uuid4(),
        user=SimpleNamespace(id=uuid4(), name="Maria", token_version=2),
        worked_at=AWARE,
        created_at=AWARE,
    )

    dto = WorkLogOut.model_validate(row)

    assert dto.user.name == "Maria"
    assert set(dto.model_dump()) == {"id", "block_id", "user", "worked_at", "created_at"}


def test_work_log_out_does_not_leak_the_token_version_of_the_publisher():
    row = SimpleNamespace(
        id=uuid4(),
        block_id=uuid4(),
        user=SimpleNamespace(id=uuid4(), name="Maria", token_version=2, is_active=False),
        worked_at=AWARE,
        created_at=AWARE,
    )

    assert "token_version" not in WorkLogOut.model_validate(row).model_dump_json()


def test_work_log_out_rejects_an_id_that_is_not_a_uuid():
    with pytest.raises(ValidationError):
        WorkLogOut(
            id="nope",
            block_id=uuid4(),
            user={"id": uuid4(), "name": "Maria"},
            worked_at=AWARE,
            created_at=AWARE,
        )


def test_work_log_out_keeps_the_ids_as_uuid_objects():
    dto = WorkLogOut(
        id=uuid4(),
        block_id=uuid4(),
        user={"id": uuid4(), "name": "Maria"},
        worked_at=AWARE,
        created_at=AWARE,
    )

    assert isinstance(dto.id, UUID)
    assert isinstance(dto.block_id, UUID)
