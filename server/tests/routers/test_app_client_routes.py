"""Behaviour of `/app/territories` and `/app/blocks/{id}/worked`.

Three things are pinned here. The map the phone reads is its congregation's and
nobody else's. A marking is idempotent by the `log_id` the phone minted, because an
offline queue is flushed more than once and a second delivery must not become a
second visit. And -- the reason this file matters most -- the app token stops at
these two routes: it is the one credential in the system that never expires, so the
last test sweeps every write route under `/admin/*` and proves none of them opens.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from app.core.geo import LatLng, points_to_wkt
from app.core.security import create_app_token
from app.main import app
from app.models.block_work_log import BlockWorkLog
from app.models.user import User
from app.repositories.block import BlockRepository
from app.repositories.territory import TerritoryRepository
from sqlalchemy import func, select

pytestmark = pytest.mark.anyio

WRITE_METHODS = ("POST", "PUT", "PATCH", "DELETE")


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def square(lat: float, lng: float, side: float = 0.01) -> list[LatLng]:
    """A small axis-aligned square, the simplest valid ring to draw with."""
    return [
        LatLng(lat, lng),
        LatLng(lat, lng + side),
        LatLng(lat + side, lng + side),
        LatLng(lat + side, lng),
    ]


@pytest.fixture
def make_publisher(session):
    """Factory for an activated publisher and the app token their phone holds.

    The row is written straight rather than through the code-redemption flow: what
    these routes care about is which congregation the token resolves to, and the
    redemption itself already has its own tests.
    """

    def _make(congregation, name: str = "Irmão João") -> tuple[User, str]:
        user = User(congregation_id=congregation.id, name=name, activated_at=datetime.now(UTC))
        session.add(user)
        session.flush()
        return user, create_app_token(user.id, congregation.id, user.token_version)

    return _make


@pytest.fixture
def draw(session):
    """Factory that puts a territory, and optionally a block, on the map.

    Goes through the repositories instead of the admin routes so these tests depend
    only on what they are about -- the app's own two endpoints.
    """

    def _draw(congregation, name: str, ring: list[LatLng], block_ring: list[LatLng] | None = None):
        territory = TerritoryRepository(session).create(congregation.id, name, points_to_wkt(ring))
        block = None
        if block_ring is not None:
            block = BlockRepository(session).create(territory.id, 1, points_to_wkt(block_ring))
        return territory, block

    return _draw


def recent_moment() -> datetime:
    """A `worked_at` the service accepts: past, and well inside the 90-day window."""
    return (datetime.now(UTC) - timedelta(hours=1)).replace(microsecond=0)


async def mark(client, token: str, block_id, log_id, worked_at: datetime):
    return await client.post(
        f"/app/blocks/{block_id}/worked",
        json={"log_id": str(log_id), "worked_at": worked_at.isoformat()},
        headers=bearer(token),
    )


async def test_the_app_reads_the_territories_of_its_own_congregation_only(
    client, make_admin, make_publisher, draw
):
    """The tenant comes from the token, so another congregation's map is invisible."""
    congregation, _ = make_admin(name="Central", city="Uberlândia")
    other, _ = make_admin(name="Norte", city="Contagem")
    _, token = make_publisher(congregation)
    draw(congregation, "Centro", square(-18.90, -48.30))
    draw(other, "Bairro do vizinho", square(-19.90, -44.00))

    response = await client.get("/app/territories", headers=bearer(token))

    assert response.status_code == 200
    assert [territory["name"] for territory in response.json()] == ["Centro"]


async def test_a_territory_arrives_with_its_boundary_and_its_numbered_blocks(
    client, make_admin, make_publisher, draw
):
    """Everything the phone needs to draw the map offline, in one answer."""
    congregation, _ = make_admin()
    _, token = make_publisher(congregation)
    ring = square(-18.90, -48.30)
    draw(congregation, "Centro", ring, block_ring=square(-18.898, -48.298, side=0.002))

    response = await client.get("/app/territories", headers=bearer(token))

    territory = response.json()[0]
    assert [(point["lat"], point["lng"]) for point in territory["boundary"]] == [
        (point.lat, point.lng) for point in ring
    ]
    assert len(territory["blocks"]) == 1
    block = territory["blocks"][0]
    assert block["number"] == 1
    assert len(block["polygon"]) == 4
    assert block["last_worked_at"] is None


async def test_marking_a_block_creates_the_log_and_the_next_read_shows_it(
    client, make_admin, make_publisher, draw
):
    congregation, _ = make_admin()
    user, token = make_publisher(congregation)
    _, block = draw(
        congregation,
        "Centro",
        square(-18.90, -48.30),
        block_ring=square(-18.898, -48.298, side=0.002),
    )
    worked_at = recent_moment()

    response = await mark(client, token, block.id, uuid4(), worked_at)

    assert response.status_code == 201
    assert response.json()["user"]["id"] == str(user.id)

    read = await client.get("/app/territories", headers=bearer(token))
    reported = read.json()[0]["blocks"][0]["last_worked_at"]
    assert datetime.fromisoformat(reported) == worked_at


