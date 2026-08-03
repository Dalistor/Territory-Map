/// Coordinates, and the only place in the client code that converts between the
/// orders they are written in.
///
/// The API speaks `{"lat": …, "lng": …}` -- named members, never a bare pair --
/// so a client cannot silently swap them. GeoJSON and PostGIS, on the other hand,
/// write `[lng, lat]`, and `flutter_map` takes `(lat, lng)`. That inversion is the
/// classic bug of this project, so it is spelled out once, here, and tested.
library;

import 'dart:math' as math;

import 'package:meta/meta.dart';

/// WGS84 bounds. The poles and the antimeridian are real positions, so inclusive.
const double minLatitude = -90.0;
const double maxLatitude = 90.0;
const double minLongitude = -180.0;
const double maxLongitude = 180.0;

/// Three corners is the least that encloses an area, and they must be distinct.
const int minRingPoints = 3;

/// A position on the globe, immutable and comparable by value.
@immutable
class LatLng {
  const LatLng(this.lat, this.lng);

  /// Reads the API's `{"lat": …, "lng": …}` object.
  factory LatLng.fromJson(Map<String, dynamic> json) => LatLng(
        (json['lat'] as num).toDouble(),
        (json['lng'] as num).toDouble(),
      );

  /// Reads a GeoJSON position, which is `[lng, lat]` -- the reverse order.
  factory LatLng.fromGeoJson(List<dynamic> position) => LatLng(
        (position[1] as num).toDouble(),
        (position[0] as num).toDouble(),
      );

  final double lat;
  final double lng;

  bool get isOnGlobe =>
      lat >= minLatitude &&
      lat <= maxLatitude &&
      lng >= minLongitude &&
      lng <= maxLongitude;

  /// The API's wire format.
  Map<String, double> toJson() => {'lat': lat, 'lng': lng};

  /// GeoJSON order: longitude first.
  List<double> toGeoJson() => [lng, lat];

  @override
  bool operator ==(Object other) =>
      other is LatLng && other.lat == lat && other.lng == lng;

  @override
  int get hashCode => Object.hash(lat, lng);

  @override
  String toString() => 'LatLng($lat, $lng)';
}

/// Why a ring of points is not a usable polygon.
enum PolygonProblem {
  /// A point is not a position on Earth.
  offGlobe,

  /// Fewer than three *distinct* corners; repeated points do not add area.
  tooFewPoints,

  /// An edge crosses another edge -- the outline is a figure eight, not an area.
  selfIntersecting,
}

/// Raised by [validateRing] when a drawing cannot become a polygon.
///
/// This mirrors the server's `InvalidPolygonError`, and exists so the admin can
/// refuse an impossible shape while the user is still drawing it. The server
/// re-checks everything with PostGIS regardless: this is feedback, not authority.
class InvalidPolygonException implements Exception {
  const InvalidPolygonException(this.problem, this.message);

  final PolygonProblem problem;
  final String message;

  @override
  String toString() => message;
}

/// Drops the closing point if the ring repeats its first vertex at the end.
List<LatLng> _openRing(List<LatLng> ring) =>
    ring.length > 1 && ring.first == ring.last
        ? ring.sublist(0, ring.length - 1)
        : ring;

/// The open ring with consecutive duplicates collapsed.
///
/// A repeated point is a zero-length edge, which is a point and cannot cross
/// anything -- but it *is* collinear with everything through it, so leaving it in
/// would report a self-intersection that is really a duplicated vertex. Dropping
/// the edge alone is not enough either: its neighbours then become adjacent in
/// fact while the indices still say otherwise. Collapsing first makes both
/// problems disappear, and matches what the server sees through Shapely.
List<LatLng> _cleanRing(List<LatLng> ring) {
  final open = _openRing(ring);
  final cleaned = <LatLng>[];
  for (final point in open) {
    if (cleaned.isEmpty || cleaned.last != point) cleaned.add(point);
  }
  // The collapse can expose a new duplicate across the seam: (a, b, a, a) opens
  // to (a, b, a), whose last point repeats the first once the ring closes.
  if (cleaned.length > 1 && cleaned.first == cleaned.last) cleaned.removeLast();
  return cleaned;
}

