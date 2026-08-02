"""Tests for the coordinate DTOs."""

import pytest
from app.core.geo import LatLng
from app.schemas.geo import LatLngIn, LatLngOut
from pydantic import ValidationError


def test_latlng_in_accepts_a_position_inside_the_wgs84_bounds():
    point = LatLngIn(lat=-23.5, lng=-46.6)

    assert (point.lat, point.lng) == (-23.5, -46.6)


@pytest.mark.parametrize("lat", [-90.0, 90.0])
def test_latlng_in_accepts_the_poles(lat):
    assert LatLngIn(lat=lat, lng=0.0).lat == lat


@pytest.mark.parametrize("lat", [-90.1, 90.1])
def test_latlng_in_rejects_a_latitude_outside_the_globe(lat):
    with pytest.raises(ValidationError):
        LatLngIn(lat=lat, lng=0.0)


@pytest.mark.parametrize("lng", [-180.0, 180.0])
def test_latlng_in_accepts_the_antimeridian(lng):
    assert LatLngIn(lat=0.0, lng=lng).lng == lng


@pytest.mark.parametrize("lng", [-180.1, 180.1])
def test_latlng_in_rejects_a_longitude_outside_the_globe(lng):
    with pytest.raises(ValidationError):
        LatLngIn(lat=0.0, lng=lng)


def test_latlng_in_rejects_a_coordinate_that_is_not_a_number():
    with pytest.raises(ValidationError):
        LatLngIn(lat="south", lng=-46.6)


def test_latlng_out_is_built_from_the_core_latlng_of_the_geo_module():
    point = LatLngOut.model_validate(LatLng(lat=-23.5, lng=-46.6))

    assert point.model_dump() == {"lat": -23.5, "lng": -46.6}
