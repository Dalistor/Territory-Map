/// The screen that hands credentials to real people.
///
/// The repository is a fake behind `publisherRepositoryProvider`, and `now` is
/// injected into `PublishersScreen`, so whether a code is still alive is decided
/// by the fixture and not by the day the suite runs.
///
/// The access codes below are made up. A test may assert that one reaches the
/// screen -- that is the whole point of the screen -- but none of them is ever
/// printed.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/data/publisher_repository.dart';
import 'package:territory_admin/presentation/publishers_screen.dart';
import 'package:territory_core/territory_core.dart';

/// A fixed "now", so "expires in 20 hours" is a date and not a moving target.
final now = DateTime(2026, 8, 7, 12);

/// Access already revoked. The work log stays regardless.
const revoked = Publisher(id: 'p1', name: 'Ana', isActive: false);

/// A code was minted and nobody has redeemed it yet.
final awaitingCode = Publisher(
  id: 'p2',
  name: 'Bruno',
  isActive: true,
  accessCode: 'MTFH7K2P',
  accessCodeExpiresAt: now.add(const Duration(hours: 20)),
);

/// The code ran out of its 24 hours before anyone typed it.
final expiredCode = Publisher(
  id: 'p3',
  name: 'Carla',
  isActive: true,
  accessCode: 'QRS4TUV9',
  accessCodeExpiresAt: now.subtract(const Duration(hours: 1)),
);

/// Redeemed: the server nulled the code and stamped the activation.
final onDevice = Publisher(
  id: 'p4',
  name: 'Daniel',
  isActive: true,
  activatedAt: now.subtract(const Duration(days: 5)),
);

/// Serves whatever the test set, or hangs, or fails -- and records every write
/// so the arguments can be checked, not just the fact that a call happened.
class FakePublisherRepository implements PublisherRepository {
  List<Publisher> publishers = const [];

  /// When set, `list` throws it instead of answering.
  Object? listFailure;

  /// When true, the listing never completes: the loading state, held still.
  bool hangs = false;

  int listCalls = 0;

  final List<String> created = [];
  final List<String> regenerated = [];
  final List<(String, bool)> activeCalls = [];

  /// What `create` and `regenerateCode` hand back when they succeed.
  Publisher? minted;

  /// When set, every write throws it.
  ApiException? writeFailure;

  @override
  Future<List<Publisher>> list() async {
    listCalls++;
    if (hangs) return Completer<List<Publisher>>().future;
    if (listFailure != null) throw listFailure!;
    return publishers;
  }

  @override
  Future<Publisher> create(String name) async {
    created.add(name);
    if (writeFailure != null) throw writeFailure!;
    return minted!;
  }

  @override
  Future<Publisher> regenerateCode(String id) async {
    regenerated.add(id);
    if (writeFailure != null) throw writeFailure!;
    return minted!;
  }

  @override
  Future<Publisher> setActive(String id, bool isActive) async {
    activeCalls.add((id, isActive));
    if (writeFailure != null) throw writeFailure!;
    return minted ?? revoked;
  }
}

Future<void> _pumpScreen(
  WidgetTester tester,
  FakePublisherRepository repository, {
  bool settle = true,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [publisherRepositoryProvider.overrideWithValue(repository)],
      child: MaterialApp(home: PublishersScreen(now: now)),
    ),
  );
  if (settle) await tester.pumpAndSettle();
}

/// The subtitle of one person's row, told apart from everyone else's.
String _subtitleOf(WidgetTester tester, String name) {
  final tile = tester.widget<ListTile>(find.widgetWithText(ListTile, name));
  return (tile.subtitle! as Text).data!;
}

/// One person's own menu. Every row wears the same `PopupMenuButton<String>`.
Future<void> _openMenu(WidgetTester tester, String name) async {
  await tester.tap(
    find.descendant(
      of: find.widgetWithText(ListTile, name),
      matching: find.byType(PopupMenuButton<String>),
    ),
  );
  await tester.pumpAndSettle();
}

/// Walks the register flow up to the point where the server would be called.
Future<void> _register(WidgetTester tester, String name) async {
  await tester.tap(find.text('Cadastrar'));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextField), name);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Gerar código'));
  await tester.pumpAndSettle();
}

/// The code as the admin sees it: big, selectable, ready to be read out loud.
Finder _codeOnScreen(String code) => find.byWidgetPredicate(
  (widget) => widget is SelectableText && widget.data == code,
);

