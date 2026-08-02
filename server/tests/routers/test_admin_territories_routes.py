"""Behaviour of `/admin/territories`.

These tests drive the real app over the real PostGIS, so what they pin is the
translation layer rather than the geometry: a drawing that breaks a rule has to reach
the admin as the right status and the right `code`, and the demarcation has to survive
the round trip through WKT with its points in the order they were drawn.

The other half is the boundary between congregations. No route here takes a
`congregation_id`, so a territory of somebody else must be answered 404 -- a 403 would
already confirm that the id names a real area.
"""

from uuid import uuid4

import pytest

pytestmark = pytest.mark.anyio


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
    {"lat": 0.0, "lng": 0.0},
    {"lat": 1.0, "lng": 1.0},
    {"lat": 0.0, "lng": 1.0},
    {"lat": 1.0, "lng": 0.0},
]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def draw(client, token: str, name: str = "Centro", boundary=None):
    return await client.post(
        "/admin/territories",
        json={"name": name, "boundary": boundary if boundary is not None else square(0.0, 0.0)},
        headers=bearer(token),
    )


async def test_drawing_a_territory_returns_it_with_the_points_in_order(client, make_admin):
    _, token = make_admin()
    boundary = square(-19.0, -48.0, size=0.1)

    response = await draw(client, token, name="Centro", boundary=boundary)

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Centro"
    assert body["boundary"] == boundary
    assert body["blocks"] == []


async def test_a_self_intersecting_drawing_is_422_and_says_which_rule_broke(client, make_admin):
    _, token = make_admin()

    response = await draw(client, token, boundary=BOWTIE)

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_polygon"
    assert "cruzam" in response.json()["detail"]


async def test_a_ring_with_two_points_never_reaches_the_service(client, make_admin):
    """Shape is the DTO's job: a ring shorter than three positions fails validation."""
    _, token = make_admin()

    response = await draw(
        client, token, boundary=[{"lat": 0.0, "lng": 0.0}, {"lat": 1.0, "lng": 1.0}]
    )

    assert response.status_code == 422


async def test_a_demarcation_invading_another_territory_is_422(client, make_admin):
    _, token = make_admin()
    await draw(client, token, name="Centro", boundary=square(0.0, 0.0))

    response = await draw(client, token, name="Norte", boundary=square(0.5, 0.5))

    assert response.status_code == 422
    assert response.json()["code"] == "territory_overlap"


async def test_a_demarcation_that_only_touches_the_neighbour_is_accepted(client, make_admin):
    """Adjacent territories are supposed to share a border; only interiors may not meet."""
    _, token = make_admin()
    await draw(client, token, name="Centro", boundary=square(0.0, 0.0))

    response = await draw(client, token, name="Norte", boundary=square(1.0, 0.0))

    assert response.status_code == 201


async def test_the_same_area_in_another_congregation_does_not_conflict(client, make_admin):
    _, token = make_admin(name="Central", city="Uberlândia")
    _, other_token = make_admin(name="Norte", city="Contagem")
    await draw(client, other_token, name="Centro", boundary=square(0.0, 0.0))

    response = await draw(client, token, name="Centro", boundary=square(0.0, 0.0))

    assert response.status_code == 201


async def test_a_repeated_name_inside_the_congregation_is_409(client, make_admin):
    _, token = make_admin()
    await draw(client, token, name="Centro", boundary=square(0.0, 0.0))

    response = await draw(client, token, name="Centro", boundary=square(5.0, 5.0))

    assert response.status_code == 409
    assert response.json()["code"] == "duplicate_name"


async def test_listing_shows_only_the_territories_of_the_caller(client, make_admin):
    _, token = make_admin(name="Central", city="Uberlândia")
    _, other_token = make_admin(name="Norte", city="Contagem")
    await draw(client, token, name="Centro", boundary=square(0.0, 0.0))
    await draw(client, other_token, name="Vila Rica", boundary=square(0.0, 0.0))

    response = await client.get("/admin/territories", headers=bearer(token))

    assert response.status_code == 200
    assert [territory["name"] for territory in response.json()] == ["Centro"]


