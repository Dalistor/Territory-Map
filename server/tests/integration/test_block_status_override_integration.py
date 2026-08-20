"""The colour the admin pins on a block, and the one event that unpins it.

`status_override` is the only field in the project whose whole purpose is to disagree
with the data next to it: the block's dates say one thing, the admin says another, and
the clients are told to believe the admin. Every layer of that already has its own
test. What has no owner one layer down is the joint -- that the pinned value survives
PostGIS, comes back out through *two* different serialisers (the admin's `block_out`
and the phone's `_block_out`), and above all that the two halves of its lifecycle stay
asymmetric once real HTTP requests, and not service calls, are what drives them:

*Recording work clears the pin.* A visit that just happened is the strongest evidence
the system will ever have about a block, and leaving it red afterwards would be the
interface lying. Asserted here through the admin's marking route, because that is the
one an admin uses right after pinning something by hand.

*Deleting a record does not clear the pin.* This is the deliberate asymmetry of the
service layer, and the single behaviour in this spec most likely to be "tidied up" by
a later refactor that decides both halves should be symmetric. Deleting is the admin
correcting the history; guessing what that implies about the colour would be worse
than leaving the colour alone. It is checked end to end so that the tidying breaks a
flow and not just a unit test that could be read as an implementation detail.

The first flow is one long test on purpose, as in the neighbouring files: pin, read
back on both maps, renumber, mark, re-pin, delete, unpin. Splitting it would turn each
step into setup for the next and hide that they chain -- and chaining is exactly what
is under test, since every step's meaning depends on what the previous one left in the
column.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

pytestmark = pytest.mark.anyio


def an_hour_ago() -> datetime:
    """A `worked_at` the admin route accepts: in the past, nowhere near any limit."""
    return (datetime.now(UTC) - timedelta(hours=1)).replace(microsecond=0)


def bearer(token: str) -> dict[str, str]:
    """The `Authorization` header the admin's JWT travels in.

    Duplicated from `conftest.py` rather than imported, as the marking flow next door
    already does: the block routes this file drives are not in the shared `Api` facade,
    so the calls below are made straight on `api.client` and carry the header
    themselves.
    """
    return {"Authorization": f"Bearer {token}"}


async def patch_block(api, admin_token, block_id, body: dict[str, Any]):
    """`PATCH /admin/blocks/{id}` with whatever keys the caller wants to send.

    Takes the raw body instead of keyword arguments, for the same reason
    `patch_territory` does in the marking flow: the behaviour under test is the
    difference between a key that is absent and a key whose value is null, and a
    signature with defaults would erase that difference before the request was built.
    """
    return await api.client.patch(
        f"/admin/blocks/{block_id}",
        json=body,
        headers=bearer(admin_token),
    )


async def admin_mark_worked(api, admin_token, block_id, user_id, worked_at: datetime):
    """`POST /admin/blocks/{id}/worked` -- the admin writing down someone's visit."""
    return await api.client.post(
        f"/admin/blocks/{block_id}/worked",
        json={"user_id": str(user_id), "worked_at": worked_at.isoformat()},
        headers=bearer(admin_token),
    )


async def delete_work_log(api, admin_token, log_id):
    """`DELETE /admin/work-logs/{id}` -- the admin correcting the history."""
    return await api.client.delete(
        f"/admin/work-logs/{log_id}",
        headers=bearer(admin_token),
    )


def only_block(payload: dict[str, Any]) -> dict[str, Any]:
    """The single block of a territory read back from either map."""
    blocks = payload["blocks"]
    assert len(blocks) == 1, blocks
    return blocks[0]


