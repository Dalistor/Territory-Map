"""Tests for the territory DTOs."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.core.geo import LatLng
from app.schemas.block import BlockOut
from app.schemas.territory import TerritoryCreateIn, TerritoryOut, TerritoryPatchIn
from pydantic import ValidationError

SQUARE = [
    {"lat": -23.5, "lng": -46.6},
    {"lat": -23.5, "lng": -46.5},
    {"lat": -23.4, "lng": -46.5},
    {"lat": -23.4, "lng": -46.6},
]


def test_territory_create_in_accepts_a_name_and_a_boundary():
    body = TerritoryCreateIn(name="Centro", boundary=SQUARE)

    assert body.name == "Centro"
    assert len(body.boundary) == 4


def test_territory_create_in_strips_the_surrounding_whitespace_of_the_name():
    assert TerritoryCreateIn(name="  Centro  ", boundary=SQUARE).name == "Centro"


@pytest.mark.parametrize("name", ["", "   ", "a" * 121])
def test_territory_create_in_rejects_a_blank_or_oversized_name(name):
    with pytest.raises(ValidationError):
        TerritoryCreateIn(name=name, boundary=SQUARE)


def test_territory_create_in_rejects_a_boundary_with_fewer_than_three_points():
    with pytest.raises(ValidationError):
        TerritoryCreateIn(name="Centro", boundary=SQUARE[:2])


def test_territory_create_in_rejects_a_point_outside_the_globe():
    with pytest.raises(ValidationError):
        TerritoryCreateIn(name="Centro", boundary=[*SQUARE[:3], {"lat": 0.0, "lng": 181.0}])


def test_territory_create_in_requires_a_boundary():
    with pytest.raises(ValidationError):
        TerritoryCreateIn(name="Centro")


def test_territory_create_in_does_not_accept_a_congregation_from_the_client():
    assert "congregation_id" not in TerritoryCreateIn.model_fields


def test_territory_patch_in_accepts_a_rename_alone():
    body = TerritoryPatchIn(name="Centro Novo")

    assert body.name == "Centro Novo"
    assert body.boundary is None


def test_territory_patch_in_accepts_an_empty_body():
    assert TerritoryPatchIn().model_dump(exclude_unset=True) == {}


def test_territory_patch_in_still_strips_and_bounds_the_name():
    assert TerritoryPatchIn(name="  Centro  ").name == "Centro"

    with pytest.raises(ValidationError):
        TerritoryPatchIn(name="   ")


def test_territory_patch_in_still_rejects_a_boundary_with_fewer_than_three_points():
    with pytest.raises(ValidationError):
        TerritoryPatchIn(boundary=SQUARE[:2])


def test_territory_out_carries_the_boundary_and_the_blocks_inside_it():
    dto = TerritoryOut(
        id=uuid4(),
        name="Centro",
        boundary=SQUARE,
        blocks=[BlockOut(id=uuid4(), number=1, polygon=SQUARE, last_worked_at=None)],
    )

    assert set(dto.model_dump()) == {
        "id",
        "name",
        "boundary",
        "blocks",
        "assigned_user",
        "rotation_days",
    }
    assert dto.blocks[0].number == 1


def test_territory_out_defaults_to_no_blocks_for_the_listing_endpoint():
    row = SimpleNamespace(
        id=uuid4(),
        congregation_id=uuid4(),
        name="Centro",
        boundary=[
            LatLng(lat=-23.5, lng=-46.6),
            LatLng(lat=-23.5, lng=-46.5),
            LatLng(lat=-23.4, lng=-46.5),
        ],
    )

    dto = TerritoryOut.model_validate(row)

    assert dto.blocks == []
    assert dto.boundary[0].lat == -23.5


def test_territory_out_does_not_share_its_default_block_list_between_instances():
    first = TerritoryOut(id=uuid4(), name="Centro", boundary=SQUARE)
    first.blocks.append(BlockOut(id=uuid4(), number=1, polygon=SQUARE))

    second = TerritoryOut(id=uuid4(), name="Bairro", boundary=SQUARE)

    assert second.blocks == []


def test_territory_patch_in_tells_an_absent_rotation_from_an_explicit_null():
    # The router reads `model_fields_set` to decide between "do not touch the rotation"
    # and "put this territory back on the default"; both leave the attribute at None.
    absent = TerritoryPatchIn(name="Centro")
    explicit = TerritoryPatchIn(rotation_days=None)

    assert absent.rotation_days is None
    assert "rotation_days" not in absent.model_fields_set
    assert explicit.rotation_days is None
    assert "rotation_days" in explicit.model_fields_set


@pytest.mark.parametrize("days", [1, 120, 3650])
def test_territory_patch_in_accepts_a_rotation_from_one_day_to_ten_years(days):
    assert TerritoryPatchIn(rotation_days=days).rotation_days == days


@pytest.mark.parametrize("days", [0, -1, 3651])
def test_territory_patch_in_rejects_a_rotation_outside_one_day_to_ten_years(days):
    # A cycle of zero or fewer days is not a configuration a human meant, and one longer
    # than a decade is a client bug -- neither should reach the column.
    with pytest.raises(ValidationError):
        TerritoryPatchIn(rotation_days=days)


def test_territory_out_serialises_a_territory_that_uses_the_default_rotation():
    dto = TerritoryOut(id=uuid4(), name="Centro", boundary=SQUARE)

    assert dto.rotation_days is None
    assert dto.model_dump()["rotation_days"] is None


def test_territory_out_carries_the_rotation_the_admin_configured():
    row = SimpleNamespace(
        id=uuid4(),
        name="Centro",
        boundary=[
            LatLng(lat=-23.5, lng=-46.6),
            LatLng(lat=-23.5, lng=-46.5),
            LatLng(lat=-23.4, lng=-46.5),
        ],
        rotation_days=60,
    )

    assert TerritoryOut.model_validate(row).rotation_days == 60
