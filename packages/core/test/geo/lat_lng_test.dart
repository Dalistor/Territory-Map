import 'package:territory_core/geo/lat_lng.dart';
import 'package:test/test.dart';

/// A counter-clockwise unit square around (0, 0), open.
const square = [
  LatLng(0, 0),
  LatLng(0, 1),
  LatLng(1, 1),
  LatLng(1, 0),
];

void main() {
  group('LatLng', () {
    test('reads the API object without swapping the members', () {
      final point = LatLng.fromJson({'lat': -23.55, 'lng': -46.63});

      expect(point.lat, -23.55);
      expect(point.lng, -46.63);
    });

    test('accepts integers on the wire, since JSON has one number type', () {
      final point = LatLng.fromJson({'lat': 10, 'lng': 20});

      expect(point.lat, 10.0);
      expect(point.lng, 20.0);
    });

    test('writes the API object', () {
      expect(const LatLng(-23.55, -46.63).toJson(), {
        'lat': -23.55,
        'lng': -46.63,
      });
    });

    test('writes GeoJSON with longitude first', () {
      expect(const LatLng(-23.55, -46.63).toGeoJson(), [-46.63, -23.55]);
    });

    test('reads GeoJSON, which is the reverse order', () {
      final point = LatLng.fromGeoJson([-46.63, -23.55]);

      expect(point.lat, -23.55);
      expect(point.lng, -46.63);
    });

    test('survives a GeoJSON round trip', () {
      const original = LatLng(-23.55, -46.63);

      expect(LatLng.fromGeoJson(original.toGeoJson()), original);
    });

    test('compares by value, which is what lets a ring be de-duplicated', () {
      expect(const LatLng(1, 2), const LatLng(1, 2));
      expect(const LatLng(1, 2).hashCode, const LatLng(1, 2).hashCode);
      expect(const LatLng(1, 2), isNot(const LatLng(2, 1)));
    });

    test('knows the poles and the antimeridian are real positions', () {
      expect(const LatLng(90, 180).isOnGlobe, isTrue);
      expect(const LatLng(-90, -180).isOnGlobe, isTrue);
    });

    test('rejects a coordinate just past the bounds', () {
      expect(const LatLng(90.0001, 0).isOnGlobe, isFalse);
      expect(const LatLng(0, -180.0001).isOnGlobe, isFalse);
    });

    test('prints readably', () {
      expect(const LatLng(1, 2).toString(), 'LatLng(1.0, 2.0)');
    });
  });

  group('validateRing', () {
    test('accepts a simple square', () {
      expect(() => validateRing(square), returnsNormally);
    });

    test('accepts a ring that already repeats its first point at the end', () {
      expect(() => validateRing([...square, square.first]), returnsNormally);
    });

    test('accepts a concave outline, which a real block often is', () {
      const lShape = [
        LatLng(0, 0),
        LatLng(0, 2),
        LatLng(1, 2),
        LatLng(1, 1),
        LatLng(2, 1),
        LatLng(2, 0),
      ];

      expect(() => validateRing(lShape), returnsNormally);
    });

    test('refuses fewer than three points', () {
      expect(
        () => validateRing(const [LatLng(0, 0), LatLng(1, 1)]),
        throwsA(
          isA<InvalidPolygonException>().having(
            (e) => e.problem,
            'problem',
            PolygonProblem.tooFewPoints,
          ),
        ),
      );
    });

    test('counts distinct points, so a repeated corner does not make three',
        () {
      expect(
        () => validateRing(const [LatLng(0, 0), LatLng(0, 0), LatLng(1, 1)]),
        throwsA(
          isA<InvalidPolygonException>().having(
            (e) => e.problem,
            'problem',
            PolygonProblem.tooFewPoints,
          ),
        ),
      );
    });

    test('tolerates a duplicated point when three distinct ones remain', () {
      expect(
        () => validateRing(const [
          LatLng(0, 0),
          LatLng(0, 0),
          LatLng(0, 1),
          LatLng(1, 1),
        ]),
        returnsNormally,
      );
    });

    test('refuses a figure eight', () {
      const bowtie = [
        LatLng(0, 0),
        LatLng(1, 1),
        LatLng(1, 0),
        LatLng(0, 1),
      ];

      expect(
        () => validateRing(bowtie),
        throwsA(
          isA<InvalidPolygonException>().having(
            (e) => e.problem,
            'problem',
            PolygonProblem.selfIntersecting,
          ),
        ),
      );
    });

    test('refuses an outline that doubles back along itself', () {
      const spike = [
        LatLng(0, 0),
        LatLng(0, 2),
        LatLng(0, 1),
        LatLng(1, 1),
      ];

      expect(
        () => validateRing(spike),
        throwsA(
          isA<InvalidPolygonException>().having(
            (e) => e.problem,
            'problem',
            PolygonProblem.selfIntersecting,
          ),
        ),
      );
    });

    test('refuses a coordinate off the globe, and says which one', () {
      expect(
        () => validateRing(const [
          LatLng(0, 0),
          LatLng(0, 1),
          LatLng(91, 1),
        ]),
        throwsA(
          isA<InvalidPolygonException>()
              .having((e) => e.problem, 'problem', PolygonProblem.offGlobe)
              .having((e) => e.message, 'message', contains('91')),
        ),
      );
    });

    test('reports an off-globe point before complaining about the shape', () {
      expect(
        () => validateRing(const [LatLng(999, 0), LatLng(0, 1)]),
        throwsA(
          isA<InvalidPolygonException>().having(
            (e) => e.problem,
            'problem',
            PolygonProblem.offGlobe,
          ),
        ),
      );
    });

    test('every message is written for the admin, in Portuguese', () {
      for (final ring in <List<LatLng>>[
        const [LatLng(0, 0), LatLng(1, 1)],
        const [LatLng(0, 0), LatLng(1, 1), LatLng(1, 0), LatLng(0, 1)],
        const [LatLng(999, 0), LatLng(0, 1), LatLng(1, 1)],
      ]) {
        expect(
          () => validateRing(ring),
          throwsA(
            isA<InvalidPolygonException>().having(
              (e) => e.toString(),
              'toString',
              matches(RegExp('[çãéêáíú]|precisa|cruzam|fora')),
            ),
          ),
        );
      }
    });
  });

  group('isValidRing', () {
    test('answers true instead of throwing, for the drawing loop', () {
      expect(isValidRing(square), isTrue);
    });

    test('answers false for a shape still being drawn', () {
      expect(isValidRing(const [LatLng(0, 0), LatLng(1, 1)]), isFalse);
    });
  });

  group('ring serialisation', () {
    test('reads the API ring', () {
      final ring = ringFromJson([
        {'lat': 0, 'lng': 0},
        {'lat': 0, 'lng': 1},
        {'lat': 1, 'lng': 1},
      ]);

      expect(ring, const [LatLng(0, 0), LatLng(0, 1), LatLng(1, 1)]);
    });

    test('writes the API ring open, because the server closes it', () {
      expect(ringToJson([...square, square.first]), hasLength(square.length));
    });

    test('leaves an already open ring alone', () {
      expect(ringToJson(square), hasLength(square.length));
    });

    test('survives a round trip through the wire format', () {
      expect(ringFromJson(ringToJson(square)), square);
    });
  });
}
