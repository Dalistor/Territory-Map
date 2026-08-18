"""Behaviour of the territory: a valid demarcation, uniquely named, invading nobody.

These tests run against a real PostGIS database. The rules under test *are* the
database's predicates -- overlap is `ST_Intersects AND NOT ST_Touches`, containment
is `ST_Within` -- and the interesting cases live exactly at their edges: two
territories sharing a border must be accepted, a block drawn on the territory
outline must count as inside. A stub of those predicates would answer the easy
cases and get the edges wrong, which is where the bugs are.
"""

from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

import pytest
from app.core.exceptions import (
    BlockOutsideTerritoryError,
    DuplicateNameError,
    InvalidPolygonError,
    NotFoundError,
    TerritoryOverlapError,
)
from app.core.geo import LatLng, points_to_wkt
from app.models.block import Block
from app.repositories.block import BlockRepository
from app.repositories.territory import TerritoryRepository
from app.services.territory import TerritoryService
from sqlalchemy.orm import Session

NOW = datetime(2026, 8, 2, 12, 0, tzinfo=UTC)


def square(lat: float, lng: float, size: float = 1.0) -> list[LatLng]:
    """A square ring whose south-west corner is `(lat, lng)`, walked anticlockwise."""
    return [
        LatLng(lat, lng),
        LatLng(lat, lng + size),
        LatLng(lat + size, lng + size),
        LatLng(lat + size, lng),
    ]


@pytest.fixture
def service(session: Session) -> TerritoryService:
    return TerritoryService(
        territories=TerritoryRepository(session),
        blocks=BlockRepository(session),
        now_provider=lambda: NOW,
    )


@pytest.fixture
def draw_block(session: Session) -> Callable[..., Block]:
    """Put a block on the map straight through the repository.

    `BlockService` is a later task, and going through it would make these tests fail
    for reasons that belong to another unit. What the territory rules need from a
    block is only that it exists, is numbered and has an outline.
    """

    def _draw(territory_id: UUID, number: int, points: list[LatLng]) -> Block:
        return BlockRepository(session).create(territory_id, number, points_to_wkt(points))

    return _draw


def test_create_stores_the_territory_and_gives_the_points_back_in_order(
    service: TerritoryService,
    make_congregation,
) -> None:
    congregation = make_congregation()
    points = square(0.0, 0.0)

    territory = service.create(congregation.id, "Centro", points)

    assert territory.name == "Centro"
    assert service.boundary_points(territory) == points


def test_create_with_fewer_than_three_points_is_refused(
    service: TerritoryService,
    make_congregation,
) -> None:
    congregation = make_congregation()

    with pytest.raises(InvalidPolygonError):
        service.create(congregation.id, "Centro", [LatLng(0.0, 0.0), LatLng(0.0, 1.0)])


def test_create_with_a_self_crossing_ring_is_refused(
    service: TerritoryService,
    make_congregation,
) -> None:
    congregation = make_congregation()
    bowtie = [LatLng(0.0, 0.0), LatLng(1.0, 1.0), LatLng(1.0, 0.0), LatLng(0.0, 1.0)]

    with pytest.raises(InvalidPolygonError):
        service.create(congregation.id, "Centro", bowtie)


def test_create_invading_another_territory_of_the_congregation_is_refused(
    service: TerritoryService,
    make_congregation,
) -> None:
    congregation = make_congregation()
    service.create(congregation.id, "Centro", square(0.0, 0.0))

    with pytest.raises(TerritoryOverlapError):
        service.create(congregation.id, "Vila Nova", square(0.5, 0.5))


def test_create_touching_the_border_of_another_territory_is_accepted(
    service: TerritoryService,
    make_congregation,
) -> None:
    """Adjacent territories share the street between them; that is not an invasion."""
    congregation = make_congregation()
    service.create(congregation.id, "Centro", square(0.0, 0.0))

    neighbour = service.create(congregation.id, "Vila Nova", square(0.0, 1.0))

    assert service.boundary_points(neighbour) == square(0.0, 1.0)


def test_create_over_the_same_area_of_another_congregation_is_accepted(
    service: TerritoryService,
    make_congregation,
) -> None:
    """Two congregations may work the same streets; their territories never compare."""
    ours = make_congregation(name="Central")
    theirs = make_congregation(name="Jardim", city="Campinas")
    service.create(theirs.id, "Centro", square(0.0, 0.0))

    territory = service.create(ours.id, "Centro", square(0.0, 0.0))

    assert territory.congregation_id == ours.id


