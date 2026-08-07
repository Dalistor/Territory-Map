/// The one screen the admin is supposed to see exactly once.
///
/// The `Session` here is the real one, over an in-memory store and a `MockClient`
/// standing in for the server. That is deliberate: what the criteria talk about
/// is what reaches the wire -- a password that arrives trimmed would authenticate
/// against something other than what was typed -- and a fake `Session` would only
/// prove that the screen calls a method.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:territory_admin/data/credentials_store.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/presentation/setup_screen.dart';
import 'package:territory_core/territory_core.dart';

final _loginBody = jsonEncode({
  'access_token': 'jwt-1',
  'token_type': 'bearer',
  'congregation': {'id': 'c1', 'name': 'Oeste', 'city': 'Cambé'},
});

/// Records every request that reached the wire, and answers what the test told
/// it to -- optionally only after the test lets go of [gate].
class FakeServer {
  final List<({String path, Map<String, dynamic> body})> requests = [];

  /// Held open by the in-flight test, so "while the call is running" is a real
  /// state and not a guess about frame timing.
  Completer<void>? gate;

  http.Response Function() respond = () => http.Response(
    _loginBody,
    200,
    headers: {'content-type': 'application/json'},
  );

  Map<String, dynamic> get lastLogin =>
      requests.lastWhere((r) => r.path == '/auth/login').body;

  MockClient get client => MockClient((request) async {
    requests.add((
      path: request.url.path,
      body: jsonDecode(request.body) as Map<String, dynamic>,
    ));
    if (gate != null) await gate!.future;
    return respond();
  });
}

http.Response _refused(String detail) => http.Response(
  jsonEncode({'detail': detail}),
  401,
  headers: {'content-type': 'application/json'},
);

/// The screen plus the one thing the app decides from: whether this
/// installation is configured. Rendering it is how "the provider was
/// invalidated" becomes observable instead of being asserted on internals.
class _Harness extends ConsumerWidget {
  const _Harness({this.reason});

  final String? reason;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final configured = ref.watch(isConfiguredProvider);
    return Scaffold(
      body: Column(
        children: [
          Text('configurado: ${configured.valueOrNull}'),
          Expanded(child: SetupScreen(reason: reason)),
        ],
      ),
    );
  }
}

Future<({FakeServer server, InMemoryCredentialsStore store})> _pumpSetup(
  WidgetTester tester, {
  String? reason,
}) async {
  final server = FakeServer();
  final store = InMemoryCredentialsStore();

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        credentialsStoreProvider.overrideWithValue(store),
        apiProvider.overrideWithValue(
          TerritoryMapApi(
            baseUrl: Uri.parse('https://example.test'),
            appKey: 'k',
            httpClient: server.client,
          ),
        ),
      ],
      child: MaterialApp(home: _Harness(reason: reason)),
    ),
  );
  await tester.pumpAndSettle();
  return (server: server, store: store);
}

Finder _field(String label) => find.widgetWithText(TextFormField, label);

Future<void> _fill(
  WidgetTester tester, {
  String name = 'Oeste',
  String city = 'Cambé',
  String password = 'a-senha',
}) async {
  await tester.enterText(_field('Nome da congregação'), name);
  await tester.enterText(_field('Cidade'), city);
  await tester.enterText(_field('Senha'), password);
}

