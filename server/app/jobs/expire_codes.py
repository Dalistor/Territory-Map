"""Periodic cleanup of the access codes that are past their validity.

Redemption already refuses an expired code, so this sweep is not what makes expiry
true -- it is what makes it a fact *in the database*. A code nobody ever tries again
would otherwise sit in its row forever, and a credential that outlives its purpose is
a credential that can leak. After the sweep the row simply has no code.

Runs on a schedule (`app/core/scheduler.py`) and also on its own:

    python -m app.jobs.expire_codes
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.repositories.user import UserRepository
from app.services.user import UserService

logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    """Read the wall clock, timezone-aware.

    The job is a composition root, just like a router: this is the one place in the
    call chain allowed to ask what time it is. `UserService` receives the reading and
    never looks the clock up itself, which is what lets the tests sweep an arbitrary
    instant without waiting for it to arrive.
    """
    return datetime.now(UTC)


def run(
    session_factory: Callable[[], Session] = SessionLocal,
    now_provider: Callable[[], datetime] = utc_now,
) -> int:
    """Wipe every expired access code and return how many were cleared.

    The job owns its transaction. There is no request around it and therefore no
    `get_session` dependency to borrow one from, so it opens a session, commits and
    closes it here -- and rolls back on failure, so a sweep that breaks halfway
    leaves nothing half-written.

    Idempotent by construction: the underlying `UPDATE` only matches rows that still
    carry a code, so a second run right after the first clears nothing and returns 0.
    That is what makes it safe to run more often than strictly necessary -- with
    several uvicorn workers, each one schedules its own copy (see
    `app/core/scheduler.py`).
    """
    session = session_factory()
    try:
        cleared = UserService(UserRepository(session), now_provider).expire_codes()
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    # The count, never the codes: an access code is a credential and must not reach
    # a log file, where it would outlive the row it was wiped from.
    logger.info("Expired access codes cleared: %d", cleared)
    return cleared


def main() -> None:
    """Entry point for `python -m app.jobs.expire_codes`.

    Logging is configured here and not at import time, so that scheduling the job
    inside the API process leaves the application's own logging setup untouched --
    only the standalone run is allowed to decide where the lines go.
    """
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    run()


if __name__ == "__main__":
    main()
