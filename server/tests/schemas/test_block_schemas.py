"""Tests for the block DTOs."""

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.core.geo import LatLng
from app.schemas.block import BlockCreateIn, BlockOut, BlockPatchIn
from pydantic import ValidationError

TRIANGLE = [
    {"lat": -23.5, "lng": -46.6},
    {"lat": -23.5, "lng": -46.5},
    {"lat": -23.4, "lng": -46.5},
]
WORKED_AT = datetime(2026, 7, 30, 15, 0, tzinfo=UTC)


def test_block_create_in_accepts_a_ring_of_three_points():
    body = BlockCreateIn(polygon=TRIANGLE)

    assert [(p.lat, p.lng) for p in body.polygon] == [
        (-23.5, -46.6),
        (-23.5, -46.5),
        (-23.4, -46.5),
    ]


def test_block_create_in_leaves_the_number_to_the_server_when_it_is_omitted():
    assert BlockCreateIn(polygon=TRIANGLE).number is None


def test_block_create_in_accepts_the_number_the_admin_chose():
    assert BlockCreateIn(number=12, polygon=TRIANGLE).number == 12


@pytest.mark.parametrize("number", [0, -1])
def test_block_create_in_rejects_a_number_below_one(number):
    with pytest.raises(ValidationError):
        BlockCreateIn(number=number, polygon=TRIANGLE)


def test_block_create_in_rejects_a_number_that_is_not_a_whole_one():
    with pytest.raises(ValidationError):
        BlockCreateIn(number=1.5, polygon=TRIANGLE)


def test_block_create_in_rejects_a_ring_with_fewer_than_three_points():
    with pytest.raises(ValidationError):
        BlockCreateIn(polygon=TRIANGLE[:2])


def test_block_create_in_rejects_a_point_outside_the_globe():
    with pytest.raises(ValidationError):
        BlockCreateIn(polygon=[*TRIANGLE[:2], {"lat": 91.0, "lng": 0.0}])


def test_block_create_in_requires_a_polygon():
    with pytest.raises(ValidationError):
        BlockCreateIn(number=1)


def test_block_patch_in_leaves_out_what_is_not_being_changed():
    body = BlockPatchIn(number=7)

    assert body.number == 7
    assert body.polygon is None


def test_block_patch_in_accepts_an_empty_body():
    assert BlockPatchIn().model_dump(exclude_unset=True) == {}


def test_block_patch_in_still_rejects_a_ring_with_fewer_than_three_points():
    with pytest.raises(ValidationError):
        BlockPatchIn(polygon=TRIANGLE[:2])


def test_block_patch_in_still_rejects_a_number_below_one():
    with pytest.raises(ValidationError):
        BlockPatchIn(number=0)


def test_block_out_carries_the_ring_and_the_derived_last_worked_at():
    row = SimpleNamespace(
        id=uuid4(),
        territory_id=uuid4(),
        number=3,
        polygon=[
            LatLng(lat=-23.5, lng=-46.6),
            LatLng(lat=-23.5, lng=-46.5),
            LatLng(lat=-23.4, lng=-46.5),
        ],
        last_worked_at=WORKED_AT,
    )

    dto = BlockOut.model_validate(row)

    assert set(dto.model_dump()) == {"id", "number", "polygon", "last_worked_at"}
    assert dto.polygon[0].lng == -46.6
    assert dto.last_worked_at == WORKED_AT


def test_block_out_reports_a_block_that_was_never_worked_as_null():
    dto = BlockOut(id=uuid4(), number=1, polygon=TRIANGLE, last_worked_at=None)

    assert dto.last_worked_at is None
