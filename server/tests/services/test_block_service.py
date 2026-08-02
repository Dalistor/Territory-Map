"""Behaviour of the block: numbered, inside its territory, invading no sibling.

These tests run against a real PostGIS database, for the same reason the territory
ones do: the rules under test *are* the database's predicates. Containment is
`ST_Within`, which includes the border, so a block drawn exactly over the territory
outline is inside it; overlap is `ST_Intersects AND NOT ST_Touches`, so two blocks
sharing a street corner are not in conflict. Those two edges are where the bugs
live, and a stub of the predicates would answer the easy cases and get them wrong.
"""

from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

import pytest
from app.core.exceptions import (
    BlockOutsideTerritoryError,
    BlockOverlapError,
    DuplicateBlockNumberError,
    InvalidPolygonError,
    NotFoundError,
)
from app.core.geo import LatLng, points_to_wkt
from app.models.territory import Territory
from app.repositories.block import BlockRepository
from app.repositories.territory import TerritoryRepository
from app.services.block import BlockService
from sqlalchemy.orm import Session

NOW = datetime(2026, 8, 2, 12, 0, tzinfo=UTC)


def square(lat: float, lng: float, size: float = 1.0) -> list[LatLng]:
    """A square ring whose south-west corner is `(lat, lng)`, walked anticlockwise.

    The corners are rounded because binary floats do not add decimals exactly
    (`0.2 + 0.1` is `0.30000000000000004`), and PostGIS hands the coordinate back
    at its own precision. Rounding here keeps the comparison about the geometry
    instead of about the last bit of a float.
    """
    far_lat, far_lng = round(lat + size, 9), round(lng + size, 9)
    return [
        LatLng(lat, lng),
        LatLng(lat, far_lng),
        LatLng(far_lat, far_lng),
        LatLng(far_lat, lng),
    ]


@pytest.fixture
def service(session: Session) -> BlockService:
    return BlockService(
        blocks=BlockRepository(session),
        territories=TerritoryRepository(session),
        now_provider=lambda: NOW,
    )


@pytest.fixture
def make_territory(session: Session) -> Callable[..., Territory]:
    """Draw a territory straight through the repository.

    `TerritoryService` owns its own rules and its own tests; going through it here
    would let a territory bug fail the block suite for a reason that belongs to
    another unit. What a block needs from a territory is only that it exists and
    has a demarcation.
    """

    def _make(
        congregation_id: UUID,
        name: str = "Centro",
        points: list[LatLng] | None = None,
    ) -> Territory:
        ring = square(0.0, 0.0) if points is None else points
        return TerritoryRepository(session).create(congregation_id, name, points_to_wkt(ring))

    return _make


