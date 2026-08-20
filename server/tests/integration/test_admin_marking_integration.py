"""The admin writing history the phone cannot, and the rotation cycle they set per area.

Both capabilities have unit and route tests already. What has no owner below this file
is the joint between them and everything they touch: that a `BlockWorkLog` minted from
the desktop is indistinguishable from one minted by a phone once it lands -- the same
`GET /admin/blocks/{id}/work-logs` names the publisher, the same `last_worked_at`
projection moves, and the same map both clients read comes back changed -- and that the
rotation the admin types survives the round trip to PostGIS and out through two
different serialisers.

The two differences that matter are only visible end to end, which is why they are
asserted here rather than one layer down:

*The admin is not bound by the designation.* The territory in the first flow is
assigned to nobody, and the marking still lands. That is the whole point of the new
route -- the admin knows what happened in the field and writes it down -- and it is the
one place where the admin's rule and the app's rule genuinely diverge. So the same test
turns around and proves the app's rule did not move an inch: the second publisher's
phone still takes 403 `territory_not_assigned` on the very block the admin just marked.

*Absent and null are different words for `rotation_days`.* A `PATCH` carrying only the
name has to leave a 60-day cycle alone, and a `PATCH` carrying an explicit null has to
put it back on the client default. The router distinguishes them by `model_fields_set`,
which is a distinction that stops existing the moment it crosses a wire -- so it is
worth checking on the far side of one.

Each flow is one long test on purpose, as in the neighbouring files: the steps are a
sequence, and splitting them would turn the earlier assertions into setup for the later
ones and hide the fact that they chain.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

pytestmark = pytest.mark.anyio


def an_hour_ago() -> datetime:
    """A `worked_at` both routes accept: in the past, and nowhere near any limit."""
    return (datetime.now(UTC) - timedelta(hours=1)).replace(microsecond=0)


def bearer(token: str) -> dict[str, str]:
    """The `Authorization` header the admin's JWT travels in.

    Duplicated from `conftest.py`'s helper of the same name rather than imported, for
    the same reason the assignment flow duplicates it: the two routes this file drives
    are not in the shared `Api` facade yet, so the calls below are made straight on
    `api.client` and need the header themselves.
    """
    return {"Authorization": f"Bearer {token}"}


async def admin_mark_worked(api, admin_token, block_id, user_id, worked_at: datetime):
    """`POST /admin/blocks/{id}/worked` -- the admin writing down someone's visit.

    No `log_id` in the body, unlike the phone's route: the admin has no offline queue,
    so the server mints the id and there is no resend to recognise.
    """
    return await api.client.post(
        f"/admin/blocks/{block_id}/worked",
        json={"user_id": str(user_id), "worked_at": worked_at.isoformat()},
        headers=bearer(admin_token),
    )


async def patch_territory(api, admin_token, territory_id, body: dict[str, Any]):
    """`PATCH /admin/territories/{id}` with whatever keys the caller wants to send.

    Deliberately takes the raw body instead of keyword arguments: the behaviour under
    test is the difference between a key that is absent and a key whose value is null,
    and a signature with defaults would erase exactly that difference before the
    request was built.
    """
    return await api.client.patch(
        f"/admin/territories/{territory_id}",
        json=body,
        headers=bearer(admin_token),
    )


async def test_the_admin_marks_a_block_for_a_publisher_who_was_never_assigned_to_it(
    api, register_congregation, square
):
    register_congregation(name="Central", city="Uberlândia")
    admin_token = (await api.login("Central", "Uberlândia")).json()["access_token"]

    # -- a territory with one block, and deliberately no designation at all -----
    drawn = await api.draw_territory(admin_token, "Centro", square(-18.90, -48.30))
    assert drawn.status_code == 201, drawn.text
    territory_id = drawn.json()["id"]
    assert drawn.json()["assigned_user"] is None

    block = await api.draw_block(admin_token, territory_id, square(-18.899, -48.299, side=0.002))
    assert block.status_code == 201, block.text
    block_id = block.json()["id"]
    assert block.json()["last_worked_at"] is None

    # -- two publishers, neither of them responsible for the territory ----------
    marta = await api.register_publisher(admin_token, "Irmã Marta")
    assert marta.status_code == 201, marta.text
    marta_id = marta.json()["id"]

    joao = await api.register_publisher(admin_token, "Irmão João")
    assert joao.status_code == 201, joao.text
    joao_token = (await api.activate(joao.json()["access_code"])).json()["token"]

    # -- the admin records Marta's visit; no assignment is consulted ------------
    worked_at = an_hour_ago()
    recorded = await admin_mark_worked(api, admin_token, block_id, marta_id, worked_at)

    assert recorded.status_code == 201, recorded.text
    assert recorded.json()["user"] == {"id": marta_id, "name": "Irmã Marta"}
    assert recorded.json()["block_id"] == block_id

    # -- the history of the block names her, exactly as if a phone had sent it --
    history = await api.work_logs(admin_token, block_id)
    assert history.status_code == 200
    assert [entry["user"]["name"] for entry in history.json()] == ["Irmã Marta"]
    assert datetime.fromisoformat(history.json()[0]["worked_at"]) == worked_at

    # -- and the projection moved on both maps ---------------------------------
    detail = await api.read_territory(admin_token, territory_id)
    assert detail.status_code == 200
    assert datetime.fromisoformat(detail.json()["blocks"][0]["last_worked_at"]) == worked_at

    phone_map = await api.read_map(joao_token)
    assert phone_map.status_code == 200
    assert datetime.fromisoformat(phone_map.json()[0]["blocks"][0]["last_worked_at"]) == worked_at

    # -- the phone's own rule did not move: João still cannot mark this block ---
    refused = await api.mark_worked(joao_token, block_id, an_hour_ago())
    assert refused.status_code == 403
    assert refused.json()["code"] == "territory_not_assigned"

    # -- and the refusal wrote nothing: Marta's visit is still the only one -----
    unchanged = await api.work_logs(admin_token, block_id)
    assert [entry["user"]["name"] for entry in unchanged.json()] == ["Irmã Marta"]


async def test_the_admin_sets_a_rotation_cycle_and_it_survives_an_unrelated_edit(
    api, register_congregation, square
):
    register_congregation(name="Central", city="Uberlândia")
    admin_token = (await api.login("Central", "Uberlândia")).json()["access_token"]

    drawn = await api.draw_territory(admin_token, "Centro", square(-18.90, -48.30))
    assert drawn.status_code == 201, drawn.text
    territory_id = drawn.json()["id"]
    # A territory nobody configured is on the clients' default cycle.
    assert drawn.json()["rotation_days"] is None

    registered = await api.register_publisher(admin_token, "Irmã Marta")
    app_token = (await api.activate(registered.json()["access_code"])).json()["token"]

    # -- the admin sets a 30-day cycle -----------------------------------------
    configured = await patch_territory(api, admin_token, territory_id, {"rotation_days": 30})
    assert configured.status_code == 200, configured.text
    assert configured.json()["rotation_days"] == 30

    # -- and both clients read the number back ---------------------------------
    listed = await api.list_territories(admin_token)
    assert [item["rotation_days"] for item in listed.json()] == [30]

    phone_map = await api.read_map(app_token)
    assert [territory["rotation_days"] for territory in phone_map.json()] == [30]

    # -- renaming does not wipe it: the key never arrived, so the column stands -
    renamed = await patch_territory(api, admin_token, territory_id, {"name": "Centro Novo"})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "Centro Novo"
    assert renamed.json()["rotation_days"] == 30
    assert (await api.list_territories(admin_token)).json()[0]["rotation_days"] == 30

    # -- an explicit null does wipe it, back to the clients' default ------------
    cleared = await patch_territory(api, admin_token, territory_id, {"rotation_days": None})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["rotation_days"] is None
    assert (await api.read_map(app_token)).json()[0]["rotation_days"] is None
    # The name survived the rotation edit, the mirror image of the check above.
    assert (await api.list_territories(admin_token)).json()[0]["name"] == "Centro Novo"

    # -- a cycle of zero days is not a configuration, it is a broken client -----
    refused = await patch_territory(api, admin_token, territory_id, {"rotation_days": 0})
    assert refused.status_code == 422


async def test_neither_the_marking_nor_the_rotation_reaches_across_congregations(
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
    my_publisher = (await api.register_publisher(mine, "Irmã Marta")).json()["id"]

    their_publisher = (await api.register_publisher(theirs, "Irmão Pedro")).json()["id"]

    # -- the other admin cannot write history onto my block, with either person -
    with_their_own = await admin_mark_worked(api, theirs, my_block, their_publisher, an_hour_ago())
    with_mine = await admin_mark_worked(api, theirs, my_block, my_publisher, an_hour_ago())

    assert with_their_own.status_code == 404
    assert with_their_own.json()["code"] == "not_found"
    # Naming *my* publisher is the more interesting refusal: the block and the person
    # are both real, just not theirs, and the answer must still be the same 404 -- a
    # different status would confirm which half of the pair existed.
    assert with_mine.status_code == 404
    assert with_mine.json()["code"] == "not_found"

    # -- nor change my rotation ------------------------------------------------
    rotation = await patch_territory(api, theirs, my_territory, {"rotation_days": 30})
    assert rotation.status_code == 404
    assert rotation.json()["code"] == "not_found"

    # -- and my territory is exactly as I left it ------------------------------
    survivor = await api.read_territory(mine, my_territory)
    assert survivor.status_code == 200
    assert survivor.json()["rotation_days"] is None
    assert (await api.work_logs(mine, my_block)).json() == []
