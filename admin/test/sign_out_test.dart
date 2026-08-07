/// Leaving the congregation on purpose, instead of clearing the OS keystore.
///
/// The whole app is mounted here, not just the `HomeScreen`: what has to hold
/// is that signing out lands back on the `SetupScreen`, and that routing lives
/// in `main.dart`. The `Session` is the real one over an in-memory store, so
/// "the credentials are gone" is observed, not mocked.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
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

const _password = 'senha-que-nao-pode-vazar';

const _stored = Credentials(name: 'Oeste', city: 'Cambé', password: _password);

/// Counts the calls while still doing the real thing, so the test can assert
/// both that `signOut` was reached and that it emptied the store.
class SpySession extends Session {
  SpySession({required super.api, required super.store});

  int signOutCalls = 0;

  @override
  Future<void> signOut() async {
    signOutCalls++;
    await super.signOut();
  }
}

/// No territory at all: `HomeScreen` then skips the `FlutterMap`, which needs a
/// tile server and a finite size, and the only `more_vert` on screen is the one
/// under test.
class EmptyTerritoryRepository implements TerritoryRepository {
  @override
  Future<List<Territory>> listWithBlocks() async => const [];

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

/// Never reached: nothing in these tests talks to a server. It exists so the
/// real `Session` has an api to hold.
TerritoryMapApi _offlineApi() => TerritoryMapApi(
  baseUrl: Uri.parse('https://example.test'),
  appKey: 'k',
  httpClient: MockClient(
    (_) async => http.Response(jsonEncode({'detail': 'não usado'}), 500),
  ),
);

Future<({SpySession session, InMemoryCredentialsStore store})> _pumpApp(
  WidgetTester tester,
) async {
  final store = InMemoryCredentialsStore(_stored);
  final session = SpySession(api: _offlineApi(), store: store);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        credentialsStoreProvider.overrideWithValue(store),
        sessionProvider.overrideWithValue(session),
        territoryRepositoryProvider.overrideWithValue(
          EmptyTerritoryRepository(),
        ),
      ],
      child: const TerritoryAdminApp(),
    ),
  );
  await tester.pumpAndSettle();
  expect(find.byType(HomeScreen), findsOneWidget);
  return (session: session, store: store);
}

Future<void> _openMenu(WidgetTester tester) async {
  await tester.tap(find.byIcon(Icons.more_vert));
  await tester.pumpAndSettle();
}

/// Everything the admin can read right now, as one string.
String _visibleText(WidgetTester tester) => [
  ...tester.widgetList<Text>(find.byType(Text)).map((text) => text.data ?? ''),
  ...tester
      .widgetList<RichText>(find.byType(RichText))
      .map((rich) => rich.text.toPlainText()),
].join('\n');

/// Only the dialog's own words, so an assertion about it cannot be satisfied by
/// something the rest of the screen happens to say.
String _dialogText(WidgetTester tester) => tester
    .widgetList<Text>(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.byType(Text),
      ),
    )
    .map((text) => text.data ?? '')
    .join(' ');

void main() {
  testWidgets('the way out is in the app bar menu, not one tap away from the '
      'reload button', (tester) async {
    await _pumpApp(tester);

    // Destructive, so it does not sit next to "recarregar" as a bare button.
    expect(find.text('Sair da congregação'), findsNothing);
    await _openMenu(tester);

    expect(find.text('Sair da congregação'), findsOneWidget);
  });

  testWidgets('the dialog says the data goes from this computer, not from the '
      'server', (tester) async {
    final app = await _pumpApp(tester);

    await _openMenu(tester);
    await tester.tap(find.text('Sair da congregação'));
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsOneWidget);
    final body = _dialogText(tester);
    expect(body, contains('neste computador'));
    // The congregation, its territories and its history stay on the server.
    expect(body, contains('servidor'));
    expect(body, contains('nome, a cidade e a senha'));

    // Merely asking destroys nothing.
    expect(app.session.signOutCalls, 0);
    expect(await app.store.read(), _stored);
  });

  testWidgets('confirming forgets the credentials and lands back on setup', (
    tester,
  ) async {
    final app = await _pumpApp(tester);

    await _openMenu(tester);
    await tester.tap(find.text('Sair da congregação'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sair'));
    await tester.pumpAndSettle();

    expect(app.session.signOutCalls, 1);
    // Not a flag flipped in memory: the keystore entry is actually gone.
    expect(await app.store.read(), isNull);
    expect(find.byType(SetupScreen), findsOneWidget);
    expect(find.byType(HomeScreen), findsNothing);
  });

  testWidgets('cancelling keeps the admin where they were', (tester) async {
    final app = await _pumpApp(tester);

    await _openMenu(tester);
    await tester.tap(find.text('Sair da congregação'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();

    expect(app.session.signOutCalls, 0);
    expect(await app.store.read(), _stored);
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.byType(SetupScreen), findsNothing);
  });

  testWidgets('no step of leaving puts the password on screen', (tester) async {
    await _pumpApp(tester);
    expect(_visibleText(tester), isNot(contains(_password)));

    await _openMenu(tester);
    expect(_visibleText(tester), isNot(contains(_password)));

    await tester.tap(find.text('Sair da congregação'));
    await tester.pumpAndSettle();
    expect(_visibleText(tester), isNot(contains(_password)));

    await tester.tap(find.text('Sair'));
    await tester.pumpAndSettle();
    expect(_visibleText(tester), isNot(contains(_password)));
  });
}
