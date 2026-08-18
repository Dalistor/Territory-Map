"""The whole life of a designation, over HTTP: opened, closed, replaced and erased.

The service that decides these rules has unit tests, and the four routes have route
tests. What neither proves is the joint, which is the only thing this file is about:
that the card the admin reads (`GET .../assignments`), the column the app's permission
rule reads (`Territory.assigned_user_id`, surfaced as `assigned_user`) and the answer
the publisher's phone gets when it marks a block never disagree -- not after a
completion, not after a hand-over that closed somebody else's stint, and not after a
row is deleted from the middle of the history.

That triple agreement is exactly what a projection can break: `assigned_user` is a read
cache of the open assignment, so every one of these steps has a way of leaving it
pointing at somebody who is no longer responsible. A flow that only read the history
back would never notice -- the phone is what notices, which is why it is here.

One long test, for the same reason `test_territory_assignment_integration` is one: the
steps are a chain, each asserting what the previous one left behind, and splitting them
would turn the interesting part into repeated setup. The cross-tenant deletion is the
one scenario that is not part of the chain -- it needs a second congregation -- so it
gets its own test.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

pytestmark = pytest.mark.anyio


def an_hour_ago() -> datetime:
    """A `worked_at` the server accepts: past, and well inside the 90-day window."""
    return (datetime.now(UTC) - timedelta(hours=1)).replace(microsecond=0)


async def test_assignment_history_lifecycle_end_to_end(api, register_congregation, square):
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

    # -- the admin designates the territory to Marta: one open row on the card --
    designated = await api.assign_territory(admin_token, territory_id, marta_id)
    assert designated.status_code == 201, designated.text

    card = await api.list_assignments(admin_token, territory_id)
    assert card.status_code == 200, card.text
    assert len(card.json()) == 1
    first_stint = card.json()[0]
    assert first_stint["user"] == {"id": marta_id, "name": "Irmã Marta"}
    assert first_stint["completed_at"] is None
    assert first_stint["started_at"] is not None

    assert (await api.list_territories(admin_token)).json()[0]["assigned_user"] == {
        "id": marta_id,
        "name": "Irmã Marta",
    }

    # -- and the publisher named on that row may mark a block of it -------------
    marked = await api.mark_worked(marta_token, block_id, an_hour_ago())
    assert marked.status_code == 201, marked.text

    # -- the admin marks it concluded: the same row is now closed, the territory -
    # -- is free again, and Marta loses the right she had a moment ago -----------
    completed = await api.complete_assignment(admin_token, territory_id)
    assert completed.status_code == 200, completed.text

    card = await api.list_assignments(admin_token, territory_id)
    assert len(card.json()) == 1
    closed_stint = card.json()[0]
    assert closed_stint["id"] == first_stint["id"]
    assert closed_stint["started_at"] == first_stint["started_at"]
    assert closed_stint["completed_at"] is not None

    assert (await api.list_territories(admin_token)).json()[0]["assigned_user"] is None

    refused = await api.mark_worked(marta_token, block_id, an_hour_ago(), log_id=uuid4())
    assert refused.status_code == 403, refused.text
    assert refused.json()["code"] == "territory_not_assigned"

    # -- a second publisher takes over: two rows now, his open, hers history -----
    pedro = await api.register_publisher(admin_token, "Irmão Pedro")
    assert pedro.status_code == 201, pedro.text
    pedro_id = pedro.json()["id"]
    pedro_token = (await api.activate(pedro.json()["access_code"])).json()["token"]

    handed_over = await api.assign_territory(admin_token, territory_id, pedro_id)
    assert handed_over.status_code == 201, handed_over.text

    card = await api.list_assignments(admin_token, territory_id)
    assert [(row["user"]["name"], row["completed_at"] is None) for row in card.json()] == [
        ("Irmão Pedro", True),
        ("Irmã Marta", False),
    ]

    assert (await api.list_territories(admin_token)).json()[0]["assigned_user"] == {
        "id": pedro_id,
        "name": "Irmão Pedro",
    }

    assert (await api.mark_worked(pedro_token, block_id, an_hour_ago())).status_code == 201
    still_refused = await api.mark_worked(marta_token, block_id, an_hour_ago(), log_id=uuid4())
    assert still_refused.status_code == 403
    assert still_refused.json()["code"] == "territory_not_assigned"

    # -- handing it back to Marta without completing Pedro's stint closes his ---
    # -- for him: the card gains a third row, and none of the old ones change ---
    back_to_marta = await api.assign_territory(admin_token, territory_id, marta_id)
    assert back_to_marta.status_code == 201, back_to_marta.text

    card = await api.list_assignments(admin_token, territory_id)
    assert len(card.json()) == 3
    newest, pedros_stint, oldest = card.json()
    assert newest["user"]["id"] == marta_id
    assert newest["completed_at"] is None
    assert pedros_stint["user"]["id"] == pedro_id
    assert pedros_stint["completed_at"] is not None
    assert oldest["id"] == first_stint["id"]

    assert (await api.mark_worked(pedro_token, block_id, an_hour_ago(), log_id=uuid4())).json()[
        "code"
    ] == "territory_not_assigned"

    # -- deleting the open row undoes the designation entirely: it leaves the ----
    # -- card, the territory goes back to nobody, and Marta is refused again -----
    deleted = await api.delete_assignment(admin_token, territory_id, newest["id"])
    assert deleted.status_code == 204, deleted.text

    card = await api.list_assignments(admin_token, territory_id)
    assert [row["id"] for row in card.json()] == [pedros_stint["id"], first_stint["id"]]

    assert (await api.list_territories(admin_token)).json()[0]["assigned_user"] is None

    refused_again = await api.mark_worked(marta_token, block_id, an_hour_ago(), log_id=uuid4())
    assert refused_again.status_code == 403
    assert refused_again.json()["code"] == "territory_not_assigned"

    # -- and deleting a row that was already history changes nothing else -------
    erased_history = await api.delete_assignment(admin_token, territory_id, pedros_stint["id"])
    assert erased_history.status_code == 204, erased_history.text

    card = await api.list_assignments(admin_token, territory_id)
    assert [row["id"] for row in card.json()] == [first_stint["id"]]
    assert card.json()[0]["completed_at"] is not None

    assert (await api.list_territories(admin_token)).json()[0]["assigned_user"] is None

    # -- the work both publishers really did is untouched by any of this --------
    logs = await api.work_logs(admin_token, block_id)
    assert sorted(log["user"]["name"] for log in logs.json()) == ["Irmã Marta", "Irmão Pedro"]


async def test_deleting_an_assignment_of_another_congregation_is_not_found(
    api, register_congregation, square
):
    """A card row is reachable only by the congregation whose territory it belongs to.

    404 rather than 403, like everywhere else on this boundary: a 403 would confirm the
    id names a real designation somewhere, which is precisely what the tenant wall is
    there to withhold. The two congregations are drawn on the same square on purpose --
    geography buys nobody access.
    """
    register_congregation(name="Central", city="Uberlândia")
    register_congregation(name="Leste", city="Uberlândia")
    intruder_token = (await api.login("Central", "Uberlândia")).json()["access_token"]
    owner_token = (await api.login("Leste", "Uberlândia")).json()["access_token"]

    drawn = await api.draw_territory(owner_token, "Centro", square(-18.90, -48.30))
    territory_id = drawn.json()["id"]
    publisher_id = (await api.register_publisher(owner_token, "Irmã Marta")).json()["id"]
    designated = await api.assign_territory(owner_token, territory_id, publisher_id)
    assignment_id = designated.json()["id"]

    refused = await api.delete_assignment(intruder_token, territory_id, assignment_id)
    assert refused.status_code == 404, refused.text

    # -- and the row is still on the owner's card, untouched --------------------
    card = await api.list_assignments(owner_token, territory_id)
    assert [row["id"] for row in card.json()] == [assignment_id]
    assert card.json()[0]["completed_at"] is None
