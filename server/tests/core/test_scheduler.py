"""Behaviour of the background scheduler that drives the access-code cleanup.

The scheduler is a thread the application owns, so what these tests pin is its
lifecycle rather than its arithmetic: that starting the app starts it, that stopping
the app stops it, and that nothing survives the shutdown. A scheduler thread left
running after the ASGI shutdown is not a cosmetic problem -- it is a process that
will not exit, and a reload during development that quietly doubles the sweep.

The hourly job itself is never fired here: `IntervalTrigger` schedules its first run
one interval away, so the tests observe the registration and not the execution. What
the job *does* is covered in `tests/jobs/test_expire_codes_job.py`.
"""

import threading
from datetime import timedelta

import pytest
from app.core.scheduler import EXPIRE_CODES_JOB_ID, create_scheduler
from app.jobs import expire_codes
from app.main import app

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def scheduler_threads() -> list[threading.Thread]:
    """Every live APScheduler thread, by the name APScheduler gives its main loop."""
    return [thread for thread in threading.enumerate() if thread.name.startswith("APScheduler")]


async def test_the_lifespan_starts_the_scheduler_and_shuts_it_down_again():
    async with app.router.lifespan_context(app):
        scheduler = app.state.scheduler
        assert scheduler.running is True

    assert scheduler.running is False


async def test_the_application_leaves_no_scheduler_thread_behind():
    """The whole point of shutting down on `lifespan` exit: the process can exit."""
    assert scheduler_threads() == []

    async with app.router.lifespan_context(app):
        assert len(scheduler_threads()) == 1

    assert scheduler_threads() == []


def test_the_scheduler_is_wired_to_the_expire_codes_job_every_hour():
    scheduler = create_scheduler()

    job = scheduler.get_job(EXPIRE_CODES_JOB_ID)

    assert job is not None
    assert job.func is expire_codes.run
    assert job.trigger.interval == timedelta(hours=1)
