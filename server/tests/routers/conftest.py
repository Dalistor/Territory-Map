"""Fixtures shared by the route tests.

These tests drive the real application -- the same `app` uvicorn serves, with its
real routers, its real dependencies and its real error handler -- over
`httpx.ASGITransport`, so the request goes through the whole stack without a socket.
The only thing swapped out is the database session, which is redirected to the
rolled-back transaction of the `session` fixture; everything else, including
authentication and the domain-error translation, is production code.
"""

from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime

import httpx
import pytest
from app.core.db import get_session
from app.core.rate_limit import limiter
from app.core.security import create_admin_token, hash_password
from app.main import app
from app.models.congregation import Congregation
from sqlalchemy.orm import Session


@pytest.fixture
def anyio_backend() -> str:
    """Run the async tests of this package on asyncio only, not also on trio."""
    return "asyncio"


@pytest.fixture(autouse=True)
def fresh_rate_limit_counters():
    """Give every route test its own throttle budget.

    The limiter counts in memory, in the process, and every test here calls the app
    from the same address -- so without this the quota would be spent by whichever
    tests happened to run first in the minute, and a test would fail because of its
    neighbours rather than because of the code. Cleared afterwards too, so a test
    that deliberately exhausts a limit does not hand the next one an empty budget it
    did not ask for.
    """
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
async def client(session: Session) -> AsyncIterator[httpx.AsyncClient]:
    """An HTTP client wired straight into the ASGI app, on the test transaction."""
    app.dependency_overrides[get_session] = lambda: session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as http_client:
        yield http_client
    app.dependency_overrides.clear()


@pytest.fixture
def make_admin(session: Session) -> Callable[..., tuple[Congregation, str]]:
    """Factory for a congregation with a real password digest and its admin token.

    The password is hashed for real rather than stubbed: the login route exists to
    verify it, and a fake digest would make the happy path untestable.
    """

    def _make(
        name: str = "Central",
        city: str = "São Paulo",
        password: str = "senha-do-admin",
    ) -> tuple[Congregation, str]:
        congregation = Congregation(name=name, city=city, password_hash=hash_password(password))
        session.add(congregation)
        session.flush()
        token = create_admin_token(congregation.id, datetime.now(UTC))
        return congregation, token

    return _make
