"""Fixtures for the end-to-end tests.

What separates these tests from the route tests one folder over is that nothing is
short-circuited. A route test may seed a territory through a repository, because what
it is proving is one endpoint's behaviour; here every row that *can* be created over
HTTP is created over HTTP, in the order a real admin and a real phone would create it.
The only thing written straight into the database is the congregation, because the API
has no endpoint that creates one -- a congregation is provisioned, not signed up.

Two properties make these flows worth running at all, and both come from this module:

*Real everything.* The app is the one `uvicorn` serves, with its real routers, real
authentication, real error translation and real rate limiter, driven over
`httpx.ASGITransport` so the request crosses the whole stack without needing a socket.
The database is the real PostGIS of `docker-compose.dev.yml` -- the geometric rules
these flows depend on (a block inside its territory, two congregations legitimately
covering the same streets) are PostGIS predicates, and a stand-in would be testing the
stand-in.

*One transaction per request, exactly as in production.* `get_session` is overridden by
a generator that commits on success and rolls back on failure, just like the real one,
so a request that fails a business rule leaves nothing half-written. That is not a
detail here: one of these flows asserts precisely that a rejected redraw changed
nothing, and a fixture that merely handed out a session would prove that about the
session rather than about the database.

The whole test still starts from a clean database and leaves nothing behind: the
session of the root `conftest.py` lives inside an outer transaction that is always
rolled back, and joins it with `create_savepoint`, so each `commit()` here releases a
savepoint instead of writing for real. `register_congregation` commits for the same
reason -- it turns the seeded row into something a later failed request cannot roll
back with it.
"""

from collections.abc import AsyncIterator, Callable, Iterator
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from app.core.db import get_session
from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.main import app
from app.models.congregation import Congregation
from sqlalchemy.orm import Session

#: The password every seeded congregation is given, so a flow that only needs *an*
#: admin does not have to invent one to log in with.
ADMIN_PASSWORD = "senha-do-admin"

Ring = list[dict[str, float]]


@pytest.fixture
def anyio_backend() -> str:
    """Run these async tests on asyncio only, not also on trio."""
    return "asyncio"


@pytest.fixture(autouse=True)
def fresh_rate_limit_counters() -> Iterator[None]:
    """Give every flow its own throttle budget.

    The limiter counts in memory, per process, and every test here calls the app from
    the same address. Several of these flows log in and redeem codes more than once, so
    without this a test would fail because of whatever ran before it in the same minute.
    Cleared afterwards too, so a flow does not hand the next one a spent budget.
    """
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
async def client(session: Session) -> AsyncIterator[httpx.AsyncClient]:
    """An HTTP client wired into the real ASGI app, one transaction per request."""

    def request_session() -> Iterator[Session]:
        # The same contract as `app.core.db.get_session`: commit when the endpoint
        # returned, roll back when anything raised. `close()` is deliberately left out
        # -- the session belongs to the test, not to the request, and every flow here
        # makes several requests over it.
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise

    app.dependency_overrides[get_session] = request_session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as http_client:
        yield http_client
    app.dependency_overrides.clear()


@pytest.fixture
def register_congregation(session: Session) -> Callable[..., Congregation]:
    """Provision a congregation -- the one row no endpoint creates.

    The password is hashed for real because the flows sign in through `/auth/login`,
    which exists to verify it. Committed rather than flushed so that a later request
    that rolls back cannot take the tenant with it.
    """

    def _register(
        name: str = "Central",
        city: str = "Uberlândia",
        password: str = ADMIN_PASSWORD,
    ) -> Congregation:
        congregation = Congregation(name=name, city=city, password_hash=hash_password(password))
        session.add(congregation)
        session.commit()
        return congregation

    return _register


@pytest.fixture
def square() -> Callable[..., Ring]:
    """Factory for a small axis-aligned square, ready to be sent as JSON.

    The simplest ring that is a valid polygon, and the shape the flows below draw
    territories and blocks with. Sides are given in degrees; at these latitudes 0.01°
    is roughly a kilometre, which is about the size of a real territory.
    """

    def _square(lat: float, lng: float, side: float = 0.01) -> Ring:
        return [
            {"lat": lat, "lng": lng},
            {"lat": lat, "lng": lng + side},
            {"lat": lat + side, "lng": lng + side},
            {"lat": lat + side, "lng": lng},
        ]

    return _square


