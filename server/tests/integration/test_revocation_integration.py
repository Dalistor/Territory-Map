"""Switching a publisher off, and the history that survives it.

Revocation is the only lever the admin has over a device already in someone's pocket:
the app token never expires, so `is_active = false` is what makes it stop working, and
it has to take effect on the very next request rather than whenever something else
happens to refresh. That is the first half.

The second half is the one that is easy to get wrong in the tempting direction. Somebody
leaves the congregation, or a phone is lost, and the obvious implementation deletes the
row -- which would take every block that person ever covered with it. The work log is
the record of what has been done in the field; it is what tells the congregation where
to go next, and it must outlive whoever produced it. So the same flow that proves the
token dies also proves that the admin still opens the block and reads that person's
name next to the visit.

Reactivation closes the loop. Revoking must not consume the device: the publisher comes
back, the admin flips the flag, and the phone in their hand works again without a new
code -- which only holds if revocation left `token_version` alone.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

pytestmark = pytest.mark.anyio


def an_hour_ago() -> datetime:
    return (datetime.now(UTC) - timedelta(hours=1)).replace(microsecond=0)


@pytest.fixture
async def worked_block(api, register_congregation, square):
    """A publisher who has already covered a block, and everything needed to read it.

    The work is done *before* the revocation so that the history under test is real
    history -- written by the person while they still had access.
    """
    register_congregation(name="Central", city="Uberlândia")
    admin_token = (await api.login("Central", "Uberlândia")).json()["access_token"]

    registered = await api.register_publisher(admin_token, "Irmão Pedro")
    user_id = registered.json()["id"]
    app_token = (await api.activate(registered.json()["access_code"])).json()["token"]

    territory = await api.draw_territory(admin_token, "Centro", square(-18.90, -48.30))
    block = await api.draw_block(
        admin_token,
        territory.json()["id"],
        square(-18.899, -48.299, side=0.002),
    )
    block_id = block.json()["id"]

    worked_at = an_hour_ago()
    marked = await api.mark_worked(app_token, block_id, worked_at)
    assert marked.status_code == 201, marked.text

    return {
        "admin_token": admin_token,
        "app_token": app_token,
        "user_id": user_id,
        "territory_id": territory.json()["id"],
        "block_id": block_id,
        "worked_at": worked_at,
    }


async def test_revoking_a_publisher_locks_their_device_out_at_once(api, worked_block):
    """Both routes, because a revoked token that could still write is the dangerous one."""
    admin_token, app_token = worked_block["admin_token"], worked_block["app_token"]
    assert (await api.read_map(app_token)).status_code == 200

    revoked = await api.set_publisher_active(admin_token, worked_block["user_id"], is_active=False)

    assert revoked.status_code == 200
    assert revoked.json()["is_active"] is False
    assert (await api.read_map(app_token)).status_code == 401
    refused = await api.mark_worked(app_token, worked_block["block_id"], an_hour_ago())
    assert refused.status_code == 401


async def test_a_revoked_publishers_work_is_still_there_for_the_admin(api, worked_block):
    """History is a record of the field, not a property of the account that filed it."""
    admin_token = worked_block["admin_token"]
    await api.set_publisher_active(admin_token, worked_block["user_id"], is_active=False)

    history = await api.work_logs(admin_token, worked_block["block_id"])

    assert history.status_code == 200
    assert len(history.json()) == 1
    entry = history.json()[0]
    assert entry["user"]["name"] == "Irmão Pedro"
    assert entry["user"]["id"] == worked_block["user_id"]
    assert datetime.fromisoformat(entry["worked_at"]) == worked_block["worked_at"]


async def test_the_block_keeps_reporting_when_it_was_last_worked(api, worked_block):
    """`last_worked_at` is what decides where the congregation goes next.

    Losing it on revocation would send everyone back to a block that was covered
    yesterday, which is the practical damage of deleting a departed publisher's rows.
    """
    admin_token = worked_block["admin_token"]
    await api.set_publisher_active(admin_token, worked_block["user_id"], is_active=False)

    detail = await api.read_territory(admin_token, worked_block["territory_id"])

    reported = detail.json()["blocks"][0]["last_worked_at"]
    assert datetime.fromisoformat(reported) == worked_block["worked_at"]


async def test_a_revoked_publisher_stays_on_the_admins_list_marked_as_off(api, worked_block):
    """Revoking is not deleting: the admin has to be able to find them and switch it back."""
    admin_token = worked_block["admin_token"]
    await api.set_publisher_active(admin_token, worked_block["user_id"], is_active=False)

    listed = await api.list_publishers(admin_token)

    assert [(person["name"], person["is_active"]) for person in listed.json()] == [
        ("Irmão Pedro", False)
    ]


async def test_a_revoked_code_holder_cannot_redeem_a_fresh_code_either(api, worked_block):
    """The other door into the account, closed by the same flag.

    A code minted for a switched-off publisher must not be a way around the revocation
    -- otherwise reissuing, which the admin does routinely, would silently undo it.
    """
    admin_token = worked_block["admin_token"]
    await api.set_publisher_active(admin_token, worked_block["user_id"], is_active=False)

    reissued = await api.new_access_code(admin_token, worked_block["user_id"])
    refused = await api.activate(reissued.json()["access_code"])

    assert refused.status_code == 401
    assert refused.json()["code"] == "inactive_user"


async def test_reactivating_gives_the_same_device_its_access_back(api, worked_block):
    """Revocation must not consume the phone: no new code should be needed to return."""
    admin_token, app_token = worked_block["admin_token"], worked_block["app_token"]
    await api.set_publisher_active(admin_token, worked_block["user_id"], is_active=False)
    assert (await api.read_map(app_token)).status_code == 401

    restored = await api.set_publisher_active(admin_token, worked_block["user_id"], is_active=True)

    assert restored.json()["is_active"] is True
    assert (await api.read_map(app_token)).status_code == 200
    marked = await api.mark_worked(app_token, worked_block["block_id"], an_hour_ago(), uuid4())
    assert marked.status_code == 201
