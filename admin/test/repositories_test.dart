/// The data layer the screens talk to, instead of the HTTP client.
///
/// Every case here is written against a fake server rather than a fake session:
/// what has to hold is that a repository call reaches the right endpoint *signed
/// in*, and only a real [Session] over a real [TerritoryMapApi] can prove that.
library;

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/testing.dart';
import 'package:territory_admin/data/block_repository.dart';
import 'package:territory_admin/data/credentials_store.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/data/publisher_repository.dart';
import 'package:territory_admin/data/session.dart';
import 'package:territory_admin/data/territory_repository.dart';
import 'package:territory_admin/data/work_log_repository.dart';
import 'package:territory_core/territory_core.dart';

const stored = Credentials(name: 'Oeste', city: 'Cambé', password: 'a-senha');

final loginBody = jsonEncode({
  'access_token': 'jwt-1',
  'token_type': 'bearer',
  'congregation': {'id': 'c1', 'name': 'Oeste', 'city': 'Cambé'},
});

/// One request the fake server was asked to answer.
class RecordedCall {
  RecordedCall(this.method, this.path, this.body);

  final String method;
  final String path;
  final Map<String, dynamic>? body;
}

/// Answers each request from a queue, recording what it was asked for.
class FakeServer {
  FakeServer(this._responses);

  final List<http.Response> _responses;
  final List<RecordedCall> calls = [];

  List<String> get paths => calls.map((call) => call.path).toList();

  int get loginCount => paths.where((path) => path == '/auth/login').length;

  RecordedCall get lastCall => calls.last;

  MockClient get client => MockClient((request) async {
    calls.add(
      RecordedCall(
        request.method,
        request.url.path,
        request.body.isEmpty
            ? null
            : jsonDecode(request.body) as Map<String, dynamic>,
      ),
    );
    return _responses.removeAt(0);
  });
}

TerritoryMapApi apiFor(FakeServer server) => TerritoryMapApi(
  baseUrl: Uri.parse('https://example.test'),
  appKey: 'k',
  httpClient: server.client,
);

/// A session over [api], already holding credentials, as production does.
Session sessionFor(TerritoryMapApi api) =>
    Session(api: api, store: InMemoryCredentialsStore(stored));

ApiTerritoryRepository territoryRepositoryFor(FakeServer server) {
  final api = apiFor(server);
  return ApiTerritoryRepository(api: api, session: sessionFor(api));
}

ApiBlockRepository blockRepositoryFor(FakeServer server) {
  final api = apiFor(server);
  return ApiBlockRepository(api: api, session: sessionFor(api));
}

ApiPublisherRepository publisherRepositoryFor(FakeServer server) {
  final api = apiFor(server);
  return ApiPublisherRepository(api: api, session: sessionFor(api));
}

ApiWorkLogRepository workLogRepositoryFor(FakeServer server) {
  final api = apiFor(server);
  return ApiWorkLogRepository(api: api, session: sessionFor(api));
}

http.Response ok(Object body) => http.Response(
  body is String ? body : jsonEncode(body),
  200,
  headers: {'content-type': 'application/json'},
);

http.Response unauthorized() => http.Response(
  jsonEncode({'detail': 'Sessão inválida ou expirada. Entre de novo.'}),
  401,
  headers: {'content-type': 'application/json'},
);

Map<String, dynamic> territoryJson(
  String id, {
  String name = 'Centro',
  List<Map<String, dynamic>> blocks = const [],
}) => {
  'id': id,
  'name': name,
  'boundary': [
    {'lat': -23.0, 'lng': -51.0},
    {'lat': -23.0, 'lng': -51.1},
    {'lat': -23.1, 'lng': -51.1},
  ],
  'blocks': blocks,
};

/// A publisher with no live code: this file never needs to hold a credential.
Map<String, dynamic> publisherJson(
  String id, {
  String name = 'Ana',
  bool isActive = true,
}) => {
  'id': id,
  'name': name,
  'is_active': isActive,
  'access_code': null,
  'access_code_expires_at': null,
  'activated_at': null,
};

Map<String, dynamic> blockJson(String id, {int number = 1}) => {
  'id': id,
  'number': number,
  'polygon': [
    {'lat': -23.0, 'lng': -51.0},
    {'lat': -23.0, 'lng': -51.05},
    {'lat': -23.05, 'lng': -51.05},
  ],
  'last_worked_at': null,
};

Map<String, dynamic> workLogJson(String id, {String blockId = 'b1'}) => {
  'id': id,
  'block_id': blockId,
  'user': {'id': 'u1', 'name': 'Ana'},
  'worked_at': '2026-08-01T13:00:00Z',
  'created_at': '2026-08-01T13:01:00Z',
};

const ring = [LatLng(-23.0, -51.0), LatLng(-23.0, -51.1), LatLng(-23.1, -51.1)];

