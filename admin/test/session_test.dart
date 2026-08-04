/// The silent sign-in, which is the whole reason there is no login screen.
library;

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:territory_admin/data/credentials_store.dart';
import 'package:territory_admin/data/session.dart';
import 'package:territory_core/territory_core.dart';

const stored = Credentials(name: 'Oeste', city: 'Cambé', password: 'a-senha');

final loginBody = jsonEncode({
  'access_token': 'jwt-1',
  'token_type': 'bearer',
  'congregation': {'id': 'c1', 'name': 'Oeste', 'city': 'Cambé'},
});

/// Answers each request from a queue, recording the paths it was asked for.
class FakeServer {
  FakeServer(this._responses);

  final List<http.Response> _responses;
  final List<String> paths = [];

  int get callCount => paths.length;
  int get loginCount => paths.where((p) => p == '/auth/login').length;

  MockClient get client => MockClient((request) async {
    paths.add(request.url.path);
    return _responses.removeAt(0);
  });
}

TerritoryMapApi apiFor(FakeServer server) => TerritoryMapApi(
  baseUrl: Uri.parse('https://example.test'),
  appKey: 'k',
  httpClient: server.client,
);

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

void main() {
  test('signs in by itself before the first call', () async {
    final server = FakeServer([ok(loginBody), ok(<dynamic>[])]);
    final api = apiFor(server);
    final session = Session(api: api, store: InMemoryCredentialsStore(stored));

    await session.run(api.listTerritories);

    expect(server.paths, ['/auth/login', '/admin/territories']);
    expect(session.congregation?.city, 'Cambé');
  });

  test('signs in once, not on every call', () async {
    final server = FakeServer([
      ok(loginBody),
      ok(<dynamic>[]),
      ok(<dynamic>[]),
    ]);
    final api = apiFor(server);
    final session = Session(api: api, store: InMemoryCredentialsStore(stored));

    await session.run(api.listTerritories);
    await session.run(api.listTerritories);

    expect(server.loginCount, 1);
  });

  test('renews the token and retries when it has expired', () async {
    // The token dies between calls: the request 401s, the session logs in
    // again and repeats it. Neither the caller nor the UI ever sees the 401.
    final server = FakeServer([
      ok(loginBody),
      unauthorized(),
      ok(loginBody),
      ok(<dynamic>[]),
    ]);
    final api = apiFor(server);
    final session = Session(api: api, store: InMemoryCredentialsStore(stored));

    final territories = await session.run(api.listTerritories);

    expect(territories, isEmpty);
    expect(server.loginCount, 2);
    expect(server.paths.last, '/admin/territories');
  });

  test('retries exactly once, then gives up', () async {
    final server = FakeServer([
      ok(loginBody),
      unauthorized(),
      ok(loginBody),
      unauthorized(),
    ]);
    final api = apiFor(server);
    final session = Session(api: api, store: InMemoryCredentialsStore(stored));

    await expectLater(
      session.run(api.listTerritories),
      throwsA(isA<ApiErrorException>()),
    );
    expect(server.loginCount, 2);
  });

  test(
    'reports rejected credentials as its own failure, not a raw 401',
    () async {
      // This is the one case the UI has to act on: back to the setup screen,
      // because no amount of retrying fixes a password that changed.
      final server = FakeServer([unauthorized()]);
      final api = apiFor(server);
      final session = Session(
        api: api,
        store: InMemoryCredentialsStore(stored),
      );

      await expectLater(
        session.run(api.listTerritories),
        throwsA(isA<CredentialsRejectedException>()),
      );
    },
  );

  test('does not retry a failure that is not about the token', () async {
    final server = FakeServer([
      ok(loginBody),
      http.Response(
        jsonEncode({'code': 'not_found', 'detail': 'Não encontrado.'}),
        404,
        headers: {'content-type': 'application/json'},
      ),
    ]);
    final api = apiFor(server);
    final session = Session(api: api, store: InMemoryCredentialsStore(stored));

    await expectLater(
      session.run(() => api.getTerritory('t1')),
      throwsA(isA<ApiErrorException>()),
    );
    expect(server.loginCount, 1);
  });

  test('refuses to run before the app has been configured', () async {
    final server = FakeServer([]);
    final api = apiFor(server);
    final session = Session(api: api, store: InMemoryCredentialsStore());

    await expectLater(
      session.run(api.listTerritories),
      throwsA(isA<CredentialsRejectedException>()),
    );
    expect(server.callCount, 0);
  });

  test('only stores credentials the server accepted', () async {
    // Writing first and validating later would leave a broken install behind
    // on a typo, and the app would loop on a login it can never complete.
    final server = FakeServer([unauthorized()]);
    final api = apiFor(server);
    final store = InMemoryCredentialsStore();
    final session = Session(api: api, store: store);

    await expectLater(
      session.configure(stored),
      throwsA(isA<ApiErrorException>()),
    );
    expect(await store.read(), isNull);
  });

  test('stores them once the server accepts', () async {
    final server = FakeServer([ok(loginBody)]);
    final api = apiFor(server);
    final store = InMemoryCredentialsStore();
    final session = Session(api: api, store: store);

    await session.configure(stored);

    expect(await store.read(), stored);
    expect(await session.isConfigured, isTrue);
  });

  test('signing out forgets the credentials', () async {
    final server = FakeServer([ok(loginBody)]);
    final api = apiFor(server);
    final store = InMemoryCredentialsStore();
    final session = Session(api: api, store: store);
    await session.configure(stored);

    await session.signOut();

    expect(await store.read(), isNull);
    expect(session.congregation, isNull);
  });

  test('never puts the password in a string', () {
    expect(stored.toString(), isNot(contains('a-senha')));
  });
}
