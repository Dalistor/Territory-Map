"""Behaviour of the admin's block routes and of the work history hanging off them.

A block is reached by its own id, with no territory and no congregation in the path,
so these tests care above all about what that id may open: a block of another
congregation has to come back 404, exactly like one that was never drawn.

The rest is the translation of the drawing rules -- a number already taken is a
conflict, an outline that leaves the territory is unprocessable -- and the one write
the admin has over the history the app can only append to.
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from app.models.block import Block
from app.models.block_work_log import BlockWorkLog
from app.models.user import User

pytestmark = pytest.mark.anyio

WORKED_AT = datetime(2026, 7, 20, 15, 30, tzinfo=UTC)


def square(lat: float, lng: float, size: float = 1.0) -> list[dict[str, float]]:
    """A square ring whose south-west corner is `(lat, lng)`, as the wire carries it.

    The far corners are rounded because binary floats do not add decimals exactly
    (`0.2 + 0.1` is `0.30000000000000004`) and PostGIS hands the coordinate back at
    its own precision -- rounding keeps the comparison about the geometry.
    """
    far_lat, far_lng = round(lat + size, 9), round(lng + size, 9)
    return [
        {"lat": lat, "lng": lng},
        {"lat": lat, "lng": far_lng},
        {"lat": far_lat, "lng": far_lng},
        {"lat": far_lat, "lng": lng},
    ]


# A ring in the shape of an 8: four points that pass Pydantic's "at least three
# positions" and are refused by `validate_polygon` for crossing themselves.
BOWTIE = [
    {"lat": 0.1, "lng": 0.1},
    {"lat": 0.3, "lng": 0.3},
    {"lat": 0.1, "lng": 0.3},
    {"lat": 0.3, "lng": 0.1},
]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def draw_territory(client, token: str, name: str = "Centro", size: float = 1.0) -> str:
    response = await client.post(
        "/admin/territories",
        json={"name": name, "boundary": square(0.0, 0.0, size)},
        headers=bearer(token),
    )
    return response.json()["id"]


async def draw_block(client, token: str, territory_id: str, polygon=None, number=None):
    body: dict = {"polygon": polygon if polygon is not None else square(0.1, 0.1, size=0.2)}
    if number is not None:
        body["number"] = number
    return await client.post(
        f"/admin/territories/{territory_id}/blocks",
        json=body,
        headers=bearer(token),
    )


@pytest.fixture
def make_publisher(session):
    """A publisher row, straight through the session.

    Registering one over HTTP would work, but the work log only needs somebody to
    point at -- going through `/admin/users` would tie these tests to a route that
    has its own suite.
    """

    def _make(congregation_id: UUID, name: str = "Irmão João") -> User:
        user = User(congregation_id=congregation_id, name=name)
        session.add(user)
        session.flush()
        return user

    return _make


@pytest.fixture
def record_work(session):
    """Put a visit in the history the way a synced phone would have left it.

    `POST /app/blocks/{id}/worked` belongs to another task, so the log is written
    directly -- including the `last_worked_at` projection, so that deleting the log
    through the admin route has something real to undo.
    """

    def _record(block_id: UUID, user: User, worked_at: datetime = WORKED_AT) -> BlockWorkLog:
        log = BlockWorkLog(id=uuid4(), block_id=block_id, user_id=user.id, worked_at=worked_at)
        session.add(log)
        block = session.get(Block, block_id)
        block.last_worked_at = worked_at
        session.flush()
        return log

    return _record


async def test_drawing_a_block_returns_it_numbered_and_never_worked(client, make_admin):
    _, token = make_admin()
    territory_id = await draw_territory(client, token)
    outline = square(0.1, 0.1, size=0.2)

    response = await draw_block(client, token, territory_id, polygon=outline)

    assert response.status_code == 201
    body = response.json()
    assert body["number"] == 1
    assert body["polygon"] == outline
    assert body["last_worked_at"] is None


async def test_the_suggested_number_fills_the_first_gap(client, make_admin):
    """Numbering comes from the paper map, so it arrives with holes to fill."""
    _, token = make_admin()
    territory_id = await draw_territory(client, token)
    await draw_block(client, token, territory_id, polygon=square(0.1, 0.1, 0.2), number=1)
    await draw_block(client, token, territory_id, polygon=square(0.4, 0.1, 0.2), number=2)
    await draw_block(client, token, territory_id, polygon=square(0.7, 0.1, 0.2), number=4)

    response = await draw_block(client, token, territory_id, polygon=square(0.1, 0.4, 0.2))

    assert response.status_code == 201
    assert response.json()["number"] == 3


async def test_a_number_already_used_in_the_territory_is_409(client, make_admin):
    _, token = make_admin()
    territory_id = await draw_territory(client, token)
    await draw_block(client, token, territory_id, polygon=square(0.1, 0.1, 0.2), number=5)

    response = await draw_block(
        client, token, territory_id, polygon=square(0.5, 0.5, 0.2), number=5
    )

    assert response.status_code == 409
    assert response.json()["code"] == "duplicate_block_number"


async def test_the_same_number_in_another_territory_is_accepted(client, make_admin):
    _, token = make_admin()
    first = await draw_territory(client, token, name="Centro", size=1.0)
    second = (
        await client.post(
            "/admin/territories",
            json={"name": "Norte", "boundary": square(2.0, 2.0)},
            headers=bearer(token),
        )
    ).json()["id"]
    await draw_block(client, token, first, polygon=square(0.1, 0.1, 0.2), number=1)

    response = await draw_block(client, token, second, polygon=square(2.1, 2.1, 0.2), number=1)

    assert response.status_code == 201


async def test_an_outline_leaving_the_territory_is_422(client, make_admin):
    _, token = make_admin()
    territory_id = await draw_territory(client, token)

    response = await draw_block(client, token, territory_id, polygon=square(0.9, 0.9, size=0.5))

    assert response.status_code == 422
    assert response.json()["code"] == "block_outside_territory"


async def test_a_self_intersecting_outline_is_422(client, make_admin):
    _, token = make_admin()
    territory_id = await draw_territory(client, token)

    response = await draw_block(client, token, territory_id, polygon=BOWTIE)

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_polygon"


async def test_an_outline_invading_a_sibling_is_422(client, make_admin):
    _, token = make_admin()
    territory_id = await draw_territory(client, token)
    await draw_block(client, token, territory_id, polygon=square(0.1, 0.1, 0.2))

    response = await draw_block(client, token, territory_id, polygon=square(0.2, 0.2, 0.2))

    assert response.status_code == 422
    assert response.json()["code"] == "block_overlap"


async def test_drawing_inside_a_territory_of_another_congregation_is_404(client, make_admin):
    _, token = make_admin(name="Central", city="Uberlândia")
    _, other_token = make_admin(name="Norte", city="Contagem")
    stranger_territory = await draw_territory(client, other_token, name="Vila Rica")

    response = await draw_block(client, token, stranger_territory)

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_reshaping_a_block_does_not_conflict_with_itself(client, make_admin):
    _, token = make_admin()
    territory_id = await draw_territory(client, token)
    block = (await draw_block(client, token, territory_id, polygon=square(0.1, 0.1, 0.2))).json()
    reshaped = square(0.1, 0.1, size=0.4)

    response = await client.patch(
        f"/admin/blocks/{block['id']}",
        json={"number": 9, "polygon": reshaped},
        headers=bearer(token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["number"] == 9
    assert body["polygon"] == reshaped


async def test_deleting_a_block_answers_204_and_it_leaves_the_territory(client, make_admin):
    _, token = make_admin()
    territory_id = await draw_territory(client, token)
    block = (await draw_block(client, token, territory_id)).json()

    response = await client.delete(f"/admin/blocks/{block['id']}", headers=bearer(token))

    assert response.status_code == 204
    assert response.content == b""
    detail = await client.get(f"/admin/territories/{territory_id}", headers=bearer(token))
    assert detail.json()["blocks"] == []


async def test_the_history_of_a_block_names_the_publisher(
    client, make_admin, make_publisher, record_work
):
    congregation, token = make_admin()
    territory_id = await draw_territory(client, token)
    block = (await draw_block(client, token, territory_id)).json()
    publisher = make_publisher(congregation.id, name="Irmã Maria")
    record_work(UUID(block["id"]), publisher)

    response = await client.get(f"/admin/blocks/{block['id']}/work-logs", headers=bearer(token))

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["user"]["name"] == "Irmã Maria"
    assert body[0]["block_id"] == block["id"]
    assert "access_code" not in body[0]["user"]


async def test_deleting_a_visit_gives_the_block_back_its_previous_state(
    client, make_admin, make_publisher, record_work, session
):
    congregation, token = make_admin()
    territory_id = await draw_territory(client, token)
    block = (await draw_block(client, token, territory_id)).json()
    log = record_work(UUID(block["id"]), make_publisher(congregation.id))

    response = await client.delete(f"/admin/work-logs/{log.id}", headers=bearer(token))

    assert response.status_code == 204
    assert session.get(Block, UUID(block["id"])).last_worked_at is None
    history = await client.get(f"/admin/blocks/{block['id']}/work-logs", headers=bearer(token))
    assert history.json() == []


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        pytest.param("patch", "", {"number": 3}, id="patch"),
        pytest.param("delete", "", None, id="delete"),
        pytest.param("get", "/work-logs", None, id="work-logs"),
    ],
)
async def test_a_block_of_another_congregation_is_404_and_not_403(
    client, make_admin, method, suffix, body
):
    _, token = make_admin(name="Central", city="Uberlândia")
    _, other_token = make_admin(name="Norte", city="Contagem")
    stranger_territory = await draw_territory(client, other_token, name="Vila Rica")
    stranger_block = (await draw_block(client, other_token, stranger_territory)).json()

    response = await client.request(
        method.upper(),
        f"/admin/blocks/{stranger_block['id']}{suffix}",
        json=body,
        headers=bearer(token),
    )

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_a_visit_of_another_congregation_is_404(
    client, make_admin, make_publisher, record_work
):
    _, token = make_admin(name="Central", city="Uberlândia")
    other, other_token = make_admin(name="Norte", city="Contagem")
    stranger_territory = await draw_territory(client, other_token, name="Vila Rica")
    stranger_block = (await draw_block(client, other_token, stranger_territory)).json()
    log = record_work(UUID(stranger_block["id"]), make_publisher(other.id))

    response = await client.delete(f"/admin/work-logs/{log.id}", headers=bearer(token))

    assert response.status_code == 404


async def test_a_block_that_never_existed_is_404_too(client, make_admin):
    _, token = make_admin()

    response = await client.get(f"/admin/blocks/{uuid4()}/work-logs", headers=bearer(token))

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        pytest.param(
            "post",
            f"/admin/territories/{uuid4()}/blocks",
            {"polygon": square(0.1, 0.1, 0.2)},
            id="create",
        ),
        pytest.param("patch", f"/admin/blocks/{uuid4()}", {"number": 1}, id="patch"),
        pytest.param("delete", f"/admin/blocks/{uuid4()}", None, id="delete"),
        pytest.param("get", f"/admin/blocks/{uuid4()}/work-logs", None, id="work-logs"),
        pytest.param("delete", f"/admin/work-logs/{uuid4()}", None, id="delete-work-log"),
    ],
)
async def test_no_route_here_is_reachable_without_an_admin_token(client, method, path, body):
    response = await client.request(method.upper(), path, json=body)

    assert response.status_code == 401