void main() {
  group('TerritoryRepository', () {
    test('signs in by itself, then lists and details each territory', () async {
      final server = FakeServer([
        ok(loginBody),
        ok([territoryJson('t1'), territoryJson('t2', name: 'Norte')]),
        ok(territoryJson('t1', blocks: [blockJson('b1', number: 7)])),
        ok(territoryJson('t2', name: 'Norte')),
      ]);
      final repository = territoryRepositoryFor(server);

      final territories = await repository.listWithBlocks();

      expect(server.paths, [
        '/auth/login',
        '/admin/territories',
        '/admin/territories/t1',
        '/admin/territories/t2',
      ]);
      expect(territories.map((t) => t.id), ['t1', 't2']);
      expect(territories.first.blocks.single.number, 7);
    });

    test('creates a territory with the name and the drawn ring', () async {
      final server = FakeServer([ok(loginBody), ok(territoryJson('t1'))]);
      final repository = territoryRepositoryFor(server);

      final created = await repository.create(name: 'Centro', boundary: ring);

      expect(server.lastCall.method, 'POST');
      expect(server.lastCall.path, '/admin/territories');
      expect(server.lastCall.body, {
        'name': 'Centro',
        'boundary': [
          {'lat': -23.0, 'lng': -51.0},
          {'lat': -23.0, 'lng': -51.1},
          {'lat': -23.1, 'lng': -51.1},
        ],
      });
      expect(created.id, 't1');
    });

    test('updates only the fields it was given', () async {
      final server = FakeServer([
        ok(loginBody),
        ok(territoryJson('t1', name: 'Centro Novo')),
      ]);
      final repository = territoryRepositoryFor(server);

      await repository.update('t1', name: 'Centro Novo');

      expect(server.lastCall.method, 'PATCH');
      expect(server.lastCall.path, '/admin/territories/t1');
      expect(server.lastCall.body, {'name': 'Centro Novo'});
    });

    test('deletes a territory', () async {
      final server = FakeServer([ok(loginBody), http.Response('', 204)]);
      final repository = territoryRepositoryFor(server);

      await repository.delete('t1');

      expect(server.lastCall.method, 'DELETE');
      expect(server.lastCall.path, '/admin/territories/t1');
    });
  });

  group('BlockRepository', () {
    test('signs in by itself before creating a block', () async {
      final server = FakeServer([
        ok(loginBody),
        ok(blockJson('b1', number: 3)),
      ]);
      final repository = blockRepositoryFor(server);

      final created = await repository.create(
        territoryId: 't1',
        polygon: ring,
        number: 3,
      );

      expect(server.paths, ['/auth/login', '/admin/territories/t1/blocks']);
      expect(server.lastCall.method, 'POST');
      expect(server.lastCall.body?['number'], 3);
      expect(created.number, 3);
    });

    test('omits the number so the server picks the lowest free one', () async {
      final server = FakeServer([ok(loginBody), ok(blockJson('b1'))]);
      final repository = blockRepositoryFor(server);

      await repository.create(territoryId: 't1', polygon: ring);

      expect(server.lastCall.body?.containsKey('number'), isFalse);
    });

    test('updates a block by its own id', () async {
      final server = FakeServer([
        ok(loginBody),
        ok(blockJson('b1', number: 9)),
      ]);
      final repository = blockRepositoryFor(server);

      await repository.update('b1', number: 9);

      expect(server.lastCall.method, 'PATCH');
      expect(server.lastCall.path, '/admin/blocks/b1');
      expect(server.lastCall.body, {'number': 9});
    });

    test('deletes a block', () async {
      final server = FakeServer([ok(loginBody), http.Response('', 204)]);
      final repository = blockRepositoryFor(server);

      await repository.delete('b1');

      expect(server.lastCall.method, 'DELETE');
      expect(server.lastCall.path, '/admin/blocks/b1');
    });
  });

  group('PublisherRepository', () {
    test('signs in by itself before listing the publishers', () async {
      final server = FakeServer([
        ok(loginBody),
        ok([publisherJson('u1')]),
      ]);
      final repository = publisherRepositoryFor(server);

      final publishers = await repository.list();

      expect(server.paths, ['/auth/login', '/admin/users']);
      expect(publishers.single.name, 'Ana');
    });

    test('creates a publisher from the typed name', () async {
      final server = FakeServer([ok(loginBody), ok(publisherJson('u1'))]);
      final repository = publisherRepositoryFor(server);

      await repository.create('Ana');

      expect(server.lastCall.method, 'POST');
      expect(server.lastCall.path, '/admin/users');
      expect(server.lastCall.body, {'name': 'Ana'});
    });

    test('asks for a fresh access code', () async {
      final server = FakeServer([ok(loginBody), ok(publisherJson('u1'))]);
      final repository = publisherRepositoryFor(server);

      await repository.regenerateCode('u1');

      expect(server.lastCall.method, 'POST');
      expect(server.lastCall.path, '/admin/users/u1/access-code');
    });

    test('sends the activity it was given, without flipping it', () async {
      // Deciding the opposite here would make "Desativar" reactivate someone
      // whose access the admin just revoked. The screen owns the inversion.
      final server = FakeServer([
        ok(loginBody),
        ok(publisherJson('u1', isActive: false)),
        ok(publisherJson('u1')),
      ]);
      final repository = publisherRepositoryFor(server);

      await repository.setActive('u1', false);
      expect(server.lastCall.body, {'is_active': false});

      await repository.setActive('u1', true);
      expect(server.lastCall.body, {'is_active': true});
      expect(server.lastCall.method, 'PATCH');
      expect(server.lastCall.path, '/admin/users/u1');
    });
  });

  group('WorkLogRepository', () {
    test('signs in by itself before reading a block history', () async {
      final server = FakeServer([
        ok(loginBody),
        ok([workLogJson('w1')]),
      ]);
      final repository = workLogRepositoryFor(server);

      final logs = await repository.listFor('b1');

      expect(server.paths, ['/auth/login', '/admin/blocks/b1/work-logs']);
      expect(logs.single.publisher.name, 'Ana');
    });

    test('deletes a log by its own id, not by the block', () async {
      final server = FakeServer([ok(loginBody), http.Response('', 204)]);
      final repository = workLogRepositoryFor(server);

      await repository.delete('w1');

      expect(server.lastCall.method, 'DELETE');
      expect(server.lastCall.path, '/admin/work-logs/w1');
    });
  });

  group('an expired token', () {
    test(
      'is renewed and the call repeated, without the caller seeing it',
      () async {
        // The JWT lasts 12 hours, so this is the ordinary case after a lunch
        // break: the screen asks again and gets data, not an error.
        final server = FakeServer([
          ok(loginBody),
          unauthorized(),
          ok(loginBody),
          ok([publisherJson('u1')]),
        ]);
        final repository = publisherRepositoryFor(server);

        final publishers = await repository.list();

        expect(publishers.single.id, 'u1');
        expect(server.loginCount, 2);
        expect(server.paths.last, '/admin/users');
      },
    );

    test('replays the whole listing, details included', () async {
      // `listWithBlocks` is several requests inside one `run`, so the retry
      // repeats all of them -- half a listing would be worse than none.
      final server = FakeServer([
        ok(loginBody),
        ok([territoryJson('t1')]),
        unauthorized(),
        ok(loginBody),
        ok([territoryJson('t1')]),
        ok(territoryJson('t1', blocks: [blockJson('b1')])),
      ]);
      final repository = territoryRepositoryFor(server);

      final territories = await repository.listWithBlocks();

      expect(territories.single.blocks.single.id, 'b1');
      expect(server.loginCount, 2);
      expect(server.paths, [
        '/auth/login',
        '/admin/territories',
        '/admin/territories/t1',
        '/auth/login',
        '/admin/territories',
        '/admin/territories/t1',
      ]);
    });

    test('is retried once, not in a loop', () async {
      final server = FakeServer([
        ok(loginBody),
        unauthorized(),
        ok(loginBody),
        unauthorized(),
      ]);
      final repository = blockRepositoryFor(server);

      await expectLater(
        repository.delete('b1'),
        throwsA(isA<ApiErrorException>()),
      );
      expect(server.loginCount, 2);
    });
  });

  test('the providers hand out repositories over a single session', () async {
    // Each repository building its own api would set the token on a different
    // instance, and every call after the first would 401 forever.
    final server = FakeServer([
      ok(loginBody),
      ok(<dynamic>[]),
      http.Response('', 204),
    ]);
    final container = ProviderContainer(
      overrides: [
        apiProvider.overrideWithValue(apiFor(server)),
        credentialsStoreProvider.overrideWithValue(
          InMemoryCredentialsStore(stored),
        ),
      ],
    );
    addTearDown(container.dispose);

    await container.read(territoryRepositoryProvider).listWithBlocks();
    await container.read(blockRepositoryProvider).delete('b1');

    expect(server.loginCount, 1);
    expect(server.paths, [
      '/auth/login',
      '/admin/territories',
      '/admin/blocks/b1',
    ]);
    expect(
      container.read(publisherRepositoryProvider),
      isA<ApiPublisherRepository>(),
    );
    expect(
      container.read(workLogRepositoryProvider),
      isA<ApiWorkLogRepository>(),
    );
  });

  test('a failure that is not about the token surfaces as it is', () async {
    // Overlapping territories, a duplicate block number, a name already taken:
    // messages the admin can act on. Signing in again would fix none of them.
    final server = FakeServer([
      ok(loginBody),
      http.Response(
        jsonEncode({
          'code': 'territory_overlap',
          'detail': 'A demarcação invade o território Norte.',
        }),
        409,
        headers: {'content-type': 'application/json'},
      ),
    ]);
    final repository = territoryRepositoryFor(server);

    await expectLater(
      repository.create(name: 'Centro', boundary: ring),
      throwsA(
        isA<ApiErrorException>()
            .having((e) => e.statusCode, 'statusCode', 409)
            .having(
              (e) => e.message,
              'message',
              'A demarcação invade o território Norte.',
            ),
      ),
    );
    expect(server.loginCount, 1);
  });
}
