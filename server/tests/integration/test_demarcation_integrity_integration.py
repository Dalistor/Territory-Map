"""Redrawing a territory that already has blocks inside it.

A block only means something inside the area that owns it, so shrinking a demarcation
past one of them is refused rather than silently orphaning it. That much has a unit
test. What this flow adds is the second half of the promise, the one only a real
request against a real database can show: after the refusal, *nothing changed*.

The two halves are separable, and the gap between them is where the ugly bug lives. A
service that wrote the new boundary and only then went looking for orphaned blocks
would still answer 422 with the right message -- and would leave the territory redrawn
and the blocks dangling outside it. The check here is therefore made three ways: the
admin reads the territory back over HTTP, the stored geometry is read straight out of
PostGIS, and the blocks are counted and compared. Only the last two would catch a
change that a rollback-less request had already flushed.

The message matters as much as the status. The admin is looking at a map, and "a
demarcação ficou inválida" would leave them hunting; the numbers are how they find the
blocks on screen, so the flow asserts they are in the text.
"""

import pytest
from app.models.block import Block
from app.models.territory import Territory
from sqlalchemy import func, select

pytestmark = pytest.mark.anyio


def stored_boundary(session, territory_id: str) -> str:
    """The demarcation as PostGIS currently holds it, straight from the table.

    Read past every layer the request went through -- no service, no DTO, no response
    cache -- because the question is whether the *database* changed.
    """
    return session.scalar(
        select(func.ST_AsText(Territory.boundary)).where(Territory.id == territory_id)
    )


def stored_blocks(session, territory_id: str) -> list[tuple[int, str]]:
    """Every block of the territory as `(number, outline)`, ordered by number."""
    return [
        (number, outline)
        for number, outline in session.execute(
            select(Block.number, func.ST_AsText(Block.polygon))
            .where(Block.territory_id == territory_id)
            .order_by(Block.number)
        )
    ]


@pytest.fixture
async def mapped_territory(api, register_congregation, square):
    """A congregation whose admin has drawn one territory with two blocks in it.

    Block 1 sits near the western edge and block 2 further east, so a boundary can be
    shrunk to orphan the second alone or both at once.
    """
    register_congregation(name="Central", city="Uberlândia")
    admin_token = (await api.login("Central", "Uberlândia")).json()["access_token"]

    drawn = await api.draw_territory(admin_token, "Centro", square(-18.90, -48.30))
    territory_id = drawn.json()["id"]
    for lng in (-48.299, -48.294):
        created = await api.draw_block(admin_token, territory_id, square(-18.899, lng, side=0.002))
        assert created.status_code == 201, created.text

    return admin_token, territory_id


async def test_shrinking_past_a_block_is_refused_and_names_it(api, mapped_territory, square):
    admin_token, territory_id = mapped_territory

    # The new outline covers only the western half, which leaves block 2 outside.
    response = await api.redraw_territory(admin_token, territory_id, square(-18.90, -48.30, 0.005))

    assert response.status_code == 422
    assert response.json()["code"] == "block_outside_territory"
    assert "quadra 2" in response.json()["detail"]


async def test_a_refused_redraw_leaves_the_database_exactly_as_it_was(
    api, mapped_territory, square, session
):
    """The assertion the unit test cannot make: the refusal was also a non-write."""
    admin_token, territory_id = mapped_territory
    boundary_before = stored_boundary(session, territory_id)
    blocks_before = stored_blocks(session, territory_id)

    refused = await api.redraw_territory(admin_token, territory_id, square(-18.90, -48.30, 0.005))
    assert refused.status_code == 422

    assert stored_boundary(session, territory_id) == boundary_before
    assert stored_blocks(session, territory_id) == blocks_before
    # And what the admin's screen will show next is the old drawing, not the rejected one.
    reread = await api.read_territory(admin_token, territory_id)
    assert reread.json()["boundary"] == square(-18.90, -48.30)
    assert [block["number"] for block in reread.json()["blocks"]] == [1, 2]


async def test_the_message_lists_every_block_that_would_be_orphaned(
    api, mapped_territory, square, session
):
    """Naming only the first would send the admin back for a second refusal."""
    admin_token, territory_id = mapped_territory
    boundary_before = stored_boundary(session, territory_id)

    # Small enough that neither block fits any more.
    response = await api.redraw_territory(admin_token, territory_id, square(-18.90, -48.30, 0.0015))

    assert response.status_code == 422
    assert "quadras 1 e 2" in response.json()["detail"]
    assert stored_boundary(session, territory_id) == boundary_before


async def test_a_smaller_boundary_that_still_holds_every_block_is_accepted(
    api, mapped_territory, square, session
):
    """The control case: the rule is about orphaned blocks, not about shrinking.

    Without it, a `PATCH` broken in some unrelated way would make the refusals above
    pass for the wrong reason.
    """
    admin_token, territory_id = mapped_territory
    boundary_before = stored_boundary(session, territory_id)
    smaller = square(-18.90, -48.30, 0.009)

    response = await api.redraw_territory(admin_token, territory_id, smaller)

    assert response.status_code == 200, response.text
    assert response.json()["boundary"] == smaller
    # Committed, not merely answered: the accepted redraw did reach the table.
    assert stored_boundary(session, territory_id) != boundary_before
    reread = await api.read_territory(admin_token, territory_id)
    assert reread.json()["boundary"] == smaller
    assert [block["number"] for block in reread.json()["blocks"]] == [1, 2]


async def test_a_block_drawn_outside_the_territory_is_refused_too(api, mapped_territory, square):
    """The same invariant approached from the other side, so it cannot be broken either way."""
    admin_token, territory_id = mapped_territory

    response = await api.draw_block(admin_token, territory_id, square(-18.80, -48.20, side=0.002))

    assert response.status_code == 422
    assert response.json()["code"] == "block_outside_territory"
    reread = await api.read_territory(admin_token, territory_id)
    assert [block["number"] for block in reread.json()["blocks"]] == [1, 2]