def test_create_with_a_name_already_used_in_the_congregation_is_refused(
    service: TerritoryService,
    make_congregation,
) -> None:
    congregation = make_congregation()
    service.create(congregation.id, "Centro", square(0.0, 0.0))

    with pytest.raises(DuplicateNameError):
        service.create(congregation.id, "Centro", square(10.0, 10.0))


def test_create_with_a_name_used_by_another_congregation_is_accepted(
    service: TerritoryService,
    make_congregation,
) -> None:
    ours = make_congregation(name="Central")
    theirs = make_congregation(name="Jardim", city="Campinas")
    service.create(theirs.id, "Centro", square(10.0, 10.0))

    territory = service.create(ours.id, "Centro", square(0.0, 0.0))

    assert territory.name == "Centro"


def test_get_returns_the_territory_of_the_congregation(
    service: TerritoryService,
    make_congregation,
) -> None:
    congregation = make_congregation()
    created = service.create(congregation.id, "Centro", square(0.0, 0.0))

    found = service.get(congregation.id, created.id)

    assert found.id == created.id


def test_get_of_a_territory_of_another_congregation_is_not_found(
    service: TerritoryService,
    make_congregation,
) -> None:
    """Never 403: confirming the row exists would already leak the other tenant."""
    ours = make_congregation(name="Central")
    theirs = make_congregation(name="Jardim", city="Campinas")
    stranger = service.create(theirs.id, "Centro", square(0.0, 0.0))

    with pytest.raises(NotFoundError):
        service.get(ours.id, stranger.id)


def test_list_returns_only_the_territories_of_the_congregation(
    service: TerritoryService,
    make_congregation,
) -> None:
    ours = make_congregation(name="Central")
    theirs = make_congregation(name="Jardim", city="Campinas")
    service.create(ours.id, "Centro", square(0.0, 0.0))
    service.create(ours.id, "Vila Nova", square(0.0, 1.0))
    service.create(theirs.id, "Alphaville", square(0.0, 0.0))

    found = service.list(ours.id)

    assert [territory.name for territory in found] == ["Centro", "Vila Nova"]


def test_update_renames_the_territory(
    service: TerritoryService,
    make_congregation,
) -> None:
    congregation = make_congregation()
    territory = service.create(congregation.id, "Centro", square(0.0, 0.0))

    updated = service.update(congregation.id, territory.id, name="Centro Velho")

    assert updated.name == "Centro Velho"
    assert service.boundary_points(updated) == square(0.0, 0.0)


def test_update_of_a_territory_of_another_congregation_is_not_found(
    service: TerritoryService,
    make_congregation,
) -> None:
    ours = make_congregation(name="Central")
    theirs = make_congregation(name="Jardim", city="Campinas")
    stranger = service.create(theirs.id, "Centro", square(0.0, 0.0))

    with pytest.raises(NotFoundError):
        service.update(ours.id, stranger.id, name="Sequestrado")

    assert service.get(theirs.id, stranger.id).name == "Centro"


def test_update_redraws_the_boundary_without_the_territory_colliding_with_itself(
    service: TerritoryService,
    make_congregation,
) -> None:
    """The new outline overlaps the old one -- which is what editing an area means."""
    congregation = make_congregation()
    territory = service.create(congregation.id, "Centro", square(0.0, 0.0))
    redrawn = square(0.2, 0.2)

    updated = service.update(congregation.id, territory.id, points=redrawn)

    assert service.boundary_points(updated) == redrawn


def test_update_that_invades_a_neighbouring_territory_is_refused(
    service: TerritoryService,
    make_congregation,
) -> None:
    congregation = make_congregation()
    territory = service.create(congregation.id, "Centro", square(0.0, 0.0))
    service.create(congregation.id, "Vila Nova", square(0.0, 1.0))

    with pytest.raises(TerritoryOverlapError):
        service.update(congregation.id, territory.id, points=square(0.0, 0.5))


def test_update_with_a_self_crossing_ring_is_refused(
    service: TerritoryService,
    make_congregation,
) -> None:
    congregation = make_congregation()
    territory = service.create(congregation.id, "Centro", square(0.0, 0.0))
    bowtie = [LatLng(0.0, 0.0), LatLng(1.0, 1.0), LatLng(1.0, 0.0), LatLng(0.0, 1.0)]

    with pytest.raises(InvalidPolygonError):
        service.update(congregation.id, territory.id, points=bowtie)


