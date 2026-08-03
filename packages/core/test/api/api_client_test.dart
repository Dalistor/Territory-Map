import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:territory_core/territory_core.dart';
import 'package:test/test.dart';

const appKey = 'the-app-key';

/// Captures what the client sent and replies with whatever the test dictates.
class Recorder {
  final List<http.BaseRequest> requests = [];
  final List<String> bodies = [];

  http.BaseRequest get last => requests.last;
  String get lastBody => bodies.last;

  MockClient replying(
    int status,
    Object? body, {
    Map<String, String> headers = const {'content-type': 'application/json'},
  }) {
    return MockClient((request) async {
      requests.add(request);
      bodies.add(request.body);
      return http.Response(
        body is String ? body : jsonEncode(body),
        status,
        headers: headers,
      );
    });
  }

  MockClient throwing(Object error) => MockClient((request) async {
        requests.add(request);
        throw error;
      });
}

TerritoryMapApi apiWith(http.Client client) => TerritoryMapApi(
      baseUrl: Uri.parse('https://example.test'),
      appKey: appKey,
      httpClient: client,
    );

const square = [
  LatLng(0, 0),
  LatLng(0, 1),
  LatLng(1, 1),
  LatLng(1, 0),
];

Map<String, dynamic> territoryJson(
        {List<Map<String, dynamic>> blocks = const []}) =>
    {
      'id': 't1',
      'name': 'Centro',
      'boundary': [
        {'lat': 0, 'lng': 0},
        {'lat': 0, 'lng': 1},
        {'lat': 1, 'lng': 1},
      ],
      'blocks': blocks,
    };

