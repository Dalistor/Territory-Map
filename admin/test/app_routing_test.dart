/// Which screen the app opens on, which is the only decision `main.dart` makes.
///
/// All four cases run through the real `Session`, so what is being checked is
/// the actual chain -- store, session, `isConfiguredProvider`, routing -- and not
/// a stubbed answer to the question the router asks.
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:territory_admin/data/credentials_store.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/data/session.dart';
import 'package:territory_admin/data/territory_repository.dart';
import 'package:territory_admin/main.dart';
import 'package:territory_admin/presentation/home_screen.dart';
import 'package:territory_admin/presentation/setup_screen.dart';
import 'package:territory_core/territory_core.dart';

const _stored = Credentials(name: 'Oeste', city: 'Cambé', password: 'a-senha');

/// The keystore itself failing -- a corrupted entry, or libsecret refusing to
/// unlock. Retrying does not fix this; typing the credentials again does.
class KeystoreFailure implements Exception {
  const KeystoreFailure();
}

class UnreadableCredentialsStore implements CredentialsStore {
  @override
  Future<Credentials?> read() async => throw const KeystoreFailure();

  @override
  Future<void> write(Credentials credentials) async {}

  @override
  Future<void> clear() async {}
}

/// Answers whatever the test set: an empty map, or the refusal that has to send
/// the admin back to setup.
class StubTerritoryRepository implements TerritoryRepository {
  StubTerritoryRepository({this.failure});

  final Object? failure;

  @override
  Future<List<Territory>> listWithBlocks() async {
    if (failure != null) throw failure!;
    return const [];
  }

  @override
  Future<Territory> create({
    required String name,
    required List<LatLng> boundary,
  }) => throw UnimplementedError();

  @override
  Future<Territory> update(String id, {String? name, List<LatLng>? boundary}) =>
      throw UnimplementedError();

  @override
  Future<void> delete(String id) => throw UnimplementedError();
}

/// Never reached: no test here talks to a server. It exists so the real
/// `Session` has an api to hold.
TerritoryMapApi _offlineApi() => TerritoryMapApi(
  baseUrl: Uri.parse('https://example.test'),
  appKey: 'k',
  httpClient: MockClient(
    (_) async => http.Response(jsonEncode({'detail': 'não usado'}), 500),
  ),
);

Future<void> _pumpApp(
  WidgetTester tester, {
  required CredentialsStore store,
  TerritoryRepository? territories,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiProvider.overrideWithValue(_offlineApi()),
        credentialsStoreProvider.overrideWithValue(store),
        territoryRepositoryProvider.overrideWithValue(
          territories ?? StubTerritoryRepository(),
        ),
      ],
      child: const TerritoryAdminApp(),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a fresh install opens on the setup screen', (tester) async {
    await _pumpApp(tester, store: InMemoryCredentialsStore());

    expect(find.byType(SetupScreen), findsOneWidget);
    expect(find.byType(HomeScreen), findsNothing);
  });

  testWidgets('an install that already has credentials opens on the map', (
    tester,
  ) async {
    await _pumpApp(tester, store: InMemoryCredentialsStore(_stored));

    // The whole point of keeping the password: no login screen, ever again.
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.byType(SetupScreen), findsNothing);
  });

  testWidgets('a keystore that cannot be read sends the admin back to typing, '
      'not to a retry button', (tester) async {
    await _pumpApp(tester, store: UnreadableCredentialsStore());

    expect(find.byType(SetupScreen), findsOneWidget);
    expect(
      find.text('Não foi possível ler os dados guardados neste computador.'),
      findsOneWidget,
    );
    expect(find.text('Tentar de novo'), findsNothing);
  });

  testWidgets('credentials the server stops accepting bring the setup screen '
      'back, saying why', (tester) async {
    await _pumpApp(
      tester,
      store: InMemoryCredentialsStore(_stored),
      territories: StubTerritoryRepository(
        failure: const CredentialsRejectedException(
          'As credenciais guardadas não são mais aceitas pelo servidor.',
        ),
      ),
    );

    expect(find.byType(SetupScreen), findsOneWidget);
    expect(find.byType(HomeScreen), findsNothing);
    expect(
      find.text('As credenciais guardadas não são mais aceitas pelo servidor.'),
      findsOneWidget,
    );
  });

  testWidgets('an ordinary server failure is not mistaken for a rejection', (
    tester,
  ) async {
    await _pumpApp(
      tester,
      store: InMemoryCredentialsStore(_stored),
      territories: StubTerritoryRepository(
        failure: const ApiErrorException(
          statusCode: 500,
          code: 'internal_error',
          detail: 'O servidor falhou.',
        ),
      ),
    );

    // Wrong credentials are the one failure retrying cannot fix. Everything
    // else stays on the map, where there is a retry button.
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.byType(SetupScreen), findsNothing);
  });
}
