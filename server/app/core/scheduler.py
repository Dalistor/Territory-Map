"""The background scheduler that runs the application's periodic maintenance.

Today there is exactly one recurring task: wiping the access codes that are past
their validity (`app/jobs/expire_codes.py`). It is scheduled in-process rather than
handed to cron because the deployment unit is a single container -- adding a cron
daemon beside uvicorn would mean a second process to build, ship and supervise for
one hourly `UPDATE`.

**Several uvicorn workers mean several schedulers.** Each worker is its own process
and so starts its own copy of this scheduler, and the job then runs once per worker
every hour instead of once. That is harmless here and deliberately left alone: the
sweep is idempotent (it only matches rows that still carry a code, so the runs after
the first clear nothing and cost one no-op `UPDATE`) and it takes no lock a
concurrent run could contend for. If the task ever grows a side effect that must
happen exactly once -- sending mail, charging something, writing a report -- that is
the assumption that breaks, and the answer then is a lock in the database or a single
scheduled runner, not more workers with more schedulers.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI

from app.jobs import expire_codes

#: Stable identifier of the cleanup job. Named rather than anonymous so that a second
#: registration replaces it instead of silently scheduling the sweep twice.
EXPIRE_CODES_JOB_ID = "expire_access_codes"

#: How often the sweep runs. Codes live for 24 hours, so hourly leaves an expired code
#: in the database for at most one extra hour -- close enough for a credential that
#: redemption already refuses, and cheap enough to be irrelevant.
EXPIRE_CODES_INTERVAL_HOURS = 1


def create_scheduler() -> BackgroundScheduler:
    """Build the scheduler with its jobs registered but not yet started.

    A function and not a module-level instance: importing this module must not start
    a thread, and the tests need to inspect the registration without one running.
    """
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        expire_codes.run,
        trigger="interval",
        hours=EXPIRE_CODES_INTERVAL_HOURS,
        id=EXPIRE_CODES_JOB_ID,
        # A worker that was busy or suspended must not come back to a queue of skipped
        # sweeps -- they would all clear nothing anyway. One pending run is enough.
        coalesce=True,
        max_instances=1,
        replace_existing=True,
    )
    return scheduler


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Run the scheduler for exactly as long as the application runs.

    Tied to the ASGI lifespan rather than to module import so that the shutdown is
    guaranteed: a scheduler started at import has nothing to stop it, and its thread
    outlives the application that no longer has a handle on it.

    The scheduler is published on `app.state` so that whoever holds the app -- a
    test, a future diagnostics endpoint -- can see it, and so that the shutdown acts
    on the very instance this startup created.
    """
    scheduler = create_scheduler()
    scheduler.start()
    app.state.scheduler = scheduler
    try:
        yield
    finally:
        # `wait=True` joins the worker threads, so by the time the shutdown is
        # answered a sweep caught mid-flight has finished its transaction rather than
        # being torn down halfway through it.
        scheduler.shutdown(wait=True)