async def test_resending_the_same_log_id_answers_200_and_stores_nothing_new(
    client, make_admin, make_publisher, draw, session
):
    """The offline queue is flushed again after a lost reply; one visit, not two."""
    congregation, _ = make_admin()
    _, token = make_publisher(congregation)
    _, block = draw(
        congregation,
        "Centro",
        square(-18.90, -48.30),
        block_ring=square(-18.898, -48.298, side=0.002),
    )
    log_id = uuid4()
    worked_at = recent_moment()
    first = await mark(client, token, block.id, log_id, worked_at)

    second = await mark(client, token, block.id, log_id, worked_at)

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"] == str(log_id)
    stored = session.scalar(
        select(func.count()).select_from(BlockWorkLog).where(BlockWorkLog.block_id == block.id)
    )
    assert stored == 1


async def test_marking_a_block_of_another_congregation_is_404_and_not_403(
    client, make_admin, make_publisher, draw
):
    """404, so the reply never confirms that the id names a real block elsewhere."""
    congregation, _ = make_admin(name="Central", city="Uberlândia")
    other, _ = make_admin(name="Norte", city="Contagem")
    _, token = make_publisher(congregation)
    _, stranger_block = draw(
        other,
        "Bairro do vizinho",
        square(-19.90, -44.00),
        block_ring=square(-19.898, -43.998, side=0.002),
    )

    response = await mark(client, token, stranger_block.id, uuid4(), recent_moment())

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_a_block_that_never_existed_is_404_too(client, make_admin, make_publisher):
    congregation, _ = make_admin()
    _, token = make_publisher(congregation)

    response = await mark(client, token, uuid4(), uuid4(), recent_moment())

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        pytest.param("GET", "/app/territories", None, id="read-map"),
        pytest.param(
            "POST",
            f"/app/blocks/{uuid4()}/worked",
            {"log_id": str(uuid4()), "worked_at": "2026-08-02T10:00:00+00:00"},
            id="mark-worked",
        ),
    ],
)
async def test_an_admin_token_is_refused_by_the_app_routes(client, make_admin, method, path, body):
    """The two tokens are not interchangeable in either direction."""
    _, admin_token = make_admin()

    response = await client.request(method, path, json=body, headers=bearer(admin_token))

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        pytest.param("GET", "/app/territories", None, id="read-map"),
        pytest.param(
            "POST",
            f"/app/blocks/{uuid4()}/worked",
            {"log_id": str(uuid4()), "worked_at": "2026-08-02T10:00:00+00:00"},
            id="mark-worked",
        ),
    ],
)
async def test_neither_app_route_is_reachable_without_a_token(client, method, path, body):
    response = await client.request(method, path, json=body)

    assert response.status_code == 401


def admin_write_routes() -> list[tuple[str, str]]:
    """Every registered write route under `/admin/*`, as (method, path template).

    Read off the application's own OpenAPI schema rather than listed by hand, so a
    router added later is swept by the test below without anyone remembering to come
    back here -- and the schema is the one description of the routing table that does
    not change shape between Starlette versions.
    """
    return sorted(
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        if path.startswith("/admin/")
        for method in operations
        if method.upper() in WRITE_METHODS
    )


async def test_no_admin_write_route_accepts_an_app_token(client, make_admin, make_publisher):
    """The barrier the whole two-token design exists for.

    The phone's token never expires, so if a single admin write endpoint accepted it,
    a lost device would stay able to redraw the map forever. The sweep is over the
    routing table itself: it is the routing that has to be wrong for this to break,
    and a hand-written list would be exactly the thing that goes stale.
    """
    congregation, _ = make_admin()
    _, app_token = make_publisher(congregation)
    routes = admin_write_routes()
    assert routes, "no admin write route is registered -- the sweep would prove nothing"

    for method, path in routes:
        url = path.format_map({key: str(uuid4()) for key in _path_params(path)})
        response = await client.request(method, url, json={}, headers=bearer(app_token))
        assert response.status_code == 401, f"{method} {path} answered {response.status_code}"


def _path_params(path: str) -> set[str]:
    """The `{name}` placeholders of a route template."""
    return {segment[1:-1] for segment in path.split("/") if segment.startswith("{")}


async def test_drawing_a_territory_with_an_app_token_is_401(client, make_admin, make_publisher):
    """The named case of the sweep above: the app may never demarcate anything."""
    congregation, _ = make_admin()
    _, app_token = make_publisher(congregation)

    response = await client.post(
        "/admin/territories",
        json={
            "name": "Centro",
            "boundary": [{"lat": point.lat, "lng": point.lng} for point in square(-18.90, -48.30)],
        },
        headers=bearer(app_token),
    )

    assert response.status_code == 401
