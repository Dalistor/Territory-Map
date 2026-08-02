"""Tests for the coordinate boundary and polygon pre-validation."""

import dataclasses

import pytest
from app.core.exceptions import InvalidPolygonError
from app.core.geo import LatLng, points_to_wkt, validate_polygon, wkt_to_points

# A square around São Paulo. Latitude and longitude sit in clearly different ranges
# on purpose: any test that silently swapped the two would still pass on a square
# built from symmetric numbers.
SQUARE = [
    LatLng(lat=-23.5, lng=-46.6),
    LatLng(lat=-23.5, lng=-46.5),
    LatLng(lat=-23.4, lng=-46.5),
    LatLng(lat=-23.4, lng=-46.6),
]
SQUARE_WKT = "POLYGON((-46.6 -23.5, -46.5 -23.5, -46.5 -23.4, -46.6 -23.4, -46.6 -23.5))"


def test_latlng_is_frozen():
    point = LatLng(lat=-23.5, lng=-46.6)

    with pytest.raises(dataclasses.FrozenInstanceError):
        point.lat = 0.0  # type: ignore[misc]


def test_points_to_wkt_swaps_to_lng_lat_and_closes_the_ring():
    assert points_to_wkt(SQUARE) == SQUARE_WKT


def test_points_to_wkt_does_not_duplicate_an_already_closed_ring():
    already_closed = [*SQUARE, SQUARE[0]]

    assert points_to_wkt(already_closed) == SQUARE_WKT


def test_wkt_to_points_swaps_back_to_lat_lng_and_drops_the_closing_vertex():
    assert wkt_to_points(SQUARE_WKT) == SQUARE


def test_round_trip_of_a_square_preserves_the_points_in_order():
    assert wkt_to_points(points_to_wkt(SQUARE)) == SQUARE


def test_wkt_to_points_accepts_the_spacing_shapely_and_postgis_emit():
    # PostGIS `ST_AsText` writes `POLYGON((...))` and Shapely writes `POLYGON ((...))`.
    spaced = SQUARE_WKT.replace("POLYGON((", "POLYGON ((")

    assert wkt_to_points(spaced) == SQUARE


@pytest.mark.parametrize(
    "bad_wkt", ["POINT(-46.6 -23.5)", "LINESTRING(0 0, 1 1)", "not wkt at all", ""]
)
def test_wkt_to_points_rejects_anything_that_is_not_a_polygon(bad_wkt):
    with pytest.raises(InvalidPolygonError) as raised:
        wkt_to_points(bad_wkt)

    assert "polígono" in str(raised.value).lower()


def test_validate_polygon_accepts_a_well_formed_square():
    assert validate_polygon(SQUARE) is None


@pytest.mark.parametrize(
    "points",
    [
        pytest.param([], id="empty"),
        pytest.param([LatLng(lat=-23.5, lng=-46.6)], id="single point"),
        pytest.param([LatLng(lat=-23.5, lng=-46.6), LatLng(lat=-23.4, lng=-46.5)], id="two points"),
        pytest.param(
            [
                LatLng(lat=-23.5, lng=-46.6),
                LatLng(lat=-23.5, lng=-46.6),
                LatLng(lat=-23.4, lng=-46.5),
            ],
            id="three points but only two distinct",
        ),
    ],
)
def test_validate_polygon_rejects_fewer_than_three_distinct_points(points):
    with pytest.raises(InvalidPolygonError) as raised:
        validate_polygon(points)

    assert "3 pontos distintos" in str(raised.value)


def test_validate_polygon_tolerates_repeated_consecutive_points():
    # The admin tapped twice on the same spot; three distinct corners still remain.
    with_duplicate = [SQUARE[0], SQUARE[0], SQUARE[1], SQUARE[2]]

    assert validate_polygon(with_duplicate) is None


def test_validate_polygon_accepts_a_ring_that_arrives_already_closed():
    assert validate_polygon([*SQUARE, SQUARE[0]]) is None


def test_validate_polygon_rejects_a_self_intersecting_figure_eight():
    # Bow tie: the two diagonals cross in the middle instead of enclosing one area.
    bow_tie = [
        LatLng(lat=-23.5, lng=-46.6),
        LatLng(lat=-23.4, lng=-46.5),
        LatLng(lat=-23.5, lng=-46.5),
        LatLng(lat=-23.4, lng=-46.6),
    ]

    with pytest.raises(InvalidPolygonError) as raised:
        validate_polygon(bow_tie)

    assert "cruzam" in str(raised.value)


def _square_with(point: LatLng) -> list[LatLng]:
    """The reference square with its first corner moved to `point`."""
    return [point, *SQUARE[1:]]


@pytest.mark.parametrize("bad_lat", [90.1, -90.1, 1000.0])
def test_validate_polygon_rejects_latitude_outside_the_valid_range(bad_lat):
    with pytest.raises(InvalidPolygonError) as raised:
        validate_polygon(_square_with(LatLng(lat=bad_lat, lng=-46.6)))

    assert "latitude" in str(raised.value).lower()


@pytest.mark.parametrize("bad_lng", [180.1, -180.1, 1000.0])
def test_validate_polygon_rejects_longitude_outside_the_valid_range(bad_lng):
    with pytest.raises(InvalidPolygonError) as raised:
        validate_polygon(_square_with(LatLng(lat=-23.5, lng=bad_lng)))

    assert "longitude" in str(raised.value).lower()


@pytest.mark.parametrize(
    "corner",
    [
        pytest.param([LatLng(90.0, 180.0), LatLng(89.0, 179.0), LatLng(89.0, 180.0)], id="max"),
        pytest.param(
            [LatLng(-90.0, -180.0), LatLng(-89.0, -179.0), LatLng(-89.0, -180.0)], id="min"
        ),
    ],
)
def test_validate_polygon_accepts_the_exact_bounds_of_the_globe(corner):
    assert validate_polygon(corner) is None


def test_each_broken_rule_reports_a_different_message():
    def message_of(points):
        with pytest.raises(InvalidPolygonError) as raised:
            validate_polygon(points)
        return str(raised.value)

    out_of_range = message_of([LatLng(lat=91.0, lng=-46.6), *SQUARE[1:]])
    too_few = message_of(SQUARE[:2])
    crossing = message_of([SQUARE[0], SQUARE[2], SQUARE[1], SQUARE[3]])

    assert len({out_of_range, too_few, crossing}) == 3
