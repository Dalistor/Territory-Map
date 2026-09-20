"""Deleting a publisher: the person leaves, the history they wrote stays behind.

The rule that refuses the deletion has a service test, and the route that answers 409
and 204 has a route test. Neither of them can prove the thing this spec was written
for, because it only exists once the rows outlive the row they used to point at: that
a work log and a completed stint keep naming a publisher who is no longer in `users`.
Below one layer that is a claim about two columns; here it is the same JSON the admin's
screens read, produced by the same serialisers, after the person has genuinely been
deleted from a real PostGIS.

Three joints are asserted here and nowhere else:

*The refusal is a state, not a verdict on the person.* The very first attempt to delete
Marta is answered 409 while she still holds Centro, and the identical request succeeds
after the stint is closed. Nothing about her changed in between -- she still has a work
log, still appears on the card -- so the 409 is proven to be about the open assignment
and not about having history, which is precisely the distinction the spec turns on.

*Deletion revokes access.* The app token is minted before the deletion and used after
it. `current_app_user` reads the row on every request rather than trusting the payload,
so a deleted publisher's phone has to stop working; a deletion that only emptied a list
while the phone kept marking blocks would be cosmetic, and no unit test of `delete`
would notice, because the token never reaches the service.

*Nothing else is taken down with her.* The territory survives, with no publisher
designated -- `assigned_user_id` is `SET NULL` by construction, and the projection is
recomputed rather than left pointing at a ghost.

One long test for the main flow, as in the neighbouring files: each step asserts what
the previous one left behind, and splitting it would turn the interesting half into
setup. The cross-tenant refusal needs a second congregation and is not part of the
chain, so it gets its own test.
"""

from datetime import UTC, datetime, timedelta

import pytest

pytestmark = pytest.mark.anyio


def an_hour_ago() -> datetime:
    """A `worked_at` the server accepts: past, and well inside the 90-day window."""
    return (datetime.now(UTC) - timedelta(hours=1)).replace(microsecond=0)


def bearer(token: str) -> dict[str, str]:
    """The `Authorization` header the admin's JWT travels in.

    Duplicated from `conftest.py` rather than imported, as the neighbouring flows do:
    the two routes this file drives are not in the shared `Api` facade, so the calls
    below are made straight on `api.client` and have to carry the header themselves.
    """
    return {"Authorization": f"Bearer {token}"}


async def delete_publisher(api, admin_token, user_id):
    """`DELETE /admin/users/{id}` -- the admin taking a publisher off the congregation."""
    return await api.client.delete(f"/admin/users/{user_id}", headers=bearer(admin_token))


async def all_assignments(api, admin_token):
    """`GET /admin/assignments` -- the whole congregation's history in one call.

    The admin's History page reads this one, not the per-territory card, and it is the
    listing that would break first if a row needed its publisher to still exist: every
    row here comes from a different territory and is serialised without a `user_id` in
    the URL to fall back on.
    """
    return await api.client.get("/admin/assignments", headers=bearer(admin_token))


