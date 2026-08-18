"""Behaviour of the admin's assignment routes -- the S-13 card, over HTTP.

The rules of who may hold a territory and what closing a stint does to the
`assigned_user` projection belong to `AssignmentService` and are tested there. What
these tests care about is the layer above: the paths, the status codes each write
answers with, and the congregation boundary -- a territory of somebody else has to
come back 404 rather than 403, so the reply never confirms that the id names a real
area somewhere.
"""

from uuid import uuid4

import pytest
from app.models.user import User

pytestmark = pytest.mark.anyio

SQUARE = [
    {"lat": 0.0, "lng": 0.0},
    {"lat": 0.0, "lng": 1.0},
    {"lat": 1.0, "lng": 1.0},
    {"lat": 1.0, "lng": 0.0},
]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def draw_territory(client, token: str, name: str = "Centro") -> str:
    response = await client.post(
        "/admin/territories",
        json={"name": name, "boundary": SQUARE},
        headers=bearer(token),
    )
    return response.json()["id"]


@pytest.fixture
def make_publisher(session):
    """A publisher row, straight through the session.

    Registering one over `/admin/users` would work, but these tests only need
    somebody to hand a territory to -- going through that route would tie them to a
    endpoint that has its own suite.
    """

    def _make(congregation_id, name: str = "Irmão João") -> User:
        user = User(congregation_id=congregation_id, name=name)
        session.add(user)
        session.flush()
        return user

    return _make


async def test_designating_answers_201_with_the_open_stint(client, make_admin, make_publisher):
    congregation, token = make_admin()
    territory_id = await draw_territory(client, token)
    publisher = make_publisher(congregation.id, name="Irmã Maria")

    response = await client.post(
        f"/admin/territories/{territory_id}/assignments",
        json={"user_id": str(publisher.id)},
        headers=bearer(token),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["name"] == "Irmã Maria"
    assert body["started_at"] is not None
    assert body["completed_at"] is None


async def test_the_history_lists_every_stint_most_recent_first(client, make_admin, make_publisher):
    congregation, token = make_admin()
    territory_id = await draw_territory(client, token)
    first = make_publisher(congregation.id, name="Irmão João")
    second = make_publisher(congregation.id, name="Irmã Maria")
    for publisher in (first, second):
        await client.post(
            f"/admin/territories/{territory_id}/assignments",
            json={"user_id": str(publisher.id)},
            headers=bearer(token),
        )

    response = await client.get(
        f"/admin/territories/{territory_id}/assignments", headers=bearer(token)
    )

    assert response.status_code == 200
    body = response.json()
    assert [entry["user"]["name"] for entry in body] == ["Irmã Maria", "Irmão João"]
    assert body[0]["completed_at"] is None
    assert body[1]["completed_at"] is not None


async def test_completing_returns_the_stint_it_just_closed(client, make_admin, make_publisher):
    congregation, token = make_admin()
    territory_id = await draw_territory(client, token)
    publisher = make_publisher(congregation.id)
    await client.post(
        f"/admin/territories/{territory_id}/assignments",
        json={"user_id": str(publisher.id)},
        headers=bearer(token),
    )

    response = await client.post(
        f"/admin/territories/{territory_id}/assignments/complete", headers=bearer(token)
    )

    assert response.status_code == 200
    assert response.json()["completed_at"] is not None
    detail = await client.get(f"/admin/territories/{territory_id}", headers=bearer(token))
    assert detail.json()["assigned_user"] is None


async def test_completing_with_nothing_in_force_is_404(client, make_admin):
    _, token = make_admin()
    territory_id = await draw_territory(client, token)

    response = await client.post(
        f"/admin/territories/{territory_id}/assignments/complete", headers=bearer(token)
    )

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_deleting_a_record_answers_204_and_frees_the_territory(
    client, make_admin, make_publisher
):
    congregation, token = make_admin()
    territory_id = await draw_territory(client, token)
    publisher = make_publisher(congregation.id)
    assignment = (
        await client.post(
            f"/admin/territories/{territory_id}/assignments",
            json={"user_id": str(publisher.id)},
            headers=bearer(token),
        )
    ).json()

    response = await client.delete(
        f"/admin/territories/{territory_id}/assignments/{assignment['id']}",
        headers=bearer(token),
    )

    assert response.status_code == 204
    assert response.content == b""
    history = await client.get(
        f"/admin/territories/{territory_id}/assignments", headers=bearer(token)
    )
    assert history.json() == []
    detail = await client.get(f"/admin/territories/{territory_id}", headers=bearer(token))
    assert detail.json()["assigned_user"] is None


async def test_a_publisher_of_another_congregation_cannot_be_designated(
    client, make_admin, make_publisher
):
    _, token = make_admin(name="Central", city="Uberlândia")
    other, _ = make_admin(name="Norte", city="Contagem")
    territory_id = await draw_territory(client, token)
    stranger = make_publisher(other.id)

    response = await client.post(
        f"/admin/territories/{territory_id}/assignments",
        json={"user_id": str(stranger.id)},
        headers=bearer(token),
    )

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        pytest.param("get", "", None, id="list"),
        pytest.param("post", "", {"user_id": str(uuid4())}, id="designate"),
        pytest.param("post", "/complete", None, id="complete"),
        pytest.param("delete", f"/{uuid4()}", None, id="delete"),
    ],
)
async def test_a_territory_of_another_congregation_is_404_and_not_403(
    client, make_admin, method, suffix, body
):
    _, token = make_admin(name="Central", city="Uberlândia")
    _, other_token = make_admin(name="Norte", city="Contagem")
    stranger_territory = await draw_territory(client, other_token, name="Vila Rica")

    response = await client.request(
        method.upper(),
        f"/admin/territories/{stranger_territory}/assignments{suffix}",
        json=body,
        headers=bearer(token),
    )

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        pytest.param("get", "", None, id="list"),
        pytest.param("post", "", {"user_id": str(uuid4())}, id="designate"),
        pytest.param("post", "/complete", None, id="complete"),
        pytest.param("delete", f"/{uuid4()}", None, id="delete"),
    ],
)
async def test_no_route_here_is_reachable_without_an_admin_token(client, method, suffix, body):
    response = await client.request(
        method.upper(),
        f"/admin/territories/{uuid4()}/assignments{suffix}",
        json=body,
    )

    assert response.status_code == 401