Future<void> _submit(WidgetTester tester) async {
  await tester.tap(find.text('Entrar'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('an empty form asks for every field and calls no one', (
    tester,
  ) async {
    final app = await _pumpSetup(tester);

    await _submit(tester);

    expect(find.text('Campo obrigatório.'), findsNWidgets(2));
    expect(find.text('Informe a senha.'), findsOneWidget);
    // Nothing was worth asking the server about.
    expect(app.server.requests, isEmpty);
  });

  testWidgets('a missing congregation name alone stops the submission', (
    tester,
  ) async {
    final app = await _pumpSetup(tester);

    await _fill(tester, name: '');
    await _submit(tester);

    expect(find.text('Campo obrigatório.'), findsOneWidget);
    expect(app.server.requests, isEmpty);
  });

  testWidgets('a missing city alone stops the submission', (tester) async {
    final app = await _pumpSetup(tester);

    await _fill(tester, city: '');
    await _submit(tester);

    expect(find.text('Campo obrigatório.'), findsOneWidget);
    expect(app.server.requests, isEmpty);
  });

  testWidgets('a missing password alone stops the submission', (tester) async {
    final app = await _pumpSetup(tester);

    await _fill(tester, password: '');
    await _submit(tester);

    expect(find.text('Informe a senha.'), findsOneWidget);
    expect(app.server.requests, isEmpty);
  });

  testWidgets('a name of nothing but spaces is still a missing name', (
    tester,
  ) async {
    final app = await _pumpSetup(tester);

    await _fill(tester, name: '   ');
    await _submit(tester);

    expect(find.text('Campo obrigatório.'), findsOneWidget);
    expect(app.server.requests, isEmpty);
  });

  testWidgets('name and city are trimmed, and the password is sent byte for '
      'byte', (tester) async {
    final app = await _pumpSetup(tester);

    // A password is a secret byte sequence, not a display string. The server
    // does not trim it either, so trimming it here would authenticate against
    // something other than what the admin typed.
    await _fill(
      tester,
      name: '  Oeste  ',
      city: '  Cambé  ',
      password: '  senha com espaços  ',
    );
    await _submit(tester);

    expect(app.server.lastLogin, {
      'name': 'Oeste',
      'city': 'Cambé',
      'password': '  senha com espaços  ',
    });
  });

  testWidgets('the credentials that are kept are the ones that were sent', (
    tester,
  ) async {
    final app = await _pumpSetup(tester);

    await _fill(tester, name: ' Oeste ', password: ' com espaços ');
    await _submit(tester);

    expect(
      await app.store.read(),
      const Credentials(
        name: 'Oeste',
        city: 'Cambé',
        password: ' com espaços ',
      ),
    );
  });

  testWidgets("the server's refusal is shown in the server's own words", (
    tester,
  ) async {
    final app = await _pumpSetup(tester);
    app.server.respond = () => _refused('Credenciais inválidas.');

    await _fill(tester);
    await _submit(tester);

    expect(find.text('Credenciais inválidas.'), findsOneWidget);
    // Proving they work comes before keeping them: a rejected password must
    // not be left behind for the app to loop on.
    expect(await app.store.read(), isNull);
    expect(find.text('configurado: false'), findsOneWidget);
  });

  testWidgets('a refusal leaves the form filled in, so correcting it needs no '
      'retyping', (tester) async {
    final app = await _pumpSetup(tester);
    app.server.respond = () => _refused('Credenciais inválidas.');

    await _fill(tester, name: 'Oeste', password: 'a-senha');
    await _submit(tester);
    expect(find.text('Oeste'), findsOneWidget);

    // The admin fixes nothing but the server's mood, and submits again: the
    // same three values have to still be there -- including the password, which
    // is obscured and cannot be read off the screen.
    app.server.respond = () => http.Response(
      _loginBody,
      200,
      headers: {'content-type': 'application/json'},
    );
    await _submit(tester);

    expect(app.server.lastLogin, {
      'name': 'Oeste',
      'city': 'Cambé',
      'password': 'a-senha',
    });
  });

  testWidgets('while the server is thinking, the button waits with it', (
    tester,
  ) async {
    final app = await _pumpSetup(tester);
    final gate = Completer<void>();
    app.server.gate = gate;

    await _fill(tester);
    await tester.tap(find.text('Entrar'));
    await tester.pump();

    // Disabled, so an impatient second tap cannot start a second login.
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('Entrar'), findsNothing);

    gate.complete();
    await tester.pumpAndSettle();

    expect(app.server.requests, hasLength(1));
  });

  testWidgets('a successful setup makes the app consider itself configured', (
    tester,
  ) async {
    final app = await _pumpSetup(tester);
    expect(find.text('configurado: false'), findsOneWidget);

    await _fill(tester);
    await _submit(tester);

    // Not merely a local flag: the provider the whole app routes on was
    // invalidated and re-read the store.
    expect(find.text('configurado: true'), findsOneWidget);
    expect(await app.store.read(), isNotNull);
  });

  testWidgets('pressing enter in the password field submits, like the button', (
    tester,
  ) async {
    final app = await _pumpSetup(tester);

    // `_fill` leaves the focus on the password field, which is where an admin
    // who types rather than clicks will be.
    await _fill(tester);
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    expect(app.server.lastLogin, {
      'name': 'Oeste',
      'city': 'Cambé',
      'password': 'a-senha',
    });
    expect(find.text('configurado: true'), findsOneWidget);
  });

  testWidgets('enter on an empty form submits nothing either', (tester) async {
    final app = await _pumpSetup(tester);

    await _fill(tester, name: '');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    expect(find.text('Campo obrigatório.'), findsOneWidget);
    expect(app.server.requests, isEmpty);
  });

  testWidgets('the reason for being back here is shown above the form', (
    tester,
  ) async {
    await _pumpSetup(tester, reason: 'As credenciais não são mais aceitas.');

    expect(find.text('As credenciais não são mais aceitas.'), findsOneWidget);
    expect(find.text('Entrar'), findsOneWidget);
  });
}