async def test_reading_one_territory_brings_its_blocks(client, make_admin):
    """The editing screen is drawn from this response, so the outlines come along."""
    _, token = make_admin()
    territory = (await draw(client, token, boundary=square(0.0, 0.0))).json()
    outline = square(0.1, 0.1, size=0.2)
    await client.post(
        f"/admin/territories/{territory['id']}/blocks",
        json={"number": 7, "polygon": outline},
        headers=bearer(token),
    )

    response = await client.get(f"/admin/territories/{territory['id']}", headers=bearer(token))

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Centro"
    assert [block["number"] for block in body["blocks"]] == [7]
    assert body["blocks"][0]["polygon"] == outline
    assert body["blocks"][0]["last_worked_at"] is None


async def test_redrawing_a_territory_does_not_conflict_with_itself(client, make_admin):
    _, token = make_admin()
    territory = (await draw(client, token, boundary=square(0.0, 0.0))).json()
    redrawn = square(0.0, 0.0, size=2.0)

    response = await client.patch(
        f"/admin/territories/{territory['id']}",
        json={"boundary": redrawn},
        headers=bearer(token),
    )

    assert response.status_code == 200
    assert response.json()["boundary"] == redrawn


async def test_shrinking_past_a_block_is_422_and_names_the_block(client, make_admin):
    _, token = make_admin()
    territory = (await draw(client, token, boundary=square(0.0, 0.0))).json()
    await client.post(
        f"/admin/territories/{territory['id']}/blocks",
        json={"number": 12, "polygon": square(0.7, 0.7, size=0.2)},
        headers=bearer(token),
    )

    response = await client.patch(
        f"/admin/territories/{territory['id']}",
        json={"boundary": square(0.0, 0.0, size=0.5)},
        headers=bearer(token),
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "block_outside_territory"
    assert "12" in body["detail"]


async def test_deleting_a_territory_answers_204_and_it_is_gone(client, make_admin):
    _, token = make_admin()
    territory = (await draw(client, token)).json()

    response = await client.delete(f"/admin/territories/{territory['id']}", headers=bearer(token))

    assert response.status_code == 204
    assert response.content == b""
    follow_up = await client.get(f"/admin/territories/{territory['id']}", headers=bearer(token))
    assert follow_up.status_code == 404


@pytest.mark.parametrize(
    ("method", "body"),
    [
        pytest.param("get", None, id="read"),
        pytest.param("patch", {"name": "Roubado"}, id="patch"),
        pytest.param("delete", None, id="delete"),
    ],
)
async def test_a_territory_of_another_congregation_is_404_and_not_403(
    client, make_admin, method, body
):
    _, token = make_admin(name="Central", city="Uberlândia")
    _, other_token = make_admin(name="Norte", city="Contagem")
    stranger = (await draw(client, other_token, name="Vila Rica")).json()

    response = await client.request(
        method.upper(),
        f"/admin/territories/{stranger['id']}",
        json=body,
        headers=bearer(token),
    )

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_a_territory_that_never_existed_is_404_too(client, make_admin):
    _, token = make_admin()

    response = await client.get(f"/admin/territories/{uuid4()}", headers=bearer(token))

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        pytest.param(
            "post",
            "/admin/territories",
            {"name": "Centro", "boundary": square(0.0, 0.0)},
            id="create",
        ),
        pytest.param("get", "/admin/territories", None, id="list"),
        pytest.param("get", f"/admin/territories/{uuid4()}", None, id="read"),
        pytest.param("patch", f"/admin/territories/{uuid4()}", {"name": "Centro"}, id="patch"),
        pytest.param("delete", f"/admin/territories/{uuid4()}", None, id="delete"),
    ],
)
async def test_no_route_here_is_reachable_without_an_admin_token(client, method, path, body):
    response = await client.request(method.upper(), path, json=body)

    assert response.status_code == 401
