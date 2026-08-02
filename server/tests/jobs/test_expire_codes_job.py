"""Behaviour of the scheduled access-code cleanup.

The job runs against the real database on purpose: what it has to get right is not
the arithmetic -- `UserService.expire_codes` already owns that, tested with a fake
repository -- but that a session opened outside a request, written to and committed
by the job itself, leaves the rows in the state the sweep promises. A fake session
would prove nothing about the one thing this module adds.
"""

import logging
import os
import subprocess
import sys
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from app.core.config import get_settings
from app.jobs.expire_codes import run, utc_now
from app.models.congregation import Congregation
from app.models.user import User
from app.repositories.user import UserRepository
from sqlalchemy.orm import Session

NOW = datetime(2026, 8, 2, 12, 0, tzinfo=UTC)
SERVER_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture
def session_factory(session: Session) -> Callable[[], Session]:
    """Hand the job a factory that opens a *real* session on the test transaction.

    The job owns its session -- it opens, commits and closes one, which is the whole
    point of a task that runs with no request around it. So the factory builds a new
    `Session` rather than lending out the fixture's: sharing one would hide the
    closing, and the test could not tell a job that leaks a session from one that
    does not. Both sessions sit on the same connection, so the rows the test flushed
    are visible to the job and the job's commit lands inside the transaction the
    fixture rolls back at the end.
    """

    def _make() -> Session:
        return Session(bind=session.get_bind(), join_transaction_mode="create_savepoint")

    return _make


def make_publisher(
    session: Session,
    congregation: Congregation,
    *,
    name: str = "Irmão João",
    code: str | None = "ABCD2345",
    expires_at: datetime | None = NOW + timedelta(hours=24),
) -> User:
    """A publisher holding an access code with the expiry the test asks for."""
    return UserRepository(session).create(
        congregation_id=congregation.id,
        name=name,
        access_code=code,
        access_code_expires_at=expires_at,
    )


def test_the_job_clears_the_expired_codes_and_reports_how_many(
    session, session_factory, make_congregation
):
    congregation = make_congregation()
    stale = make_publisher(session, congregation, expires_at=NOW - timedelta(minutes=1))
    session.flush()

    cleared = run(session_factory=session_factory, now_provider=lambda: NOW)

    assert cleared == 1
    session.expire_all()
    assert stale.access_code is None
    assert stale.access_code_expires_at is None


def test_a_second_run_right_after_the_first_clears_nothing(
    session, session_factory, make_congregation
):
    """Idempotent, which is what makes running it too often harmless."""
    congregation = make_congregation()
    make_publisher(session, congregation, expires_at=NOW - timedelta(minutes=1))
    session.flush()

    first = run(session_factory=session_factory, now_provider=lambda: NOW)
    second = run(session_factory=session_factory, now_provider=lambda: NOW)

    assert (first, second) == (1, 0)


def test_the_job_leaves_a_code_that_is_still_within_its_validity(
    session, session_factory, make_congregation
):
    congregation = make_congregation()
    live = make_publisher(
        session, congregation, code="WXYZ6789", expires_at=NOW + timedelta(hours=1)
    )
    session.flush()

    cleared = run(session_factory=session_factory, now_provider=lambda: NOW)

    assert cleared == 0
    session.expire_all()
    assert live.access_code == "WXYZ6789"
    assert live.access_code_expires_at is not None


def test_the_job_does_not_disturb_a_publisher_who_already_activated(
    session, session_factory, make_congregation
):
    """An activated row has no code left to clear, and its activation must survive."""
    congregation = make_congregation()
    activated = make_publisher(session, congregation, name="Irmã Maria")
    UserRepository(session).redeem_code(activated, NOW)
    session.flush()

    cleared = run(session_factory=session_factory, now_provider=lambda: NOW + timedelta(days=365))

    assert cleared == 0
    session.expire_all()
    assert activated.activated_at == NOW
    assert activated.token_version == 1
    assert activated.is_active is True


def test_the_job_sweeps_only_the_stale_code_when_both_kinds_are_present(
    session, session_factory, make_congregation
):
    """The count is of what was actually cleared, not of everything that has a code."""
    congregation = make_congregation()
    stale = make_publisher(session, congregation, name="Ana", expires_at=NOW - timedelta(seconds=1))
    live = make_publisher(
        session,
        congregation,
        name="Bia",
        code="WXYZ6789",
        expires_at=NOW + timedelta(seconds=1),
    )
    session.flush()

    cleared = run(session_factory=session_factory, now_provider=lambda: NOW)

    assert cleared == 1
    session.expire_all()
    assert stale.access_code is None
    assert live.access_code == "WXYZ6789"


def test_the_job_logs_how_many_codes_it_cleared(
    session, session_factory, make_congregation, caplog
):
    """The sweep runs unattended; the log line is the only trace it leaves."""
    congregation = make_congregation()
    make_publisher(session, congregation, expires_at=NOW - timedelta(minutes=1))
    session.flush()

    with caplog.at_level(logging.INFO, logger="app.jobs.expire_codes"):
        run(session_factory=session_factory, now_provider=lambda: NOW)

    assert [record.getMessage() for record in caplog.records] == ["Expired access codes cleared: 1"]


def test_the_job_never_writes_an_access_code_to_the_log(
    session, session_factory, make_congregation, caplog
):
    """A code is a credential: it may be counted in a log, never printed in one."""
    congregation = make_congregation()
    make_publisher(session, congregation, code="ABCD2345", expires_at=NOW - timedelta(minutes=1))
    session.flush()

    with caplog.at_level(logging.DEBUG):
        run(session_factory=session_factory, now_provider=lambda: NOW)

    assert "ABCD2345" not in caplog.text


class BrokenSession:
    """A session whose every statement fails, remembering how the job let go of it.

    A stand-in for the collaborator, not a mock of the code under test: what is being
    checked is the state the job leaves behind on the way out, and the only way to
    observe that on a real session is to watch the calls it receives.
    """

    def __init__(self) -> None:
        self.calls: list[str] = []

    def execute(self, *args: object, **kwargs: object) -> object:
        raise RuntimeError("the database went away")

    def commit(self) -> None:
        self.calls.append("commit")

    def rollback(self) -> None:
        self.calls.append("rollback")

    def close(self) -> None:
        self.calls.append("close")


def test_a_sweep_that_blows_up_rolls_back_and_still_lets_the_session_go():
    """Nothing half-written, and no connection leaked into the next scheduled run."""
    broken = BrokenSession()

    with pytest.raises(RuntimeError):
        run(session_factory=lambda: broken, now_provider=lambda: NOW)

    assert broken.calls == ["rollback", "close"]


def test_the_default_clock_is_timezone_aware_utc():
    """`access_code_expires_at` is stored with a timezone; a naive now cannot compare."""
    now = utc_now()

    assert now.tzinfo is not None
    assert now.utcoffset() == timedelta(0)


def test_the_module_runs_on_its_own_as_a_command(engine):
    """`python -m app.jobs.expire_codes` is the manual and the cron-friendly entry.

    Spawned for real, against the test database, because that is the whole claim
    being made: that the module has an entry point, configures its own logging and
    exits cleanly with no application around it. No rows are set up -- a sweep that
    clears nothing still has to run and say so.
    """
    result = subprocess.run(
        [sys.executable, "-m", "app.jobs.expire_codes"],
        cwd=SERVER_ROOT,
        capture_output=True,
        text=True,
        env={**os.environ, "DATABASE_URL": get_settings().TEST_DATABASE_URL},
        timeout=60,
    )

    assert result.returncode == 0, result.stderr
    assert "Expired access codes cleared:" in result.stderr