/// Throws [InvalidPolygonException] unless [ring] can be a simple polygon.
///
/// Accepts the ring either open or closed. The order of the checks matters: an
/// off-globe coordinate is reported as such rather than as a shape problem,
/// because it usually means a unit or a parsing mistake, not a bad drawing.
void validateRing(List<LatLng> ring) {
  for (final point in ring) {
    if (!point.isOnGlobe) {
      throw InvalidPolygonException(
        PolygonProblem.offGlobe,
        'A coordenada ${point.lat}, ${point.lng} está fora do globo. '
        'A latitude vai de -90 a 90 e a longitude de -180 a 180.',
      );
    }
  }

  final cleaned = _cleanRing(ring);
  if (cleaned.toSet().length < minRingPoints) {
    throw const InvalidPolygonException(
      PolygonProblem.tooFewPoints,
      'A demarcação precisa de pelo menos 3 pontos diferentes.',
    );
  }

  if (_hasSelfIntersection(cleaned)) {
    throw const InvalidPolygonException(
      PolygonProblem.selfIntersecting,
      'As linhas da demarcação se cruzam. Ajuste os pontos para que o contorno '
      'não passe por cima de si mesmo.',
    );
  }
}

/// Whether [ring] is a valid simple polygon, without throwing.
///
/// For the drawing loop, where the shape is invalid most of the time and an
/// exception per pointer move would be noise.
bool isValidRing(List<LatLng> ring) {
  try {
    validateRing(ring);
    return true;
  } on InvalidPolygonException {
    return false;
  }
}

/// True when any two non-adjacent edges of the closed ring cross.
///
/// Adjacent edges are skipped because they legitimately share a vertex, and the
/// first and last edges are adjacent too once the ring closes.
bool _hasSelfIntersection(List<LatLng> open) {
  final count = open.length;
  for (var i = 0; i < count; i++) {
    final a1 = open[i];
    final a2 = open[(i + 1) % count];
    for (var j = i + 1; j < count; j++) {
      final adjacent = (j + 1) % count == i || j == (i + 1) % count;
      if (adjacent) continue;
      if (_segmentsCross(a1, a2, open[j], open[(j + 1) % count])) return true;
    }
  }
  return false;
}

double _cross(LatLng o, LatLng a, LatLng b) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);

bool _isBetween(LatLng o, LatLng a, LatLng b) =>
    math.min(a.lng, b.lng) <= o.lng &&
    o.lng <= math.max(a.lng, b.lng) &&
    math.min(a.lat, b.lat) <= o.lat &&
    o.lat <= math.max(a.lat, b.lat);

/// Standard orientation test, with the collinear-overlap case handled explicitly.
bool _segmentsCross(LatLng p1, LatLng p2, LatLng q1, LatLng q2) {
  final d1 = _cross(q1, q2, p1);
  final d2 = _cross(q1, q2, p2);
  final d3 = _cross(p1, p2, q1);
  final d4 = _cross(p1, p2, q2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // Collinear and overlapping counts as crossing: the outline doubles back on
  // itself, which PostGIS rejects as not simple just the same.
  if (d1 == 0 && _isBetween(p1, q1, q2)) return true;
  if (d2 == 0 && _isBetween(p2, q1, q2)) return true;
  if (d3 == 0 && _isBetween(q1, p1, p2)) return true;
  if (d4 == 0 && _isBetween(q2, p1, p2)) return true;

  return false;
}

/// Parses the API's ring: a list of `{"lat": …, "lng": …}` objects.
List<LatLng> ringFromJson(List<dynamic> json) => json
    .map((point) => LatLng.fromJson(point as Map<String, dynamic>))
    .toList(growable: false);

/// Serialises a ring for the API, open (the server closes it itself).
List<Map<String, double>> ringToJson(List<LatLng> ring) =>
    _openRing(ring).map((point) => point.toJson()).toList(growable: false);
