"""Coordinate DTOs -- the `(lat, lng)` pair as it crosses the HTTP boundary.

The wire format is `{"lat": …, "lng": …}` in both directions, never a bare array:
a two-element list is exactly where `(lat, lng)` and `(lng, lat)` get swapped, and
naming the members makes that mistake impossible for a client to make silently.
Conversion to the PostGIS `lng lat` order happens once, in `app/core/geo.py`.
"""

from typing import Annotated

from pydantic import BaseModel, Field

from app.schemas.common import OutSchema

# WGS84 bounds, poles and antimeridian included -- they are real positions.
MIN_LAT, MAX_LAT = -90.0, 90.0
MIN_LNG, MAX_LNG = -180.0, 180.0

# Three corners is the least that encloses an area. This counts *positions*, not
# distinct ones: a ring of three points where two coincide passes here and is caught
# by `validate_polygon` in `app/core/geo.py`, which is where geometry is judged.
MIN_RING_POINTS = 3


class LatLngIn(BaseModel):
    """A position sent by a client, rejected outright if it is not on the globe.

    Catching an impossible coordinate here keeps a malformed drawing from reaching
    PostGIS at all; `app/core/geo.py` enforces the same bounds for the points that
    arrive from anywhere other than a request body.
    """

    lat: float = Field(ge=MIN_LAT, le=MAX_LAT)
    lng: float = Field(ge=MIN_LNG, le=MAX_LNG)


class LatLngOut(OutSchema):
    """A position returned to a client.

    Separate from `LatLngIn` on purpose: an output carries no constraints, since it
    reproduces what the database already accepted, and reusing the input model would
    make every response pay for validation of data that is already known to be valid.
    Built straight from the `LatLng` of `app/core/geo.py`.
    """

    lat: float
    lng: float


# The ordered ring a client draws, for both a territory boundary and a block outline.
# Annotating the list itself (rather than the field) is what lets an optional ring in a
# PATCH body keep the same minimum without the constraint landing on the `None`.
RingIn = Annotated[list[LatLngIn], Field(min_length=MIN_RING_POINTS)]
RingOut = list[LatLngOut]