async def test_a_deleted_publisher_leaves_the_list_and_stays_in_the_history(
    api, register_congregation, square
):
    register_congregation(name="Central", city="Uberlândia")
    admin_token = (await api.login("Central", "Uberlândia")).json()["access_token"]

    drawn = await api.draw_territory(admin_token, "Centro", square(-18.90, -48.30))
    assert drawn.status_code == 201, drawn.text
    territory_id = drawn.json()["id"]

    block = await api.draw_block(admin_token, territory_id, square(-18.899, -48.299, side=0.002))
    assert block.status_code == 201, block.text
    block_id = block.json()["id"]

    marta = await api.register_publisher(admin_token, "Irmã Marta")
    assert marta.status_code == 201, marta.text
    marta_id = marta.json()["id"]
    marta_token = (await api.activate(marta.json()["access_code"])).json()["token"]

    # -- she is given Centro and works a block of it ---------------------------
    designated = await api.assign_territory(admin_token, territory_id, marta_id)
    assert designated.status_code == 201, designated.text
    assignment_id = designated.json()["id"]

    worked_at = an_hour_ago()
    marked = await api.mark_worked(marta_token, block_id, worked_at)
    assert marked.status_code == 201, marked.text

    # -- deleting her now is refused: the territory is still hers --------------
    refused = await delete_publisher(api, admin_token, marta_id)
    assert refused.status_code == 409, refused.text
    assert refused.json()["code"] == "publisher_has_open_assignment"

    # -- and the refusal wrote nothing: she is on the list, still designated ---
    assert [user["id"] for user in (await api.list_publishers(admin_token)).json()] == [marta_id]
    assert (await api.list_territories(admin_token)).json()[0]["assigned_user"] == {
        "id": marta_id,
        "name": "Irmã Marta",
    }

    # -- the admin closes the stint, and only then does the deletion go through -
    completed = await api.complete_assignment(admin_token, territory_id)
    assert completed.status_code == 200, completed.text

    deleted = await delete_publisher(api, admin_token, marta_id)
    assert deleted.status_code == 204, deleted.text
    assert deleted.content == b""

    # -- she is gone from the congregation's list ------------------------------
    assert (await api.list_publishers(admin_token)).json() == []

    # -- but the block's history still names her, with the date she worked -----
    logs = await api.work_logs(admin_token, block_id)
    assert logs.status_code == 200, logs.text
    assert [entry["user"] for entry in logs.json()] == [{"id": marta_id, "name": "Irmã Marta"}]
    assert datetime.fromisoformat(logs.json()[0]["worked_at"]) == worked_at

    # -- and so does the closed stint on the History page -----------------------
    history = await all_assignments(api, admin_token)
    assert history.status_code == 200, history.text
    assert history.json()["total"] == 1
    row = history.json()["items"][0]
    assert row["id"] == assignment_id
    assert row["user"] == {"id": marta_id, "name": "Irmã Marta"}
    assert row["completed_at"] is not None
    assert row["territory"]["id"] == territory_id

    # -- the same row is still on the territory's own card ---------------------
    card = await api.list_assignments(admin_token, territory_id)
    assert [entry["user"]["name"] for entry in card.json()] == ["Irmã Marta"]

    # -- the territory itself survived, designated to nobody -------------------
    survivor = await api.read_territory(admin_token, territory_id)
    assert survivor.status_code == 200, survivor.text
    assert survivor.json()["assigned_user"] is None
    assert [b["id"] for b in survivor.json()["blocks"]] == [block_id]

    # -- and her phone stops working: the row it is checked against is gone ----
    revoked = await api.read_map(marta_token)
    assert revoked.status_code == 401, revoked.text

    refused_marking = await api.mark_worked(marta_token, block_id, an_hour_ago())
    assert refused_marking.status_code == 401


async def test_deleting_a_publisher_of_another_congregation_is_not_found(
    api, register_congregation
):
    """A publisher is reachable only by the congregation that registered them.

    404 rather than 403, like everywhere else on this boundary: a 403 would confirm the
    id names a real person somewhere, and the deletion route is the worst place to hand
    that out, because guessing ids is exactly what it would reward. The intruder's own
    congregation has a publisher too, so the refusal cannot be explained away by the
    caller having no publishers of their own.
    """
    register_congregation(name="Central", city="Uberlândia")
    register_congregation(name="Leste", city="Uberlândia")
    intruder_token = (await api.login("Central", "Uberlândia")).json()["access_token"]
    owner_token = (await api.login("Leste", "Uberlândia")).json()["access_token"]

    marta = await api.register_publisher(owner_token, "Irmã Marta")
    assert marta.status_code == 201, marta.text
    marta_id = marta.json()["id"]
    await api.register_publisher(intruder_token, "Irmão Pedro")

    refused = await delete_publisher(api, intruder_token, marta_id)
    assert refused.status_code == 404, refused.text
    assert refused.json()["code"] == "not_found"

    # -- she is untouched, and still only on her own congregation's list -------
    assert [user["id"] for user in (await api.list_publishers(owner_token)).json()] == [marta_id]
    assert [user["name"] for user in (await api.list_publishers(intruder_token)).json()] == [
        "Irmão Pedro"
    ]
