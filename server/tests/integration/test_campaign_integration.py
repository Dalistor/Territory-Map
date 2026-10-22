"""A campaign, end to end: the admin hands two territories to two publishers at once.

`CampaignService` and `WorkLogService` each have their own suite. What only a flow can
prove is the joint between them: that the period the admin opens over HTTP is the one
the phone's marking rule reads on the next request, that the dirigente it replaces stays
on the card as history, that swapping the publishers and completing the campaign close
the door on the very next marking -- and that a resend of a visit already accepted is
still confirmed after that.

One long test, for the reason `test_territory_assignment_integration` gives: the steps
are a sequence, and splitting them would hide the one thing worth proving.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

pytestmark = pytest.mark.anyio


def bearer(token: str) -> dict[str, str]:
    """The `Authorization` header; the campaign routes are not in the shared `Api` facade."""
    return {"Authorization": f"Bearer {token}"}


def an_hour_ago() -> datetime:
    return (datetime.now(UTC) - timedelta(hours=1)).replace(microsecond=0)


async def test_campaign_publishers_mark_until_the_campaign_is_completed(
    api, register_congregation, square
):
    register_congregation(name="Central", city="Uberlândia")
    admin = (await api.login("Central", "Uberlândia")).json()["access_token"]
    client = api.client

    # -- two territories with a block each, and four publishers ------------------
    n3 = (await api.draw_territory(admin, "N3", square(-18.90, -48.30))).json()["id"]
    n8 = (await api.draw_territory(admin, "N8", square(-18.80, -48.30))).json()["id"]
    block_n3 = (await api.draw_block(admin, n3, square(-18.899, -48.299, side=0.002))).json()["id"]
    block_n8 = (await api.draw_block(admin, n8, square(-18.799, -48.299, side=0.002))).json()["id"]

    people = {}
    for name in ("Carla", "Ana", "Bruno", "Pedro"):
        registered = (await api.register_publisher(admin, name)).json()
        token = (await api.activate(registered["access_code"])).json()["token"]
        people[name] = (registered["id"], token)

    # -- Carla is N8's dirigente before the campaign -------------------------------
    assert (await api.assign_territory(admin, n8, people["Carla"][0])).status_code == 201

    # -- the admin groups both territories and designates Ana and Bruno ------------
    created = await client.post(
        "/admin/campaigns",
        json={"name": "Celebração", "territory_ids": [n3, n8]},
        headers=bearer(admin),
    )
    assert created.status_code == 201, created.text
    campaign_id = created.json()["id"]
    designated = await client.post(
        f"/admin/campaigns/{campaign_id}/designations",
        json={"user_ids": [people["Ana"][0], people["Bruno"][0]]},
        headers=bearer(admin),
    )
    assert designated.status_code == 201, designated.text

    card = (await api.list_assignments(admin, n8)).json()
    assert card[0]["campaign"] == {"id": campaign_id, "name": "Celebração"}
    assert card[1]["user"]["name"] == "Carla"
    assert card[1]["completed_at"] is not None

    # -- the phone sees the campaign in its own tab, and on the map ----------------
    ana_token = people["Ana"][1]
    mine = (await client.get("/app/campaigns", headers=bearer(ana_token))).json()
    assert [(c["id"], c["name"], sorted(c["territory_ids"])) for c in mine] == [
        (campaign_id, "Celebração", sorted([n3, n8]))
    ]
    on_map = {t["id"]: t for t in (await api.read_map(ana_token)).json()}
    assert on_map[n8]["campaign"] == {"id": campaign_id, "name": "Celebração"}
    assert on_map[n8]["assigned_user"] is None

    # -- both publishers of the campaign mark; somebody outside it cannot ----------
    ana_log = uuid4()
    worked_at = an_hour_ago()
    ana_marked = await api.mark_worked(ana_token, block_n8, worked_at, log_id=ana_log)
    assert ana_marked.status_code == 201, ana_marked.text
    bruno_marked = await api.mark_worked(people["Bruno"][1], block_n3, an_hour_ago())
    assert bruno_marked.status_code == 201, bruno_marked.text

    outsider = await api.mark_worked(people["Pedro"][1], block_n8, an_hour_ago())
    assert outsider.status_code == 403
    assert outsider.json()["code"] == "territory_not_assigned"
    carla = await api.mark_worked(people["Carla"][1], block_n8, an_hour_ago())
    assert carla.status_code == 403

    # -- Bruno taken off the campaign is refused on the very next marking ----------
    swapped = await client.put(
        f"/admin/campaigns/{campaign_id}/designations/current/publishers",
        json={"user_ids": [people["Ana"][0]]},
        headers=bearer(admin),
    )
    assert swapped.status_code == 200
    removed = await api.mark_worked(people["Bruno"][1], block_n3, an_hour_ago())
    assert removed.status_code == 403
    assert (await client.get("/app/campaigns", headers=bearer(people["Bruno"][1]))).json() == []

    # -- the admin completes the campaign: the door closes for Ana too -------------
    completed = await client.post(
        f"/admin/campaigns/{campaign_id}/designations/current/complete", headers=bearer(admin)
    )
    assert completed.status_code == 200, completed.text

    after = await api.mark_worked(ana_token, block_n8, an_hour_ago())
    assert after.status_code == 403
    assert after.json()["code"] == "territory_not_assigned"
    resend = await api.mark_worked(ana_token, block_n8, worked_at, log_id=ana_log)
    assert resend.status_code == 200

    assert (await client.get("/app/campaigns", headers=bearer(ana_token))).json() == []
    released = {t["id"]: t for t in (await api.list_territories(admin)).json()}
    assert released[n8]["assigned_user"] is None
    assert released[n8]["campaign"] is None

    # -- both visits stay in the history, each with its own author -----------------
    n8_history = (await api.work_logs(admin, block_n8)).json()
    assert [entry["user"]["name"] for entry in n8_history] == ["Ana"]
    n3_history = (await api.work_logs(admin, block_n3)).json()
    assert [entry["user"]["name"] for entry in n3_history] == ["Bruno"]
