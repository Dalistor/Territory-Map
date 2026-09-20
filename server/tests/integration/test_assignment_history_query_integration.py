"""The congregation-wide assignment history exercised through the real API.

The route-test suite proves that FastAPI turns a query string into the service call.
This flow proves the more important joint: persisted stints, including a stint already
underway at the beginning of the selected period, are filtered and paginated by the
same PostGIS-backed application an administrator uses.
"""

from datetime import UTC, datetime

import pytest
from app.routers import admin_assignments

pytestmark = pytest.mark.anyio


def bearer(token: str) -> dict[str, str]:
    """Build the admin authentication header for calls outside the shared facade."""
    return {"Authorization": f"Bearer {token}"}


async def assignment_history(api, admin_token, **params):
    """Read one page from the congregation-wide history endpoint."""
    return await api.client.get(
        "/admin/assignments",
        params=params,
        headers=bearer(admin_token),
    )


async def test_assignment_history_filters_overlapping_stints_pages_results_and_scopes_tenants(
    api, monkeypatch, register_congregation, square
):
    """An interval includes stints that began earlier and excludes another congregation."""
    register_congregation(name="Central", city="Uberlândia")
    register_congregation(name="Leste", city="Uberlândia")
    central_token = (await api.login("Central", "Uberlândia")).json()["access_token"]
    leste_token = (await api.login("Leste", "Uberlândia")).json()["access_token"]

    ana = await api.register_publisher(central_token, "Irmã Ana")
    bruno = await api.register_publisher(central_token, "Irmão Bruno")
    foreign_publisher = await api.register_publisher(leste_token, "Irmã Ester")
    assert ana.status_code == bruno.status_code == foreign_publisher.status_code == 201

    pioneiro = await api.draw_territory(central_token, "Pioneiro", square(-18.90, -48.30))
    jardim = await api.draw_territory(central_token, "Jardim", square(-18.88, -48.30))
    ribeiro = await api.draw_territory(central_token, "Ribeiro", square(-18.86, -48.30))
    foreign = await api.draw_territory(leste_token, "Estrangeiro", square(-18.90, -48.30))
    assert (
        pioneiro.status_code
        == jardim.status_code
        == ribeiro.status_code
        == foreign.status_code
        == 201
    )

    clock = {"now": datetime(2026, 1, 1, 9, tzinfo=UTC)}
    monkeypatch.setattr(admin_assignments, "utc_now", lambda: clock["now"])

    old_stint = await api.assign_territory(central_token, pioneiro.json()["id"], ana.json()["id"])
    assert old_stint.status_code == 201, old_stint.text
    clock["now"] = datetime(2026, 1, 20, 9, tzinfo=UTC)
    assert (await api.complete_assignment(central_token, pioneiro.json()["id"])).status_code == 200

    clock["now"] = datetime(2026, 1, 10, 9, tzinfo=UTC)
    middle_stint = await api.assign_territory(
        central_token, jardim.json()["id"], bruno.json()["id"]
    )
    assert middle_stint.status_code == 201, middle_stint.text
    clock["now"] = datetime(2026, 1, 15, 9, tzinfo=UTC)
    assert (await api.complete_assignment(central_token, jardim.json()["id"])).status_code == 200

    clock["now"] = datetime(2025, 12, 1, 9, tzinfo=UTC)
    open_stint = await api.assign_territory(central_token, ribeiro.json()["id"], ana.json()["id"])
    assert open_stint.status_code == 201, open_stint.text

    clock["now"] = datetime(2026, 1, 12, 9, tzinfo=UTC)
    foreign_stint = await api.assign_territory(
        leste_token, foreign.json()["id"], foreign_publisher.json()["id"]
    )
    assert foreign_stint.status_code == 201, foreign_stint.text

    period = {"from": "2026-01-12T00:00:00Z", "to": "2026-01-18T00:00:00Z"}
    first_page = await assignment_history(api, central_token, **period, page=1, page_size=2)
    assert first_page.status_code == 200, first_page.text
    assert first_page.json()["total"] == 3
    assert first_page.json()["page"] == 1
    assert first_page.json()["page_size"] == 2
    assert [row["id"] for row in first_page.json()["items"]] == [
        middle_stint.json()["id"],
        old_stint.json()["id"],
    ]

    second_page = await assignment_history(api, central_token, **period, page=2, page_size=2)
    assert second_page.status_code == 200, second_page.text
    assert second_page.json()["total"] == 3
    assert [row["id"] for row in second_page.json()["items"]] == [open_stint.json()["id"]]
    assert second_page.json()["items"][0]["completed_at"] is None
    assert foreign_stint.json()["id"] not in {
        row["id"] for row in first_page.json()["items"] + second_page.json()["items"]
    }

    ana_history = await assignment_history(
        api, central_token, **period, publisher_id=ana.json()["id"]
    )
    assert ana_history.status_code == 200, ana_history.text
    assert ana_history.json()["total"] == 2
    assert [row["id"] for row in ana_history.json()["items"]] == [
        old_stint.json()["id"],
        open_stint.json()["id"],
    ]

    jardim_history = await assignment_history(
        api, central_token, **period, territory_id=jardim.json()["id"]
    )
    assert jardim_history.status_code == 200, jardim_history.text
    assert jardim_history.json()["total"] == 1
    assert [row["id"] for row in jardim_history.json()["items"]] == [middle_stint.json()["id"]]
