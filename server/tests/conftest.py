"""Shared fixtures for the tests that need a real database.

The geometric rules of this project are PostGIS predicates (`ST_Within`,
`ST_Touches`, `ST_Intersects`), so the services that own them are tested against a
real PostGIS instance -- the one `docker-compose.dev.yml` brings up. A fake
`ST_Within` would only ever prove that the fake behaves like the fake, and the
edge cases that actually matter here (a shared border is not an overlap, a block
drawn exactly over the territory outline is inside it) are precisely the ones a
hand-written stand-in gets wrong.

Tests that do *not* touch geometry keep using in-memory fakes and never ask for
these fixtures, so they stay as fast as they were.
"""

import os
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from app.core.config import get_settings
from app.models.congregation import Congregation
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

SERVER_ROOT = Path(__file__).resolve().parent.parent

# Point the whole test process at TEST_DATABASE_URL before anything reads the
# settings. Both `app.core.db` (which builds its engine at import time) and
# Alembic's `env.py` read DATABASE_URL, so overriding the variable once, here, is
# what guarantees a test run can never write to the development database.
os.environ["DATABASE_URL"] = get_settings().TEST_DATABASE_URL
get_settings.cache_clear()


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """Engine bound to the test database, with the schema migrated once per run."""
    command.upgrade(Config(str(SERVER_ROOT / "alembic.ini")), "head")
    engine = create_engine(get_settings().DATABASE_URL, future=True)
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    """A session inside a transaction that is always rolled back.

    The session joins an outer transaction owned by the fixture and turns its own
    `commit()` into a savepoint release, so code under test may commit while the
    database still ends the test exactly as it started it. That is what keeps the
    tests independent of each other without truncating tables between them.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def make_congregation(session: Session) -> Callable[..., Congregation]:
    """Factory for the tenant every other row hangs from.

    Nothing in the domain exists outside a congregation, and the multi-tenant rules
    need two of them side by side, so the tests build them by name rather than
    depending on a single pre-made one.
    """

    def _make(name: str = "Central", city: str = "São Paulo") -> Congregation:
        congregation = Congregation(name=name, city=city, password_hash="not-a-real-hash")
        session.add(congregation)
        session.flush()
        return congregation

    return _make