async def test_the_admin_pins_a_block_status_and_only_new_work_unpins_it(
    api, register_congregation, square
):
    register_congregation(name="Central", city="Uberlândia")
    admin_token = (await api.login("Central", "Uberlândia")).json()["access_token"]

    drawn = await api.draw_territory(admin_token, "Centro", square(-18.90, -48.30))
    assert drawn.status_code == 201, drawn.text
    territory_id = drawn.json()["id"]

    created = await api.draw_block(admin_token, territory_id, square(-18.899, -48.299, side=0.002))
    assert created.status_code == 201, created.text
    block_id = created.json()["id"]
    # A block nobody touched carries no pin: the colour comes from its dates, as ever.
    assert created.json()["status_override"] is None
    assert created.json()["last_worked_at"] is None
    assert created.json()["number"] == 1

    marta = await api.register_publisher(admin_token, "Irmã Marta")
    assert marta.status_code == 201, marta.text
    marta_id = marta.json()["id"]
    app_token = (await api.activate(marta.json()["access_code"])).json()["token"]

    # -- the admin pins it orange: this one is due, whatever the dates say ------
    pinned = await patch_block(api, admin_token, block_id, {"status_override": "overdue"})
    assert pinned.status_code == 200, pinned.text
    assert pinned.json()["status_override"] == "overdue"

    # -- and both maps say so, through two independent serialisers -------------
    detail = await api.read_territory(admin_token, territory_id)
    assert detail.status_code == 200
    assert only_block(detail.json())["status_override"] == "overdue"

    phone_map = await api.read_map(app_token)
    assert phone_map.status_code == 200
    assert only_block(phone_map.json()[0])["status_override"] == "overdue"

    # -- renumbering is not an opinion about the colour: the pin stands ---------
    renumbered = await patch_block(api, admin_token, block_id, {"number": 7})
    assert renumbered.status_code == 200, renumbered.text
    assert renumbered.json()["number"] == 7
    assert renumbered.json()["status_override"] == "overdue"
    assert only_block((await api.read_map(app_token)).json()[0])["status_override"] == "overdue"

    # -- work actually happened, and that outranks anything pinned by hand ------
    worked_at = an_hour_ago()
    recorded = await admin_mark_worked(api, admin_token, block_id, marta_id, worked_at)
    assert recorded.status_code == 201, recorded.text
    log_id = recorded.json()["id"]

    after_work = only_block((await api.read_territory(admin_token, territory_id)).json())
    assert after_work["status_override"] is None
    assert datetime.fromisoformat(after_work["last_worked_at"]) == worked_at
    # The phone sees the same block go back to being coloured by its dates.
    assert only_block((await api.read_map(app_token)).json()[0])["status_override"] is None

    # -- the admin pins it red again, on a block that *has* been worked ---------
    repinned = await patch_block(api, admin_token, block_id, {"status_override": "never"})
    assert repinned.status_code == 200, repinned.text
    assert repinned.json()["status_override"] == "never"

    # -- deleting the visit is the admin fixing the history, not the colour -----
    removed = await delete_work_log(api, admin_token, log_id)
    assert removed.status_code == 204, removed.text

    after_delete = only_block((await api.read_territory(admin_token, territory_id)).json())
    assert after_delete["last_worked_at"] is None
    # The asymmetry, at the far end of a real request: the visit is gone and the pin
    # is untouched. Making this symmetric is the refactor this assertion exists to stop.
    assert after_delete["status_override"] == "never"
    assert only_block((await api.read_map(app_token)).json()[0])["status_override"] == "never"

    # -- an explicit null is the way back to automatic -------------------------
    unpinned = await patch_block(api, admin_token, block_id, {"status_override": None})
    assert unpinned.status_code == 200, unpinned.text
    assert unpinned.json()["status_override"] is None
    assert unpinned.json()["number"] == 7

    back_to_automatic = only_block((await api.read_territory(admin_token, territory_id)).json())
    assert back_to_automatic["status_override"] is None
    assert only_block((await api.read_map(app_token)).json()[0])["status_override"] is None


async def test_the_other_congregations_admin_cannot_pin_a_status_on_my_block(
    api, register_congregation, square
):
    """Same square drawn twice, so only the token can tell the two maps apart."""
    register_congregation(name="Central", city="Uberlândia")
    register_congregation(name="Norte", city="Contagem")
    mine = (await api.login("Central", "Uberlândia")).json()["access_token"]
    theirs = (await api.login("Norte", "Contagem")).json()["access_token"]

    my_territory = (await api.draw_territory(mine, "Centro", square(-18.90, -48.30))).json()["id"]
    my_block = (
        await api.draw_block(mine, my_territory, square(-18.899, -48.299, side=0.002))
    ).json()["id"]

    refused = await patch_block(api, theirs, my_block, {"status_override": "overdue"})

    # 404 and not 403: a different status would confirm the block is real elsewhere.
    assert refused.status_code == 404
    assert refused.json()["code"] == "not_found"

    # And my block is exactly as I left it, with no pin written by the refusal.
    survivor = await api.read_territory(mine, my_territory)
    assert only_block(survivor.json())["status_override"] is None
