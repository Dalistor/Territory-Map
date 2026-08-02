"""The whole system, once, in the order it actually happens.

A congregation is provisioned, its admin signs in, registers a publisher and hands
over the code; the publisher's phone redeems it and finds an empty map, because the
territories have not been drawn yet. The admin then draws one and cuts two blocks into
it, the phone reads the map again and sees them, marks the first block as worked, and
the admin opens the history and reads the publisher's name next to the moment.

Every unit and route test in this repository proves one of those steps. What none of
them can prove is that the steps fit together -- that the code the admin's screen shows
is the one the phone can spend, that the token that comes back reaches the map of the
right congregation, that the id the admin got when drawing a block is the id the phone
marks, and that the projection the admin reads afterwards is the moment the phone sent.
Those are joints, and this is the only test that loads them.

It is deliberately one long test. Split into five, each part would need the other four
as setup, and the thing under test -- the sequence -- would be the only thing not
asserted.
"""

from datetime import UTC, datetime, timedelta

import pytest

pytestmark = pytest.mark.anyio


def an_hour_ago() -> datetime:
    """A `worked_at` the server accepts: past, and well inside the 90-day window."""
    return (datetime.now(UTC) - timedelta(hours=1)).replace(microsecond=0)


async def test_a_congregation_goes_from_empty_to_a_worked_block(api, register_congregation, square):
    congregation = register_congregation(name="Central", city="Uberlândia")

    # -- the admin signs in ---------------------------------------------------
    signed_in = await api.login("Central", "Uberlândia")
    assert signed_in.status_code == 200
    admin_token = signed_in.json()["access_token"]
    assert signed_in.json()["congregation"]["id"] == str(congregation.id)
    # The digest is not a field of `CongregationOut`, and this is the response that
    # would leak it if it ever were.
    assert "password_hash" not in signed_in.json()["congregation"]

    # -- the admin registers a publisher and reads out the code ---------------
    registered = await api.register_publisher(admin_token, "Irmã Marta")
    assert registered.status_code == 201
    publisher = registered.json()
    access_code = publisher["access_code"]
    assert len(access_code) == 8
    assert publisher["activated_at"] is None
    assert publisher["is_active"] is True

    # -- the phone spends the code and gets its permanent token ---------------
    activated = await api.activate(access_code)
    assert activated.status_code == 200
    app_token = activated.json()["token"]
    assert activated.json()["user"]["name"] == "Irmã Marta"
    assert activated.json()["congregation"]["id"] == str(congregation.id)

    # The code was single-use: it is gone from the row the admin lists, so the screen
    # that showed it now shows there is nothing left to hand over.
    listed = await api.list_publishers(admin_token)
    assert listed.status_code == 200
    assert listed.json()[0]["access_code"] is None
    assert listed.json()[0]["activated_at"] is not None

    # -- the phone reads a map that has not been drawn yet --------------------
    empty_map = await api.read_map(app_token)
    assert empty_map.status_code == 200
    assert empty_map.json() == []

    # -- the admin draws the territory and cuts two blocks into it ------------
    boundary = square(-18.90, -48.30)
    drawn = await api.draw_territory(admin_token, "Centro", boundary)
    assert drawn.status_code == 201
    territory_id = drawn.json()["id"]
    assert drawn.json()["boundary"] == boundary

    first = await api.draw_block(admin_token, territory_id, square(-18.899, -48.299, side=0.002))
    second = await api.draw_block(admin_token, territory_id, square(-18.899, -48.294, side=0.002))
    assert (first.status_code, second.status_code) == (201, 201)
    # Numbering was left to the server, which fills from one upwards.
    assert [first.json()["number"], second.json()["number"]] == [1, 2]
    block_one = first.json()["id"]

    # -- the phone reads the map again and finds the blocks -------------------
    read = await api.read_map(app_token)
    assert read.status_code == 200
    territory = read.json()[0]
    assert territory["name"] == "Centro"
    assert territory["boundary"] == boundary
    assert [block["number"] for block in territory["blocks"]] == [1, 2]
    assert [block["last_worked_at"] for block in territory["blocks"]] == [None, None]

    # -- the publisher works block 1 and marks it -----------------------------
    worked_at = an_hour_ago()
    marked = await api.mark_worked(app_token, block_one, worked_at)
    assert marked.status_code == 201
    assert marked.json()["user"]["name"] == "Irmã Marta"

    # -- the admin opens the history and sees who was there, and when ---------
    history = await api.work_logs(admin_token, block_one)
    assert history.status_code == 200
    assert len(history.json()) == 1
    entry = history.json()[0]
    assert entry["user"]["name"] == "Irmã Marta"
    assert entry["user"]["id"] == activated.json()["user"]["id"]
    assert datetime.fromisoformat(entry["worked_at"]) == worked_at

    # -- and the projection both clients read agrees with the log -------------
    detail = await api.read_territory(admin_token, territory_id)
    assert detail.status_code == 200
    reported = {block["number"]: block["last_worked_at"] for block in detail.json()["blocks"]}
    assert datetime.fromisoformat(reported[1]) == worked_at
    # The block nobody visited stays unvisited -- marking one is not marking the map.
    assert reported[2] is None

    on_the_phone = await api.read_map(app_token)
    phone_view = {
        block["number"]: block["last_worked_at"] for block in on_the_phone.json()[0]["blocks"]
    }
    assert phone_view == reported
