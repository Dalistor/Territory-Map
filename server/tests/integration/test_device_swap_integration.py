"""Changing phones, end to end -- and the old device losing access because of it.

The publisher's token never expires, which is the whole reason this flow has to hold:
a phone that was lost, sold or wiped keeps a perfectly valid credential in its storage
forever, and the only thing that takes it away is somebody redeeming a new code. So the
rule is not "the new phone works" -- that much would be true of a system with no
revocation at all. It is that the *old* one stops, at the moment of the second
redemption, without the admin doing anything beyond handing over a new code.

Mechanically that is `token_version`: each redemption bumps it, and the app dependency
compares the number in the payload with the number in the row on every single request.
The unit tests pin both halves. What is proved here is that the halves are wired to
each other -- that the version the second `/app/activate` minted is the version the
first token is measured against.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

pytestmark = pytest.mark.anyio


async def sign_in(api, register_congregation) -> str:
    """Provision a congregation and return its admin token."""
    register_congregation(name="Central", city="Uberlândia")
    response = await api.login("Central", "Uberlândia")
    return response.json()["access_token"]


async def enrol(api, admin_token, name: str = "Irmão Pedro") -> tuple[str, str]:
    """Register a publisher and redeem their code. Returns their id and app token."""
    registered = await api.register_publisher(admin_token, name)
    activated = await api.activate(registered.json()["access_code"])
    return registered.json()["id"], activated.json()["token"]


async def test_redeeming_on_a_new_phone_takes_the_access_away_from_the_old_one(
    api, register_congregation, square
):
    admin_token = await sign_in(api, register_congregation)
    user_id, old_token = await enrol(api, admin_token)
    drawn = await api.draw_territory(admin_token, "Centro", square(-18.90, -48.30))
    block = await api.draw_block(
        admin_token,
        drawn.json()["id"],
        square(-18.899, -48.299, side=0.002),
    )
    block_id = block.json()["id"]

    # The phone the publisher has today works.
    assert (await api.read_map(old_token)).status_code == 200

    # The phone is replaced, so the admin hands over a fresh code.
    reissued = await api.new_access_code(admin_token, user_id)
    assert reissued.status_code == 200
    assert len(reissued.json()["access_code"]) == 8

    # The new phone redeems it and gets a token of its own.
    activated = await api.activate(reissued.json()["access_code"])
    assert activated.status_code == 200
    new_token = activated.json()["token"]
    assert new_token != old_token

    # From that instant the old device is locked out -- on both of its two routes,
    # because a token that could still write would be the dangerous half.
    stale_read = await api.read_map(old_token)
    assert stale_read.status_code == 401
    stale_write = await api.mark_worked(
        old_token,
        block_id,
        (datetime.now(UTC) - timedelta(hours=1)).replace(microsecond=0),
    )
    assert stale_write.status_code == 401

    # And the new one is a full replacement, not a downgraded second seat.
    assert (await api.read_map(new_token)).status_code == 200
    accepted = await api.mark_worked(
        new_token,
        block_id,
        (datetime.now(UTC) - timedelta(hours=1)).replace(microsecond=0),
        log_id=uuid4(),
    )
    assert accepted.status_code == 201


async def test_a_new_code_kills_the_previous_one_before_anybody_redeems_it(
    api, register_congregation
):
    """The other half of "reissue": the code that was replaced stops working too.

    This is the "I lost the paper" case rather than the "I changed phones" one. If the
    superseded code still opened an account, every code ever printed would stay live
    for its full day, and reissuing would widen the window instead of closing it.
    """
    admin_token = await sign_in(api, register_congregation)
    registered = await api.register_publisher(admin_token, "Irmã Marta")
    lost_code = registered.json()["access_code"]

    reissued = await api.new_access_code(admin_token, registered.json()["id"])
    assert reissued.json()["access_code"] != lost_code

    refused = await api.activate(lost_code)
    assert refused.status_code == 401
    assert refused.json()["code"] == "invalid_access_code"

    accepted = await api.activate(reissued.json()["access_code"])
    assert accepted.status_code == 200


async def test_a_code_cannot_be_spent_twice(api, register_congregation):
    """Redemption is what consumes the code, so the second attempt has nothing to spend.

    Without this the code -- read out loud, written on paper, valid for a day -- would
    be a shared credential rather than a one-off handshake, and two phones would answer
    to the same publisher.
    """
    admin_token = await sign_in(api, register_congregation)
    registered = await api.register_publisher(admin_token, "Irmã Marta")
    code = registered.json()["access_code"]

    assert (await api.activate(code)).status_code == 200

    second = await api.activate(code)
    assert second.status_code == 401
    assert second.json()["code"] == "invalid_access_code"