def bearer(token: str) -> dict[str, str]:
    """The `Authorization` header both kinds of token travel in."""
    return {"Authorization": f"Bearer {token}"}


@dataclass(frozen=True)
class Api:
    """Every call these flows make, named after what the person doing it is doing.

    A thin wrapper on purpose: each method returns the raw `httpx.Response`, so the
    tests keep asserting status codes and bodies themselves. What it removes is the
    URL and header noise that would otherwise bury the narrative each flow is telling.
    """

    client: httpx.AsyncClient

    # -- the two public routes ------------------------------------------------

    async def login(
        self,
        name: str,
        city: str,
        password: str = ADMIN_PASSWORD,
    ) -> httpx.Response:
        return await self.client.post(
            "/auth/login",
            json={"name": name, "city": city, "password": password},
        )

    async def activate(self, access_code: str) -> httpx.Response:
        return await self.client.post("/app/activate", json={"access_code": access_code})

    # -- what the admin does --------------------------------------------------

    async def register_publisher(self, admin_token: str, name: str) -> httpx.Response:
        return await self.client.post(
            "/admin/users",
            json={"name": name},
            headers=bearer(admin_token),
        )

    async def list_publishers(self, admin_token: str) -> httpx.Response:
        return await self.client.get("/admin/users", headers=bearer(admin_token))

    async def new_access_code(self, admin_token: str, user_id: UUID | str) -> httpx.Response:
        return await self.client.post(
            f"/admin/users/{user_id}/access-code",
            headers=bearer(admin_token),
        )

    async def set_publisher_active(
        self,
        admin_token: str,
        user_id: UUID | str,
        *,
        is_active: bool,
    ) -> httpx.Response:
        return await self.client.patch(
            f"/admin/users/{user_id}",
            json={"is_active": is_active},
            headers=bearer(admin_token),
        )

    async def draw_territory(self, admin_token: str, name: str, ring: Ring) -> httpx.Response:
        return await self.client.post(
            "/admin/territories",
            json={"name": name, "boundary": ring},
            headers=bearer(admin_token),
        )

    async def list_territories(self, admin_token: str) -> httpx.Response:
        return await self.client.get("/admin/territories", headers=bearer(admin_token))

    async def read_territory(self, admin_token: str, territory_id: UUID | str) -> httpx.Response:
        return await self.client.get(
            f"/admin/territories/{territory_id}",
            headers=bearer(admin_token),
        )

    async def redraw_territory(
        self,
        admin_token: str,
        territory_id: UUID | str,
        ring: Ring,
    ) -> httpx.Response:
        return await self.client.patch(
            f"/admin/territories/{territory_id}",
            json={"boundary": ring},
            headers=bearer(admin_token),
        )

    async def delete_territory(self, admin_token: str, territory_id: UUID | str) -> httpx.Response:
        return await self.client.delete(
            f"/admin/territories/{territory_id}",
            headers=bearer(admin_token),
        )

    async def draw_block(
        self,
        admin_token: str,
        territory_id: UUID | str,
        ring: Ring,
        number: int | None = None,
    ) -> httpx.Response:
        body: dict[str, Any] = {"polygon": ring}
        if number is not None:
            body["number"] = number
        return await self.client.post(
            f"/admin/territories/{territory_id}/blocks",
            json=body,
            headers=bearer(admin_token),
        )

    async def work_logs(self, admin_token: str, block_id: UUID | str) -> httpx.Response:
        return await self.client.get(
            f"/admin/blocks/{block_id}/work-logs",
            headers=bearer(admin_token),
        )

    # -- what the phone does --------------------------------------------------

    async def read_map(self, app_token: str) -> httpx.Response:
        return await self.client.get("/app/territories", headers=bearer(app_token))

    async def mark_worked(
        self,
        app_token: str,
        block_id: UUID | str,
        worked_at: datetime,
        log_id: UUID | None = None,
    ) -> httpx.Response:
        return await self.client.post(
            f"/app/blocks/{block_id}/worked",
            json={"log_id": str(log_id or uuid4()), "worked_at": worked_at.isoformat()},
            headers=bearer(app_token),
        )


@pytest.fixture
def api(client: httpx.AsyncClient) -> Api:
    """The API as the two clients see it."""
    return Api(client)
