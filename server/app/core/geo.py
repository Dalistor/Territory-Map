"""The single boundary between `(lat, lng)` pairs and the PostGIS representation.

Nothing else in the codebase converts coordinates by hand: PostGIS and GeoJSON
order a position as `(longitude, latitude)` while every client and every model in
this project reads `(latitude, longitude)`, and swapping the two is the classic bug
of this domain. Keeping the conversion here means it is written once and tested once.

This module is pure Python plus Shapely -- no SQLAlchemy, no FastAPI -- so the
pre-validation runs before a connection to the database is ever opened.
"""

from dataclasses import dataclass

from shapely import wkt as shapely_wkt
from shapely.errors import GEOSException
from shapely.geometry import Polygon

from app.core.exceptions import InvalidPolygonError

NOT_A_POLYGON_MESSAGE = (
    "A área recebida não é um polígono válido. Redesenhe a demarcação e envie de novo."
)

# A ring needs three corners to enclose any area at all. Repeating a vertex -- which
# happens when the admin taps twice on the same spot, or when the ring arrives already
# closed -- does not add one, so the count is of *distinct* positions.
MIN_DISTINCT_VERTICES = 3
TOO_FEW_VERTICES_MESSAGE = (
    "A área precisa de pelo menos 3 pontos distintos. Marque mais pontos no mapa antes de salvar."
)

# WGS84 bounds. Poles and antimeridian included: they are real positions.
MIN_LAT, MAX_LAT = -90.0, 90.0
MIN_LNG, MAX_LNG = -180.0, 180.0
LATITUDE_OUT_OF_RANGE_MESSAGE = (
    "Há um ponto com latitude fora do intervalo válido (-90 a 90). "
    "Refaça a marcação desse ponto no mapa."
)
LONGITUDE_OUT_OF_RANGE_MESSAGE = (
    "Há um ponto com longitude fora do intervalo válido (-180 a 180). "
    "Refaça a marcação desse ponto no mapa."
)
SELF_INTERSECTION_MESSAGE = (
    "As linhas da área se cruzam. Ajuste os pontos para que o contorno não passe "
    "por cima de si mesmo."
)


@dataclass(frozen=True)
class LatLng:
    """A WGS84 position, always in `(latitude, longitude)` order."""

    lat: float
    lng: float


def points_to_wkt(points: list[LatLng]) -> str:
    """Render an ordered `(lat, lng)` ring as a closed `POLYGON` WKT in `lng lat` order.

    Callers may hand over an open ring (the usual case, since that is what the admin
    draws) or one that already repeats its first vertex; either way the WKT closes
    exactly once, because a doubled closing vertex makes PostGIS reject the geometry.
    """
    ring = list(points)
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return f"POLYGON(({', '.join(f'{p.lng} {p.lat}' for p in ring)}))"


def validate_polygon(points: list[LatLng]) -> None:
    """Raise `InvalidPolygonError` when the ring cannot become a territory or a block.

    The rules are checked from the most local to the most global, and each one carries
    its own message: the admin has to know *which* rule blocked the drawing to be able
    to fix it. A coordinate outside the globe comes first because a point that is not a
    position on Earth makes every later question meaningless.
    """
    for point in points:
        if not MIN_LAT <= point.lat <= MAX_LAT:
            raise InvalidPolygonError(LATITUDE_OUT_OF_RANGE_MESSAGE)
        if not MIN_LNG <= point.lng <= MAX_LNG:
            raise InvalidPolygonError(LONGITUDE_OUT_OF_RANGE_MESSAGE)

    if len(set(points)) < MIN_DISTINCT_VERTICES:
        raise InvalidPolygonError(TOO_FEW_VERTICES_MESSAGE)

    ring = shapely_wkt.loads(points_to_wkt(points))
    if not ring.is_valid or not ring.exterior.is_simple:
        raise InvalidPolygonError(SELF_INTERSECTION_MESSAGE)


def wkt_to_points(wkt: str) -> list[LatLng]:
    """Parse a `POLYGON` WKT back into an open ring of `(lat, lng)` points.

    The inverse of `points_to_wkt`: the closing vertex that WKT requires is dropped,
    so the list that comes out is the same one the admin drew.

    Anything that is not a polygon raises `InvalidPolygonError` rather than letting a
    Shapely `GEOSException` escape: `app/core/` speaks the domain's error vocabulary,
    and the router already knows how to answer that one.
    """
    try:
        geometry = shapely_wkt.loads(wkt)
    except (GEOSException, TypeError) as error:
        raise InvalidPolygonError(NOT_A_POLYGON_MESSAGE) from error
    if not isinstance(geometry, Polygon):
        raise InvalidPolygonError(NOT_A_POLYGON_MESSAGE)
    return [LatLng(lat=lat, lng=lng) for lng, lat in geometry.exterior.coords[:-1]]