void main() {
  testWidgets('a congregation with nobody registered says exactly that', (
    tester,
  ) async {
    await _pumpScreen(tester, FakePublisherRepository());

    expect(find.text('Nenhum publicador cadastrado.'), findsOneWidget);
  });

  testWidgets('a refused listing is reported in the server\'s own words', (
    tester,
  ) async {
    final repository = FakePublisherRepository()
      ..listFailure = const ApiErrorException(
        statusCode: 503,
        code: 'unavailable',
        detail: 'O servidor está em manutenção.',
      );

    await _pumpScreen(tester, repository);

    expect(find.text('O servidor está em manutenção.'), findsOneWidget);
  });

  testWidgets('a failure that is not the server talking gets a plain message', (
    tester,
  ) async {
    final repository = FakePublisherRepository()
      ..listFailure = StateError('parser blew up');

    await _pumpScreen(tester, repository);

    // A bug on this side has no message written for the admin, so the screen
    // supplies one instead of showing a Dart exception.
    expect(
      find.text('Não foi possível carregar os publicadores.'),
      findsOneWidget,
    );
  });

  testWidgets('while the list is on its way, registering is still offered', (
    tester,
  ) async {
    final repository = FakePublisherRepository()..hangs = true;

    await _pumpScreen(tester, repository, settle: false);
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    // Unlike drawing a territory, adding a person does not depend on knowing
    // who is already there -- the server owns the uniqueness of the name.
    expect(find.text('Cadastrar'), findsOneWidget);
  });

  testWidgets('registering is refused until a name is typed', (tester) async {
    await _pumpScreen(tester, FakePublisherRepository());

    await tester.tap(find.text('Cadastrar'));
    await tester.pumpAndSettle();

    FilledButton mintButton() => tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Gerar código'),
    );

    expect(mintButton().onPressed, isNull);

    // Spaces are not a name: a code handed to "   " belongs to nobody.
    await tester.enterText(find.byType(TextField), '   ');
    await tester.pumpAndSettle();
    expect(mintButton().onPressed, isNull);

    await tester.enterText(find.byType(TextField), 'Maria');
    await tester.pumpAndSettle();
    expect(mintButton().onPressed, isNotNull);
  });

  testWidgets('a freshly minted code is shown large, with what it is worth', (
    tester,
  ) async {
    const code = 'JKMN3PQR';
    final repository = FakePublisherRepository()
      ..minted = Publisher(
        id: 'p9',
        name: 'Maria',
        isActive: true,
        accessCode: code,
        accessCodeExpiresAt: now.add(const Duration(hours: 24)),
      );

    await _pumpScreen(tester, repository);
    await _register(tester, 'Maria');

    expect(repository.created, ['Maria']);
    expect(find.text('Código de Maria'), findsOneWidget);
    expect(_codeOnScreen(code), findsOneWidget);
    final shown = tester.widget<SelectableText>(_codeOnScreen(code));
    // Read out loud across a room: it has to be legible from the screen.
    expect(shown.style!.fontSize, greaterThanOrEqualTo(24));
    expect(shown.style!.fontWeight, FontWeight.bold);

    // The three facts the admin has to pass on before closing this dialog.
    expect(find.textContaining('24 horas'), findsOneWidget);
    expect(find.textContaining('uma única vez'), findsOneWidget);
    expect(find.textContaining('não poderá ser consultado'), findsOneWidget);

    // And the list is asked again, so the new person shows up in it.
    expect(repository.listCalls, 2);
  });

  testWidgets('the code can be copied instead of read out loud', (
    tester,
  ) async {
    const code = 'JKMN3PQR';
    final copied = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied.add((call.arguments as Map)['text'] as String);
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );

    final repository = FakePublisherRepository()
      ..minted = Publisher(
        id: 'p9',
        name: 'Maria',
        isActive: true,
        accessCode: code,
        accessCodeExpiresAt: now.add(const Duration(hours: 24)),
      );

    await _pumpScreen(tester, repository);
    await _register(tester, 'Maria');
    await tester.tap(find.text('Copiar'));
    await tester.pumpAndSettle();

    // The code alone, so pasting it into a message carries nothing else.
    expect(copied, [code]);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('the name can be submitted from the keyboard', (tester) async {
    final repository = FakePublisherRepository()
      ..minted = Publisher(
        id: 'p9',
        name: 'Maria',
        isActive: true,
        accessCode: 'JKMN3PQR',
        accessCodeExpiresAt: now.add(const Duration(hours: 24)),
      );

    await _pumpScreen(tester, repository);
    await tester.tap(find.text('Cadastrar'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Maria');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    expect(repository.created, ['Maria']);
    expect(find.text('Código de Maria'), findsOneWidget);
  });

  testWidgets('backing out of the form mints nothing', (tester) async {
    final repository = FakePublisherRepository();

    await _pumpScreen(tester, repository);
    await tester.tap(find.text('Cadastrar'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Maria');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();

    expect(repository.created, isEmpty);
    expect(find.byType(AlertDialog), findsNothing);
    expect(repository.listCalls, 1);
  });

  testWidgets('each subtitle names the state that person is actually in', (
    tester,
  ) async {
    final repository = FakePublisherRepository()
      ..publishers = [revoked, awaitingCode, expiredCode, onDevice];

    await _pumpScreen(tester, repository);

    // Revoking takes the access away, not the record of the work done.
    expect(
      _subtitleOf(tester, 'Ana'),
      'Acesso revogado — o histórico de trabalho continua guardado.',
    );
    expect(
      _subtitleOf(tester, 'Bruno'),
      'Código válido, aguardando ser usado.',
    );
    // The code is past its 24 hours, so it is as good as absent.
    expect(
      _subtitleOf(tester, 'Carla'),
      'Sem código válido. Gere um novo para esta pessoa entrar.',
    );
    expect(_subtitleOf(tester, 'Daniel'), 'Ativo neste aparelho.');
  });

  testWidgets('"Ver código" is offered only while there is a live code', (
    tester,
  ) async {
    final repository = FakePublisherRepository()
      ..publishers = [revoked, awaitingCode, expiredCode, onDevice];

    await _pumpScreen(tester, repository);

    await _openMenu(tester, 'Bruno');
    expect(find.text('Ver código'), findsOneWidget);
    await tester.tap(find.text('Ver código'));
    await tester.pumpAndSettle();
    expect(_codeOnScreen(awaitingCode.accessCode!), findsOneWidget);
    await tester.tap(find.text('Fechar'));
    await tester.pumpAndSettle();

    // Expired, redeemed and revoked all have nothing left to show.
    for (final name in ['Carla', 'Daniel', 'Ana']) {
      await _openMenu(tester, name);
      expect(find.text('Ver código'), findsNothing, reason: name);
      expect(find.text('Gerar novo código'), findsOneWidget, reason: name);
      await tester.tapAt(const Offset(400, 20));
      await tester.pumpAndSettle();
    }
  });

  testWidgets('regenerating mints a new code and shows it', (tester) async {
    const code = 'WXY6ZAB8';
    final repository = FakePublisherRepository()
      ..publishers = [onDevice]
      ..minted = Publisher(
        id: onDevice.id,
        name: onDevice.name,
        isActive: true,
        accessCode: code,
        accessCodeExpiresAt: now.add(const Duration(hours: 24)),
      );

    await _pumpScreen(tester, repository);
    await _openMenu(tester, 'Daniel');
    await tester.tap(find.text('Gerar novo código'));
    await tester.pumpAndSettle();

    expect(repository.regenerated, [onDevice.id]);
    expect(find.text('Código de Daniel'), findsOneWidget);
    expect(_codeOnScreen(code), findsOneWidget);
    // The old device is cut off by this, so the list has to be re-read.
    expect(repository.listCalls, 2);
  });

  testWidgets('the toggle sends the opposite of the state it found', (
    tester,
  ) async {
    final repository = FakePublisherRepository()
      ..publishers = [revoked, awaitingCode];

    await _pumpScreen(tester, repository);

    await _openMenu(tester, 'Bruno');
    expect(find.text('Desativar'), findsOneWidget);
    await tester.tap(find.text('Desativar'));
    await tester.pumpAndSettle();
    expect(repository.activeCalls, [('p2', false)]);

    await _openMenu(tester, 'Ana');
    expect(find.text('Reativar'), findsOneWidget);
    await tester.tap(find.text('Reativar'));
    await tester.pumpAndSettle();
    expect(repository.activeCalls, [('p2', false), ('p1', true)]);

    // Both writes changed who can log in, so both refreshed the list.
    expect(repository.listCalls, 3);
  });

  testWidgets('a refused registration is shown and no code is invented', (
    tester,
  ) async {
    final repository = FakePublisherRepository()
      ..writeFailure = const ApiErrorException(
        statusCode: 409,
        code: 'conflict',
        detail: 'Já existe um publicador com esse nome.',
      );

    await _pumpScreen(tester, repository);
    await _register(tester, 'Maria');

    expect(find.byType(SnackBar), findsOneWidget);
    expect(find.text('Já existe um publicador com esse nome.'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
    expect(repository.listCalls, 1);
  });

  testWidgets('a refused regeneration is shown and the old state stands', (
    tester,
  ) async {
    final repository = FakePublisherRepository()
      ..publishers = [onDevice]
      ..writeFailure = const ApiErrorException(
        statusCode: 429,
        code: 'rate_limited',
        detail: 'Muitas tentativas. Tente de novo em um minuto.',
      );

    await _pumpScreen(tester, repository);
    await _openMenu(tester, 'Daniel');
    await tester.tap(find.text('Gerar novo código'));
    await tester.pumpAndSettle();

    expect(find.byType(SnackBar), findsOneWidget);
    expect(
      find.text('Muitas tentativas. Tente de novo em um minuto.'),
      findsOneWidget,
    );
    expect(find.byType(AlertDialog), findsNothing);
    expect(_subtitleOf(tester, 'Daniel'), 'Ativo neste aparelho.');
  });

  testWidgets('a refused toggle is shown and access is unchanged', (
    tester,
  ) async {
    final repository = FakePublisherRepository()
      ..publishers = [awaitingCode]
      ..writeFailure = const ApiErrorException(
        statusCode: 404,
        code: 'not_found',
        detail: 'Este publicador não existe mais.',
      );

    await _pumpScreen(tester, repository);
    await _openMenu(tester, 'Bruno');
    await tester.tap(find.text('Desativar'));
    await tester.pumpAndSettle();

    expect(find.byType(SnackBar), findsOneWidget);
    expect(find.text('Este publicador não existe mais.'), findsOneWidget);
    expect(repository.activeCalls, [('p2', false)]);
    expect(repository.listCalls, 1);
    expect(
      _subtitleOf(tester, 'Bruno'),
      'Código válido, aguardando ser usado.',
    );
  });
}
