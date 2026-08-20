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

    assert set(dto.model_dump()) == {
        "id",
        "number",
        "polygon",
        "last_worked_at",
        "status_override",
    }
    assert dto.polygon[0].lng == -46.6
    assert dto.last_worked_at == WORKED_AT


def test_block_out_reports_a_block_that_was_never_worked_as_null():
    dto = BlockOut(id=uuid4(), number=1, polygon=TRIANGLE, last_worked_at=None)

    assert dto.last_worked_at is None


@pytest.mark.parametrize("status", ["overdue", "never"])
def test_block_patch_in_accepts_the_two_statuses_the_admin_can_force(status):
    assert BlockPatchIn(status_override=status).status_override == status


def test_block_patch_in_tells_an_absent_status_override_from_an_explicit_null():
    # The router reads `model_fields_set` to decide between "do not touch the pinned
    # status" and "put this block back on the automatic colour"; both leave the
    # attribute at None, so the value alone cannot tell them apart.
    absent = BlockPatchIn(number=7)
    explicit = BlockPatchIn(status_override=None)

    assert absent.status_override is None
    assert "status_override" not in absent.model_fields_set
    assert explicit.status_override is None
    assert "status_override" in explicit.model_fields_set


@pytest.mark.parametrize("status", ["recent", "OVERDUE", "", 3])
def test_block_patch_in_rejects_a_status_outside_the_two_the_map_can_pin(status):
    # "recent" is not pinnable -- it is what the dates already say on their own. The
    # casing and the empty string are client bugs, and so is a number.
    with pytest.raises(ValidationError):
        BlockPatchIn(status_override=status)


def test_block_patch_in_carries_the_status_alongside_a_renumbering_and_a_redraw():
    body = BlockPatchIn(number=9, polygon=TRIANGLE, status_override="overdue")

    assert body.number == 9
    assert [(p.lat, p.lng) for p in body.polygon] == [
        (-23.5, -46.6),
        (-23.5, -46.5),
        (-23.4, -46.5),
    ]
    assert body.status_override == "overdue"


def test_block_out_reports_a_block_left_on_the_automatic_colour_as_null():
    dto = BlockOut(id=uuid4(), number=1, polygon=TRIANGLE)

    assert dto.status_override is None
    assert dto.model_dump()["status_override"] is None


def test_block_out_carries_the_status_the_admin_pinned():
    row = SimpleNamespace(
        id=uuid4(),
        number=4,
        polygon=[
            LatLng(lat=-23.5, lng=-46.6),
            LatLng(lat=-23.5, lng=-46.5),
            LatLng(lat=-23.4, lng=-46.5),
        ],
        last_worked_at=None,
        status_override="never",
    )

    assert BlockOut.model_validate(row).status_override == "never"
