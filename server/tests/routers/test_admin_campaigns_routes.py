"""Behaviour of the admin's campaign routes over HTTP.

The rules -- what designating does to every card, which conflicts refuse it -- belong
to `CampaignService` and are tested there. These tests care about the layer above: the
paths, the shape of the replies, the status each domain error becomes, and the
congregation boundary (another congregation's campaign is 404, never 403).
"""

from uuid import uuid4

import pytest
from app.models.user import User

pytestmark = pytest.mark.anyio


def ring(lat: float) -> list[dict[str, float]]:
    return [
        {"lat": lat, "lng": 0.0},
        {"lat": lat, "lng": 1.0},
        {"lat": lat + 1.0, "lng": 1.0},
        {"lat": lat + 1.0, "lng": 0.0},
    ]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def draw_territory(client, token: str, name: str, lat: float) -> str:
    response = await client.post(
        "/admin/territories", json={"name": name, "boundary": ring(lat)}, headers=bearer(token)
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.fixture
def make_publisher(session):
    def _make(congregation_id, name: str) -> User:
        user = User(congregation_id=congregation_id, name=name)
        session.add(user)
        session.flush()
        return user

    return _make


@pytest.fixture
async def scene(client, make_admin, make_publisher):
    congregation, token = make_admin()
    return {
        "token": token,
        "n3": await draw_territory(client, token, "N3", 0.0),
        "n5": await draw_territory(client, token, "N5", 2.0),
        "ana": make_publisher(congregation.id, "Ana"),
        "carla": make_publisher(congregation.id, "Carla"),
    }


async def create_campaign(client, token: str, name: str, *territory_ids: str):
    return await client.post(
        "/admin/campaigns",
        json={"name": name, "territory_ids": list(territory_ids)},
        headers=bearer(token),
    )


async def test_creating_answers_201_with_the_campaign_and_no_period(client, scene) -> None:
    response = await create_campaign(client, scene["token"], "Celebração", scene["n5"], scene["n3"])

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Celebração"
    assert [t["name"] for t in body["territories"]] == ["N3", "N5"]
    assert body["current_designation"] is None
    assert body["designations"] == []


async def test_a_repeated_name_answers_409(client, scene) -> None:
    await create_campaign(client, scene["token"], "Celebração", scene["n3"])

    response = await create_campaign(client, scene["token"], "Celebração", scene["n5"])

    assert response.status_code == 409
    assert response.json()["code"] == "duplicate_name"


async def test_a_campaign_without_territories_answers_422(client, scene) -> None:
    response = await create_campaign(client, scene["token"], "Vazia")

    assert response.status_code == 422


async def test_the_whole_lifecycle_over_http(client, scene) -> None:
    token = scene["token"]
    individual = await client.post(
        f"/admin/territories/{scene['n5']}/assignments",
        json={"user_id": str(scene["carla"].id)},
        headers=bearer(token),
    )
    assert individual.status_code == 201
    campaign_id = (
        await create_campaign(client, token, "Celebração", scene["n3"], scene["n5"])
    ).json()["id"]

    designated = await client.post(
        f"/admin/campaigns/{campaign_id}/designations",
        json={"user_ids": [str(scene["ana"].id)]},
        headers=bearer(token),
    )
    assert designated.status_code == 201, designated.text
    current = designated.json()["current_designation"]
    assert current["completed_at"] is None
    assert current["publishers"] == [{"id": str(scene["ana"].id), "name": "Ana"}]

    card = (
        await client.get(f"/admin/territories/{scene['n5']}/assignments", headers=bearer(token))
    ).json()
    assert card[0]["user"] is None
    assert card[0]["campaign"] == {"id": campaign_id, "name": "Celebração"}
    assert card[0]["completed_at"] is None
    assert card[1]["user"]["name"] == "Carla"
    assert card[1]["campaign"] is None
    assert card[1]["completed_at"] is not None

    history = (await client.get("/admin/assignments", headers=bearer(token))).json()["items"]
    assert {row["campaign"]["name"] for row in history if row["user"] is None} == {"Celebração"}

    territories = (await client.get("/admin/territories", headers=bearer(token))).json()
    held = {t["name"]: t for t in territories}
    assert held["N5"]["campaign"] == {"id": campaign_id, "name": "Celebração"}
    assert held["N5"]["assigned_user"] is None
    detail = (await client.get(f"/admin/territories/{scene['n3']}", headers=bearer(token))).json()
    assert detail["campaign"]["name"] == "Celebração"

    refused = await client.post(
        f"/admin/territories/{scene['n5']}/assignments",
        json={"user_id": str(scene["carla"].id)},
        headers=bearer(token),
    )
    assert refused.status_code == 409
    assert refused.json()["code"] == "territory_in_campaign"

    line_id = card[0]["id"]
    managed = await client.delete(
        f"/admin/territories/{scene['n5']}/assignments/{line_id}", headers=bearer(token)
    )
    assert managed.status_code == 409
    assert managed.json()["code"] == "campaign_assignment"

    still_active = await client.delete(f"/admin/campaigns/{campaign_id}", headers=bearer(token))
    assert still_active.status_code == 409
    assert still_active.json()["code"] == "campaign_active"

    swapped = await client.put(
        f"/admin/campaigns/{campaign_id}/designations/current/publishers",
        json={"user_ids": [str(scene["carla"].id)]},
        headers=bearer(token),
    )
    assert swapped.status_code == 200
    assert swapped.json()["current_designation"]["publishers"][0]["name"] == "Carla"

    completed = await client.post(
        f"/admin/campaigns/{campaign_id}/designations/current/complete", headers=bearer(token)
    )
    assert completed.status_code == 200
    assert completed.json()["current_designation"] is None
    assert completed.json()["designations"][0]["completed_at"] is not None

    again = await client.post(
        f"/admin/campaigns/{campaign_id}/designations/current/complete", headers=bearer(token)
    )
    assert again.status_code == 404

    deleted = await client.delete(f"/admin/campaigns/{campaign_id}", headers=bearer(token))
    assert deleted.status_code == 204


async def test_a_territory_in_another_active_campaign_answers_409(client, scene) -> None:
    token = scene["token"]
    first = (await create_campaign(client, token, "Celebração", scene["n5"])).json()["id"]
    await client.post(
        f"/admin/campaigns/{first}/designations",
        json={"user_ids": [str(scene["ana"].id)]},
        headers=bearer(token),
    )
    second = (await create_campaign(client, token, "Assembleia", scene["n5"])).json()["id"]

    response = await client.post(
        f"/admin/campaigns/{second}/designations",
        json={"user_ids": [str(scene["carla"].id)]},
        headers=bearer(token),
    )

    assert response.status_code == 409
    assert response.json()["code"] == "territory_in_campaign"
    assert "Celebração" in response.json()["detail"]


async def test_designating_with_no_publisher_answers_422(client, scene) -> None:
    campaign_id = (await create_campaign(client, scene["token"], "Celebração", scene["n3"])).json()[
        "id"
    ]

    response = await client.post(
        f"/admin/campaigns/{campaign_id}/designations",
        json={"user_ids": []},
        headers=bearer(scene["token"]),
    )

    assert response.status_code == 422


async def test_renaming_and_regrouping_through_patch(client, scene) -> None:
    token = scene["token"]
    campaign_id = (await create_campaign(client, token, "Celebração", scene["n3"])).json()["id"]

    response = await client.patch(
        f"/admin/campaigns/{campaign_id}",
        json={"name": "Convite", "territory_ids": [scene["n5"]]},
        headers=bearer(token),
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Convite"
    assert [t["name"] for t in response.json()["territories"]] == ["N5"]
    listed = (await client.get("/admin/campaigns", headers=bearer(token))).json()
    assert [c["name"] for c in listed] == ["Convite"]
    empty_patch = await client.patch(
        f"/admin/campaigns/{campaign_id}", json={}, headers=bearer(token)
    )
    assert empty_patch.status_code == 422


async def test_a_campaign_of_another_congregation_answers_404(client, scene, make_admin) -> None:
    campaign_id = (await create_campaign(client, scene["token"], "Celebração", scene["n3"])).json()[
        "id"
    ]
    _, stranger = make_admin(name="Outra", city="Recife")

    for response in (
        await client.get(f"/admin/campaigns/{campaign_id}", headers=bearer(stranger)),
        await client.delete(f"/admin/campaigns/{campaign_id}", headers=bearer(stranger)),
        await client.get(f"/admin/campaigns/{uuid4()}", headers=bearer(scene["token"])),
    ):
        assert response.status_code == 404
    other_territory = await create_campaign(client, stranger, "Dela", scene["n3"])
    assert other_territory.status_code == 404


async def test_the_campaign_routes_require_the_admin_token(client) -> None:
    response = await client.get("/admin/campaigns")

    assert response.status_code == 401