def test_update_to_a_name_already_used_in_the_congregation_is_refused(
    service: TerritoryService,
    make_congregation,
) -> None:
    congregation = make_congregation()
    territory = service.create(congregation.id, "Centro", square(0.0, 0.0))
    service.create(congregation.id, "Vila Nova", square(0.0, 1.0))

    with pytest.raises(DuplicateNameError):
        service.update(congregation.id, territory.id, name="Vila Nova")


def test_update_that_keeps_the_territorys_own_name_is_accepted(
    service: TerritoryService,
    make_congregation,
) -> None:
    """Resending the unchanged name with a new boundary must not look like a clash."""
    congregation = make_congregation()
    territory = service.create(congregation.id, "Centro", square(0.0, 0.0))

    updated = service.update(congregation.id, territory.id, name="Centro", points=square(0.2, 0.2))

    assert updated.name == "Centro"
    assert service.boundary_points(updated) == square(0.2, 0.2)


def test_update_that_leaves_blocks_outside_is_refused_naming_their_numbers(
    service: TerritoryService,
    make_congregation,
    draw_block,
) -> None:
    """The admin has to be told which blocks broke, not just that something did."""
    congregation = make_congregation()
    territory = service.create(congregation.id, "Centro", square(0.0, 0.0))
    draw_block(territory.id, 7, square(0.1, 0.1, 0.1))
    draw_block(territory.id, 12, square(0.8, 0.8, 0.1))
    draw_block(territory.id, 30, square(0.6, 0.1, 0.1))

    with pytest.raises(BlockOutsideTerritoryError) as raised:
        service.update(congregation.id, territory.id, points=square(0.0, 0.0, 0.5))

    assert "12" in raised.value.message
    assert "30" in raised.value.message
    assert "7" not in raised.value.message


def test_update_that_leaves_a_single_block_outside_says_so_in_the_singular(
    service: TerritoryService,
    make_congregation,
    draw_block,
) -> None:
    congregation = make_congregation()
    territory = service.create(congregation.id, "Centro", square(0.0, 0.0))
    draw_block(territory.id, 12, square(0.8, 0.8, 0.1))

    with pytest.raises(BlockOutsideTerritoryError) as raised:
        service.update(congregation.id, territory.id, points=square(0.0, 0.0, 0.5))

    assert "A quadra 12 ficou fora da nova demarcação." in raised.value.message


def test_update_that_keeps_every_block_inside_is_accepted(
    service: TerritoryService,
    make_congregation,
    draw_block,
) -> None:
    congregation = make_congregation()
    territory = service.create(congregation.id, "Centro", square(0.0, 0.0))
    draw_block(territory.id, 7, square(0.1, 0.1, 0.1))
    draw_block(territory.id, 12, square(0.8, 0.8, 0.1))
    shrunk = square(0.0, 0.0, 0.95)

    updated = service.update(congregation.id, territory.id, points=shrunk)

    assert service.boundary_points(updated) == shrunk


def test_delete_removes_the_territory(
    service: TerritoryService,
    make_congregation,
) -> None:
    congregation = make_congregation()
    territory = service.create(congregation.id, "Centro", square(0.0, 0.0))

    service.delete(congregation.id, territory.id)

    assert service.list(congregation.id) == []


def test_delete_takes_the_blocks_of_the_territory_with_it(
    service: TerritoryService,
    session: Session,
    make_congregation,
    draw_block,
) -> None:
    congregation = make_congregation()
    territory = service.create(congregation.id, "Centro", square(0.0, 0.0))
    draw_block(territory.id, 7, square(0.1, 0.1, 0.1))
    draw_block(territory.id, 12, square(0.8, 0.8, 0.1))

    service.delete(congregation.id, territory.id)

    assert BlockRepository(session).list_by_territory(territory.id) == []


def test_delete_of_a_territory_of_another_congregation_is_not_found(
    service: TerritoryService,
    make_congregation,
) -> None:
    ours = make_congregation(name="Central")
    theirs = make_congregation(name="Jardim", city="Campinas")
    stranger = service.create(theirs.id, "Centro", square(0.0, 0.0))

    with pytest.raises(NotFoundError):
        service.delete(ours.id, stranger.id)

    assert service.get(theirs.id, stranger.id).id == stranger.id