def test_create_stores_the_block_and_gives_the_points_back_in_order(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    points = square(0.1, 0.1, 0.1)

    block = service.create(congregation.id, territory.id, points)

    assert block.territory_id == territory.id
    assert service.polygon_points(block) == points


def test_create_without_a_number_takes_the_first_one_of_the_territory(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)

    block = service.create(congregation.id, territory.id, square(0.1, 0.1, 0.1))

    assert block.number == 1


def test_create_without_a_number_fills_the_first_gap_in_the_numbering(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    """Numbers come from the paper map, so they arrive with gaps -- fill them."""
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    service.create(congregation.id, territory.id, square(0.1, 0.1, 0.1), number=1)
    service.create(congregation.id, territory.id, square(0.1, 0.3, 0.1), number=2)
    service.create(congregation.id, territory.id, square(0.1, 0.5, 0.1), number=4)

    block = service.create(congregation.id, territory.id, square(0.1, 0.7, 0.1))

    assert block.number == 3


def test_create_with_a_number_chosen_by_the_admin_keeps_it_even_out_of_sequence(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)

    block = service.create(congregation.id, territory.id, square(0.1, 0.1, 0.1), number=42)

    assert block.number == 42


def test_create_with_a_number_already_used_in_the_territory_is_refused(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    service.create(congregation.id, territory.id, square(0.1, 0.1, 0.1), number=7)

    with pytest.raises(DuplicateBlockNumberError):
        service.create(congregation.id, territory.id, square(0.1, 0.3, 0.1), number=7)


def test_create_with_a_number_used_in_another_territory_is_accepted(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    """Every territory has its own quadra 1; the numbering is not global."""
    congregation = make_congregation()
    centro = make_territory(congregation.id, "Centro", square(0.0, 0.0))
    vila_nova = make_territory(congregation.id, "Vila Nova", square(0.0, 1.0))
    service.create(congregation.id, centro.id, square(0.1, 0.1, 0.1), number=7)

    block = service.create(congregation.id, vila_nova.id, square(0.1, 1.1, 0.1), number=7)

    assert block.number == 7
    assert block.territory_id == vila_nova.id


def test_create_with_a_single_vertex_outside_the_territory_is_refused(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    """One corner over the line is enough: the block must be entirely contained."""
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    leaking = [LatLng(0.1, 0.1), LatLng(0.1, 0.2), LatLng(1.5, 0.15)]

    with pytest.raises(BlockOutsideTerritoryError):
        service.create(congregation.id, territory.id, leaking)


def test_create_matching_the_territory_outline_exactly_is_accepted(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    """A one-block territory is legitimate: `ST_Within` counts the border as inside."""
    congregation = make_congregation()
    outline = square(0.0, 0.0)
    territory = make_territory(congregation.id, points=outline)

    block = service.create(congregation.id, territory.id, outline)

    assert service.polygon_points(block) == outline


def test_create_invading_another_block_of_the_territory_is_refused(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    service.create(congregation.id, territory.id, square(0.1, 0.1, 0.2))

    with pytest.raises(BlockOverlapError):
        service.create(congregation.id, territory.id, square(0.2, 0.2, 0.2))


def test_create_touching_another_block_is_accepted(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    """Neighbouring blocks share the street between them; that is not an invasion."""
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    service.create(congregation.id, territory.id, square(0.1, 0.1, 0.1))
    neighbour = square(0.1, 0.2, 0.1)

    block = service.create(congregation.id, territory.id, neighbour)

    assert service.polygon_points(block) == neighbour


def test_create_with_a_self_crossing_ring_is_refused(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    bowtie = [LatLng(0.1, 0.1), LatLng(0.3, 0.3), LatLng(0.3, 0.1), LatLng(0.1, 0.3)]

    with pytest.raises(InvalidPolygonError):
        service.create(congregation.id, territory.id, bowtie)


def test_create_with_fewer_than_three_points_is_refused(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)

    with pytest.raises(InvalidPolygonError):
        service.create(congregation.id, territory.id, [LatLng(0.1, 0.1), LatLng(0.1, 0.2)])


def test_create_in_a_territory_of_another_congregation_is_not_found(
    service: BlockService,
    session: Session,
    make_congregation,
    make_territory,
) -> None:
    """Never 403: acknowledging the territory would already leak the other tenant."""
    ours = make_congregation(name="Central")
    theirs = make_congregation(name="Jardim", city="Campinas")
    stranger = make_territory(theirs.id)

    with pytest.raises(NotFoundError):
        service.create(ours.id, stranger.id, square(0.1, 0.1, 0.1))

    assert BlockRepository(session).list_by_territory(stranger.id) == []


def test_create_leaves_the_block_never_worked(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    """`None` is what the map paints as "never covered" -- it is not a missing value."""
    congregation = make_congregation()
    territory = make_territory(congregation.id)

    block = service.create(congregation.id, territory.id, square(0.1, 0.1, 0.1))

    assert block.last_worked_at is None


def test_list_returns_the_blocks_of_the_territory_in_numeric_order(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    centro = make_territory(congregation.id, "Centro", square(0.0, 0.0))
    vila_nova = make_territory(congregation.id, "Vila Nova", square(0.0, 1.0))
    service.create(congregation.id, centro.id, square(0.1, 0.1, 0.1), number=9)
    service.create(congregation.id, centro.id, square(0.1, 0.3, 0.1), number=2)
    service.create(congregation.id, vila_nova.id, square(0.1, 1.1, 0.1), number=1)

    blocks = service.list(congregation.id, centro.id)

    assert [block.number for block in blocks] == [2, 9]


def test_list_of_a_territory_of_another_congregation_is_not_found(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    ours = make_congregation(name="Central")
    theirs = make_congregation(name="Jardim", city="Campinas")
    stranger = make_territory(theirs.id)
    service.create(theirs.id, stranger.id, square(0.1, 0.1, 0.1))

    with pytest.raises(NotFoundError):
        service.list(ours.id, stranger.id)


def test_update_renumbers_the_block(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    points = square(0.1, 0.1, 0.1)
    block = service.create(congregation.id, territory.id, points)

    updated = service.update(congregation.id, block.id, number=15)

    assert updated.number == 15
    assert service.polygon_points(updated) == points


def test_update_redraws_the_block_without_it_colliding_with_itself(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    """The new outline overlaps the old one -- which is what reshaping an area means."""
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    block = service.create(congregation.id, territory.id, square(0.1, 0.1, 0.2))
    redrawn = square(0.15, 0.15, 0.2)

    updated = service.update(congregation.id, block.id, points=redrawn)

    assert service.polygon_points(updated) == redrawn


def test_update_that_moves_the_block_outside_the_territory_is_refused(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    block = service.create(congregation.id, territory.id, square(0.1, 0.1, 0.1))

    with pytest.raises(BlockOutsideTerritoryError):
        service.update(congregation.id, block.id, points=square(1.5, 1.5, 0.1))


def test_update_that_invades_another_block_is_refused(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    block = service.create(congregation.id, territory.id, square(0.1, 0.1, 0.1))
    service.create(congregation.id, territory.id, square(0.5, 0.5, 0.2))

    with pytest.raises(BlockOverlapError):
        service.update(congregation.id, block.id, points=square(0.6, 0.6, 0.2))


def test_update_to_a_number_already_used_in_the_territory_is_refused(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    block = service.create(congregation.id, territory.id, square(0.1, 0.1, 0.1), number=1)
    service.create(congregation.id, territory.id, square(0.1, 0.3, 0.1), number=2)

    with pytest.raises(DuplicateBlockNumberError):
        service.update(congregation.id, block.id, number=2)


def test_update_that_keeps_the_blocks_own_number_is_accepted(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    """Resending the unchanged number with a new outline must not look like a clash."""
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    block = service.create(congregation.id, territory.id, square(0.1, 0.1, 0.1), number=7)
    redrawn = square(0.15, 0.15, 0.1)

    updated = service.update(congregation.id, block.id, number=7, points=redrawn)

    assert updated.number == 7
    assert service.polygon_points(updated) == redrawn


def test_update_with_a_self_crossing_ring_is_refused(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    block = service.create(congregation.id, territory.id, square(0.1, 0.1, 0.1))
    bowtie = [LatLng(0.1, 0.1), LatLng(0.3, 0.3), LatLng(0.3, 0.1), LatLng(0.1, 0.3)]

    with pytest.raises(InvalidPolygonError):
        service.update(congregation.id, block.id, points=bowtie)


def test_update_of_a_block_of_another_congregation_is_not_found(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    ours = make_congregation(name="Central")
    theirs = make_congregation(name="Jardim", city="Campinas")
    stranger_territory = make_territory(theirs.id)
    stranger = service.create(theirs.id, stranger_territory.id, square(0.1, 0.1, 0.1), number=3)

    with pytest.raises(NotFoundError):
        service.update(ours.id, stranger.id, number=99)

    assert service.list(theirs.id, stranger_territory.id)[0].number == 3


def test_delete_removes_the_block(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    block = service.create(congregation.id, territory.id, square(0.1, 0.1, 0.1))

    service.delete(congregation.id, block.id)

    assert service.list(congregation.id, territory.id) == []


def test_delete_of_a_block_of_another_congregation_is_not_found(
    service: BlockService,
    make_congregation,
    make_territory,
) -> None:
    ours = make_congregation(name="Central")
    theirs = make_congregation(name="Jardim", city="Campinas")
    stranger_territory = make_territory(theirs.id)
    stranger = service.create(theirs.id, stranger_territory.id, square(0.1, 0.1, 0.1))

    with pytest.raises(NotFoundError):
        service.delete(ours.id, stranger.id)

    assert [block.id for block in service.list(theirs.id, stranger_territory.id)] == [stranger.id]
