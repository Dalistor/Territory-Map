"""Behaviour of `/admin/users`.

Two things are being pinned here. First, the contract: registering a publisher must
give the admin the code to hand over, because that screen is the only place it is
ever shown. Second, the boundary: none of these routes takes a `congregation_id`, so
the tenant can only come from the token -- and a publisher of another congregation
must be answered exactly like one that does not exist.
"""

from uuid import UUID, uuid4

import pytest
from app.core.security import ACCESS_CODE_ALPHABET, ACCESS_CODE_LENGTH, create_app_token
from app.models.user import User

pytestmark = pytest.mark.anyio


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def register(client, token: str, name: str = "Irmão João"):
    return await client.post("/admin/users", json={"name": name}, headers=bearer(token))


async def test_registering_a_publisher_returns_the_code_to_hand_over(client, make_admin):
    _, token = make_admin()

    response = await register(client, token, name="Irmão João")

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Irmão João"
    assert len(body["access_code"]) == ACCESS_CODE_LENGTH
    assert set(body["access_code"]) <= set(ACCESS_CODE_ALPHABET)
    assert body["access_code_expires_at"] is not None
    assert body["activated_at"] is None
    assert body["is_active"] is True


async def test_the_publisher_belongs_to_the_congregation_of_the_token(client, make_admin, session):
    congregation, token = make_admin()

    response = await register(client, token)

    stored = session.get(User, UUID(response.json()["id"]))
    assert stored.congregation_id == congregation.id


async def test_a_response_never_carries_the_internal_token_version(client, make_admin):
    """It is a revocation counter, of no use to a client and a hint about the account."""
    _, token = make_admin()

    response = await register(client, token)

    assert "token_version" not in response.json()


async def test_listing_shows_only_the_publishers_of_the_caller(client, make_admin):
    _, token = make_admin(name="Central", city="Uberlândia")
    _, other_token = make_admin(name="Norte", city="Contagem")
    await register(client, token, name="Irmão João")
    await register(client, other_token, name="Irmã Maria")

    response = await client.get("/admin/users", headers=bearer(token))

    assert response.status_code == 200
    assert [user["name"] for user in response.json()] == ["Irmão João"]


async def test_regenerating_replaces_the_code_and_kills_the_previous_one(
    client, make_admin, session
):
    _, token = make_admin()
    created = (await register(client, token)).json()

    response = await client.post(
        f"/admin/users/{created['id']}/access-code",
        headers=bearer(token),
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["access_code"]) == ACCESS_CODE_LENGTH
    assert body["access_code"] != created["access_code"]
    assert session.get(User, UUID(created["id"])).access_code == body["access_code"]


async def test_deactivating_a_publisher_reports_the_new_state(client, make_admin):
    _, token = make_admin()
    created = (await register(client, token)).json()

    response = await client.patch(
        f"/admin/users/{created['id']}",
        json={"is_active": False},
        headers=bearer(token),
    )

    assert response.status_code == 200
    assert response.json()["is_active"] is False


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        pytest.param("post", "/access-code", None, id="regenerate-code"),
        pytest.param("patch", "", {"is_active": False}, id="patch"),
    ],
)
async def test_a_publisher_of_another_congregation_is_404_and_not_403(
    client, make_admin, method, suffix, body
):
    """404, so the reply never confirms that the id names a real person elsewhere."""
    _, token = make_admin(name="Central", city="Uberlândia")
    _, other_token = make_admin(name="Norte", city="Contagem")
    stranger = (await register(client, other_token)).json()

    response = await client.request(
        method.upper(),
        f"/admin/users/{stranger['id']}{suffix}",
        json=body,
        headers=bearer(token),
    )

    assert response.status_code == 404
    assert response.json() == {
        "code": "not_found",
        "detail": (
            "Registro não encontrado. Ele pode ter sido removido — "
            "atualize a lista e tente de novo."
        ),
    }


async def test_a_publisher_that_never_existed_is_404_too(client, make_admin):
    _, token = make_admin()

    response = await client.patch(
        f"/admin/users/{uuid4()}",
        json={"is_active": True},
        headers=bearer(token),
    )

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        pytest.param("post", "/admin/users", {"name": "Irmão João"}, id="create"),
        pytest.param("get", "/admin/users", None, id="list"),
        pytest.param("post", f"/admin/users/{uuid4()}/access-code", None, id="regenerate-code"),
        pytest.param("patch", f"/admin/users/{uuid4()}", {"is_active": True}, id="patch"),
    ],
)
async def test_no_route_here_is_reachable_without_an_admin_token(client, method, path, body):
    response = await client.request(method.upper(), path, json=body)

    assert response.status_code == 401


async def test_an_app_token_never_reaches_an_admin_route(client, make_admin, session):
    """The phone's token never expires, so it must not open an admin endpoint."""
    congregation, token = make_admin()
    created = (await register(client, token)).json()
    user = session.get(User, UUID(created["id"]))

    response = await client.post(
        "/admin/users",
        json={"name": "Irmã Maria"},
        headers=bearer(create_app_token(user.id, congregation.id, user.token_version)),
    )

    assert response.status_code == 401


async def test_a_blank_name_is_rejected_before_the_service_is_reached(client, make_admin):
    _, token = make_admin()

    response = await client.post("/admin/users", json={"name": "   "}, headers=bearer(token))

    assert response.status_code == 422