void main() {
  group('headers', () {
    test('sends the app key on every request', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(200, <dynamic>[]));

      await api.listTerritories();

      expect(recorder.last.headers[appKeyHeader], appKey);
    });

    test('sends no Authorization until a token is set', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(200, <dynamic>[]));

      await api.listTerritories();

      expect(recorder.last.headers.containsKey('Authorization'), isFalse);
    });

    test('sends the bearer token once set', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(200, <dynamic>[]))..token = 'jwt-1';

      await api.listTerritories();

      expect(recorder.last.headers['Authorization'], 'Bearer jwt-1');
    });

    test('stops sending the token when it is cleared', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(200, <dynamic>[]))..token = 'jwt-1';
      await api.listTerritories();

      api.token = null;
      await api.listTerritories();

      expect(recorder.last.headers.containsKey('Authorization'), isFalse);
    });
  });

  group('login', () {
    test('returns the token and the congregation', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(200, {
        'access_token': 'jwt-1',
        'token_type': 'bearer',
        'congregation': {'id': 'c1', 'name': 'Oeste', 'city': 'Cambé'},
      }));

      final session = await api.login(
        name: 'Oeste',
        city: 'Cambé',
        password: 'segredo',
      );

      expect(session.accessToken, 'jwt-1');
      expect(session.congregation.city, 'Cambé');
    });

    test('turns a 401 into an exception the UI can show', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(401, {
        'code': 'invalid_credentials',
        'detail': 'Não foi possível entrar.',
      }));

      await expectLater(
        api.login(name: 'x', city: 'y', password: 'z'),
        throwsA(
          isA<ApiErrorException>()
              .having((e) => e.isUnauthorized, 'isUnauthorized', isTrue)
              .having((e) => e.code, 'code', 'invalid_credentials')
              .having((e) => e.message, 'message', 'Não foi possível entrar.'),
        ),
      );
    });
  });

  group('activate', () {
    test('uppercases and trims the code before sending it', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(200, {
        'token': 'app-token',
        'user': {'id': 'u1', 'name': 'Ana'},
        'congregation': {'id': 'c1', 'name': 'Oeste', 'city': 'Cambé'},
      }));

      await api.activate('  ab2c3d4e  ');

      expect(jsonDecode(recorder.lastBody), {'access_code': 'AB2C3D4E'});
    });
  });

  group('territories', () {
    test('parses a listing', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(200, [territoryJson()]));

      final territories = await api.listTerritories();

      expect(territories, hasLength(1));
      expect(territories.single.name, 'Centro');
      expect(territories.single.boundary.first, const LatLng(0, 0));
      expect(territories.single.blocks, isEmpty);
    });

    test('parses the detail with its blocks', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(
        200,
        territoryJson(blocks: [
          {
            'id': 'b1',
            'number': 3,
            'polygon': [
              {'lat': 0, 'lng': 0},
              {'lat': 0, 'lng': 1},
              {'lat': 1, 'lng': 1},
            ],
            'last_worked_at': null,
          },
        ]),
      ));

      final territory = await api.getTerritory('t1');

      expect(territory.blocks.single.number, 3);
      expect(territory.blocks.single.wasNeverWorked, isTrue);
    });

    test('sends the boundary as named lat/lng objects', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(201, territoryJson()));

      await api.createTerritory(name: 'Centro', boundary: square);

      final sent = jsonDecode(recorder.lastBody) as Map<String, dynamic>;
      expect(sent['boundary'], [
        {'lat': 0.0, 'lng': 0.0},
        {'lat': 0.0, 'lng': 1.0},
        {'lat': 1.0, 'lng': 1.0},
        {'lat': 1.0, 'lng': 0.0},
      ]);
    });

    test('refuses an impossible ring without ever hitting the network',
        () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(201, territoryJson()));

      await expectLater(
        api.createTerritory(
          name: 'Centro',
          boundary: const [LatLng(0, 0), LatLng(1, 1)],
        ),
        throwsA(isA<InvalidPolygonException>()),
      );
      expect(recorder.requests, isEmpty);
    });

    test('omits an absent field from a PATCH body', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(200, territoryJson()));

      await api.updateTerritory('t1', name: 'Novo nome');

      final sent = jsonDecode(recorder.lastBody) as Map<String, dynamic>;
      expect(sent.containsKey('boundary'), isFalse);
      expect(sent['name'], 'Novo nome');
    });

    test('surfaces an overlap as a rule violation', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(422, {
        'code': 'territory_overlap',
        'detail': 'A demarcação invade outro território.',
      }));

      await expectLater(
        api.createTerritory(name: 'Centro', boundary: square),
        throwsA(
          isA<ApiErrorException>()
              .having((e) => e.isRuleViolation, 'isRuleViolation', isTrue),
        ),
      );
    });

    test('accepts an empty body on DELETE', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(204, ''));

      await expectLater(api.deleteTerritory('t1'), completes);
    });
  });

  group('blocks', () {
    test('omits the number so the server picks the next free one', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(201, {
        'id': 'b1',
        'number': 3,
        'polygon': [
          {'lat': 0, 'lng': 0},
          {'lat': 0, 'lng': 1},
          {'lat': 1, 'lng': 1},
        ],
        'last_worked_at': null,
      }));

      final block = await api.createBlock(territoryId: 't1', polygon: square);

      final sent = jsonDecode(recorder.lastBody) as Map<String, dynamic>;
      expect(sent.containsKey('number'), isFalse);
      expect(block.number, 3);
    });

    test('reports a duplicate number as a conflict', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(409, {
        'code': 'duplicate_block_number',
        'detail': 'Já existe a quadra 3 neste território.',
      }));

      await expectLater(
        api.createBlock(territoryId: 't1', polygon: square, number: 3),
        throwsA(
          isA<ApiErrorException>()
              .having((e) => e.isConflict, 'isConflict', isTrue),
        ),
      );
    });
  });

  group('marking a block worked', () {
    test('answers true when the server created the record', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(201, ''));

      final created = await api.markBlockWorked(
        blockId: 'b1',
        logId: 'log-1',
        workedAt: DateTime.utc(2026, 8, 3, 12),
      );

      expect(created, isTrue);
    });

    test('answers false when the same log id was already known', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(200, ''));

      final created = await api.markBlockWorked(
        blockId: 'b1',
        logId: 'log-1',
        workedAt: DateTime.utc(2026, 8, 3, 12),
      );

      expect(created, isFalse);
    });

    test('sends worked_at in UTC with an offset', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(201, ''));

      await api.markBlockWorked(
        blockId: 'b1',
        logId: 'log-1',
        workedAt: DateTime.utc(2026, 8, 3, 12),
      );

      final sent = jsonDecode(recorder.lastBody) as Map<String, dynamic>;
      expect(sent['worked_at'], '2026-08-03T12:00:00.000Z');
    });

    test("reports another congregation's block as not found", () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(404, {
        'code': 'not_found',
        'detail': 'Quadra não encontrada.',
      }));

      await expectLater(
        api.markBlockWorked(
          blockId: 'b1',
          logId: 'log-1',
          workedAt: DateTime.utc(2026, 8, 3, 12),
        ),
        throwsA(
          isA<ApiErrorException>()
              .having((e) => e.isNotFound, 'isNotFound', isTrue),
        ),
      );
    });
  });

  group('failures that are not the API speaking', () {
    test('a dropped connection becomes a NetworkException', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.throwing(const SocketErrorStub()));

      await expectLater(
        api.listTerritories(),
        throwsA(isA<NetworkException>()),
      );
    });

    test("a proxy's HTML error page becomes a NetworkException", () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(
        502,
        '<html>Bad Gateway</html>',
        headers: {'content-type': 'text/html'},
      ));

      await expectLater(
        api.listTerritories(),
        throwsA(
          isA<NetworkException>()
              .having((e) => e.message, 'message', contains('502')),
        ),
      );
    });

    test("FastAPI's field-level 422 becomes a client-bug message", () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(422, {
        'detail': [
          {
            'loc': ['body', 'name'],
            'msg': 'field required'
          },
        ],
      }));

      await expectLater(
        api.listTerritories(),
        throwsA(
          isA<ApiErrorException>()
              .having((e) => e.code, 'code', 'invalid_request'),
        ),
      );
    });

    test('an expired token is a recognisable 401, not a network error',
        () async {
      // FastAPI's own HTTPException, which the auth dependencies raise: a bare
      // `detail` string with no `code`. Caught against the live server, where it
      // was surfacing as an opaque NetworkException -- and this is precisely the
      // failure the admin UI must detect to send the user back to the login.
      final recorder = Recorder();
      final api = apiWith(recorder.replying(401, {
        'detail': 'Sessão inválida ou expirada. Entre de novo.',
      }));

      await expectLater(
        api.listTerritories(),
        throwsA(
          isA<ApiErrorException>()
              .having((e) => e.isUnauthorized, 'isUnauthorized', isTrue)
              .having((e) => e.code, 'code', 'unauthorized')
              .having((e) => e.message, 'message', contains('Entre de novo')),
        ),
      );
    });

    test('a bare detail on other statuses gets a code from the status',
        () async {
      final recorder = Recorder();
      final api =
          apiWith(recorder.replying(404, {'detail': 'Não encontrado.'}));

      await expectLater(
        api.getTerritory('t1'),
        throwsA(
          isA<ApiErrorException>()
              .having((e) => e.isNotFound, 'isNotFound', isTrue)
              .having((e) => e.code, 'code', 'not_found'),
        ),
      );
    });

    test('a 200 that is not JSON becomes a NetworkException', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(200, 'not json at all'));

      await expectLater(
        api.listTerritories(),
        throwsA(isA<NetworkException>()),
      );
    });

    test('rate limiting is recognisable so the client can back off', () async {
      final recorder = Recorder();
      final api = apiWith(recorder.replying(429, {
        'code': 'rate_limit_exceeded',
        'detail': 'Muitas tentativas.',
      }));

      await expectLater(
        api.login(name: 'x', city: 'y', password: 'z'),
        throwsA(
          isA<ApiErrorException>()
              .having((e) => e.isRateLimited, 'isRateLimited', isTrue),
        ),
      );
    });
  });
}

/// Stands in for whatever the platform throws when a socket dies.
class SocketErrorStub implements Exception {
  const SocketErrorStub();
}
