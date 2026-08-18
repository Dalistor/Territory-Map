"""Designating a territory to a publisher, and the wall it puts around marking blocks.

`WorkLogService.mark_worked` refusing an unassigned territory has a unit test, and the
admin routes that open and close a stint have router tests of their own. Neither proves
the joint: that the publisher the admin picked in `POST .../assignments` is the same one
whose token the app later measures against, that both `GET /admin/territories` and
`GET /app/territories` project the row that `POST` opened, and that completing the stint
closes the door on the publisher who had just walked through it.

Handing the territory back is now an event with a date -- `POST .../assignments/complete`
-- rather than a field set to null, which is the only thing that changed here since the
designation became a historical record: the wall it raises and lowers is the same.

The flow is deliberately one long test, for the same reason `test_full_flow_integration`
is: the five scenarios are a sequence -- assign, read it back from both sides, mark
successfully, get refused as someone else, get refused again once the stint is closed --
and splitting them would mean redoing the previous steps as setup for each one, hiding
the one thing worth proving, which is that they chain.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

pytestmark = pytest.mark.anyio


def an_hour_ago() -> datetime:
    """A `worked_at` the server accepts: past, and well inside the 90-day window."""
    return (datetime.now(UTC) - timedelta(hours=1)).replace(microsecond=0)


def bearer(token: str) -> dict[str, str]:
    """The `Authorization` header both kinds of token travel in.

    Duplicated from `conftest.py`'s helper of the same name rather than imported --
    this file is not supposed to touch anything outside itself, and the route it calls
    directly (`GET /app/worked-territories`) is not yet in the shared `Api` facade.
    """
    return {"Authorization": f"Bearer {token}"}


async def worked_territories(api, app_token: str):
    """`GET /app/worked-territories` -- the publisher's own dashboard list."""
    return await api.client.get("/app/worked-territories", headers=bearer(app_token))


async def test_designation_gates_marking_end_to_end(api, register_congregation, square):
    register_congregation(name="Central", city="Uberlândia")
    admin_token = (await api.login("Central", "Uberlândia")).json()["access_token"]

    # -- the admin draws a territory and a block, registers a publisher, and ----
    # -- designates the territory to them ---------------------------------------
    drawn = await api.draw_territory(admin_token, "Centro", square(-18.90, -48.30))
    assert drawn.status_code == 201, drawn.text
    territory_id = drawn.json()["id"]

    block = await api.draw_block(admin_token, territory_id, square(-18.899, -48.299, side=0.002))
    assert block.status_code == 201, block.text
    block_id = block.json()["id"]

    registered = await api.register_publisher(admin_token, "Irmã Marta")
    assert registered.status_code == 201, registered.text
    user_id = registered.json()["id"]

    assigned = await api.assign_territory(admin_token, territory_id, user_id)
    assert assigned.status_code == 201, assigned.text
    assert assigned.json()["user"] == {"id": user_id, "name": "Irmã Marta"}
    assert assigned.json()["completed_at"] is None

    # -- and the admin's own listing shows the same designation -----------------
    listed = await api.list_territories(admin_token)
    assert listed.status_code == 200
    assert listed.json()[0]["assigned_user"] == {"id": user_id, "name": "Irmã Marta"}

    # -- the publisher activates the app and sees who the territory belongs to --
    activated = await api.activate(registered.json()["access_code"])
    assert activated.status_code == 200, activated.text
    app_token = activated.json()["token"]

    read = await api.read_map(app_token)
    assert read.status_code == 200
    territory = next(item for item in read.json() if item["id"] == territory_id)
    assert territory["assigned_user"] == {"id": user_id, "name": "Irmã Marta"}

    # -- the publisher marks the block, and the dashboard picks it up -----------
    worked_at = an_hour_ago()
    marked = await api.mark_worked(app_token, block_id, worked_at)
    assert marked.status_code == 201, marked.text

    dashboard = await worked_territories(api, app_token)
    assert dashboard.status_code == 200
    assert len(dashboard.json()) == 1
    entry = dashboard.json()[0]
    assert entry["id"] == territory_id
    assert entry["name"] == "Centro"
    assert datetime.fromisoformat(entry["last_worked_at"]) == worked_at

    # -- a second publisher, designated to nothing, is refused on this block ----
    second_registered = await api.register_publisher(admin_token, "Irmão Pedro")
    assert second_registered.status_code == 201, second_registered.text
    second_app_token = (await api.activate(second_registered.json()["access_code"])).json()["token"]

    refused = await api.mark_worked(second_app_token, block_id, an_hour_ago())
    assert refused.status_code == 403
    assert refused.json()["code"] == "territory_not_assigned"

    # -- and nothing was recorded for that attempt -- the history is untouched --
    history = await api.work_logs(admin_token, block_id)
    assert history.status_code == 200
    assert len(history.json()) == 1
    assert history.json()[0]["user"]["id"] == user_id

    # -- the admin marks the designation as concluded, which gives the -----------
    # -- territory back and leaves the stint in the card as history -------------
    completed = await api.complete_assignment(admin_token, territory_id)
    assert completed.status_code == 200, completed.text
    assert completed.json()["completed_at"] is not None

    released = await api.list_territories(admin_token)
    assert released.json()[0]["assigned_user"] is None

    # -- and even the publisher who had legitimate access a moment ago is now ---
    # -- refused on the same territory -------------------------------------------
    also_refused = await api.mark_worked(app_token, block_id, an_hour_ago(), log_id=uuid4())
    assert also_refused.status_code == 403
    assert also_refused.json()["code"] == "territory_not_assigned"

    still_one_entry = await api.work_logs(admin_token, block_id)
    assert len(still_one_entry.json()) == 1
