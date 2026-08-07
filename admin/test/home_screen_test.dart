/// The main screen: the side list, the load/error states and the block colours.
///
/// The repository is a fake behind `territoryRepositoryProvider`, so nothing
/// here touches a server, and `now` is injected into `HomeScreen` so the colour
/// of a block is decided by the test rather than by the day it runs.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/data/territory_repository.dart';
import 'package:territory_admin/presentation/block_editor_screen.dart';
import 'package:territory_admin/presentation/home_screen.dart';
import 'package:territory_admin/presentation/map/territory_map.dart';
import 'package:territory_admin/presentation/territory_editor_screen.dart';
import 'package:territory_core/territory_core.dart';

/// A fixed "today", so "120 days ago" is a date and not a moving target.
final now = DateTime(2026, 8, 7, 12);

const _boundary = <LatLng>[
  LatLng(-23.295, -51.160),
  LatLng(-23.295, -51.148),
  LatLng(-23.312, -51.148),
  LatLng(-23.312, -51.160),
];

/// A small triangle around a point.
///
/// Every block gets its own spot: three blocks sharing one centroid would stack
/// their numbers on top of each other, and a tap could never reach the one
/// underneath.
List<LatLng> _ringAt(double lat, double lng) => [
  LatLng(lat + 0.0004, lng),
  LatLng(lat - 0.0002, lng + 0.0004),
  LatLng(lat - 0.0002, lng - 0.0004),
];

/// One block per colour rule, dated against [now] rather than the real clock.
final neverWorked = Block(
  id: 'b1',
  number: 1,
  polygon: _ringAt(-23.2975, -51.154),
);
final longOverdue = Block(
  id: 'b2',
  number: 2,
  polygon: _ringAt(-23.3035, -51.154),
  lastWorkedAt: now.subtract(const Duration(days: 200)),
);
final recentlyWorked = Block(
  id: 'b3',
  number: 3,
  polygon: _ringAt(-23.3095, -51.154),
  lastWorkedAt: now.subtract(const Duration(days: 10)),
);

final centro = Territory(
  id: 't1',
  name: 'Centro',
  boundary: _boundary,
  blocks: [neverWorked, longOverdue, recentlyWorked],
);

/// Every block covered, so the "nunca trabalhadas" tail has to be absent.
final jardim = Territory(
  id: 't2',
  name: 'Jardim',
  boundary: _boundary,
  blocks: [
    Block(
      id: 'b9',
      number: 9,
      polygon: _ringAt(-23.3035, -51.154),
      lastWorkedAt: now.subtract(const Duration(days: 3)),
    ),
  ],
);

/// Serves whatever the test set, or hangs, or fails -- the three shapes the
/// screen has to render.
class FakeTerritoryRepository implements TerritoryRepository {
  List<Territory> territories = const [];

  /// When set, `listWithBlocks` throws it instead of answering.
  Object? failure;

  /// When true, the future never completes: the loading state, held still.
  bool hangs = false;

  int listCalls = 0;
  final List<String> deleted = [];
  ApiException? deleteFailure;

  @override
  Future<List<Territory>> listWithBlocks() async {
    listCalls++;
    if (hangs) return Completer<List<Territory>>().future;
    if (failure != null) throw failure!;
    return territories;
  }

  @override
  Future<void> delete(String id) async {
    deleted.add(id);
    if (deleteFailure != null) throw deleteFailure!;
  }

  @override
  Future<Territory> create({
    required String name,
    required List<LatLng> boundary,
  }) => throw UnimplementedError();

  @override
  Future<Territory> update(String id, {String? name, List<LatLng>? boundary}) =>
      throw UnimplementedError();
}

/// Only the dialog's own words, so an assertion about it cannot be satisfied
/// by something the rest of the screen happens to say.
String _dialogText(WidgetTester tester) => tester
    .widgetList<Text>(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.byType(Text),
      ),
    )
    .map((text) => text.data ?? '')
    .join(' ');

/// The territory's own menu, told apart from the app bar's -- both are a
/// `PopupMenuButton<String>` wearing the same `more_vert`.
Future<void> _openTerritoryMenu(WidgetTester tester, String name) async {
  await tester.tap(
    find.descendant(
      of: find.widgetWithText(ListTile, name),
      matching: find.byType(PopupMenuButton<String>),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _pumpHome(
  WidgetTester tester,
  FakeTerritoryRepository repository, {
  bool settle = true,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [territoryRepositoryProvider.overrideWithValue(repository)],
      child: MaterialApp(home: HomeScreen(now: now)),
    ),
  );
  if (settle) await tester.pumpAndSettle();
}

void main() {
  testWidgets('while the territories are on their way, there is nothing to '
      'add them to', (tester) async {
    final repository = FakeTerritoryRepository()..hangs = true;

    await _pumpHome(tester, repository, settle: false);
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    // No "Novo território": drawing before the list is known would be drawing
    // against a neighbour the screen has not seen yet.
    expect(find.byType(FloatingActionButton), findsNothing);
  });

  testWidgets('an empty congregation is invited to draw its first territory, '
      'and gets no map to look at', (tester) async {
    await _pumpHome(tester, FakeTerritoryRepository());

    expect(find.textContaining('Nenhum território cadastrado'), findsOneWidget);
    // The invitation points at a button that is actually there.
    expect(find.textContaining('Use "Novo território"'), findsOneWidget);
    expect(find.byType(FloatingActionButton), findsOneWidget);
    // A map with nothing on it is a tile bill and a blank rectangle.
    expect(find.byType(TerritoryMap), findsNothing);
  });

  testWidgets('the side list names each territory, counts its blocks and '
      'calls out the ones never worked', (tester) async {
    final repository = FakeTerritoryRepository()
      ..territories = [centro, jardim];

    await _pumpHome(tester, repository);

    expect(find.text('Centro'), findsOneWidget);
    expect(find.text('3 quadras · 1 nunca trabalhadas'), findsOneWidget);
    expect(find.text('Jardim'), findsOneWidget);
    // Nothing pending here, so the tail is absent rather than "0".
    expect(find.text('1 quadras'), findsOneWidget);
  });

  testWidgets('a refused listing is reported in the server\'s own words, and '
      'retrying asks again', (tester) async {
    final repository = FakeTerritoryRepository()
      ..failure = const ApiErrorException(
        statusCode: 503,
        code: 'unavailable',
        detail: 'O servidor está em manutenção.',
      );

    await _pumpHome(tester, repository);

    expect(find.text('O servidor está em manutenção.'), findsOneWidget);
    expect(repository.listCalls, 1);

    // The server recovered between the failure and the tap.
    repository
      ..failure = null
      ..territories = [centro];
    await tester.tap(find.text('Tentar de novo'));
    await tester.pumpAndSettle();

    expect(repository.listCalls, 2);
    expect(find.text('Centro'), findsOneWidget);
    expect(find.text('Tentar de novo'), findsNothing);
  });

  testWidgets('a territory offers to gain a block, to be redrawn and to go', (
    tester,
  ) async {
    final repository = FakeTerritoryRepository()..territories = [centro];

    await _pumpHome(tester, repository);
    await _openTerritoryMenu(tester, 'Centro');

    expect(find.text('Adicionar quadra'), findsOneWidget);
    expect(find.text('Editar demarcação'), findsOneWidget);
    expect(find.text('Apagar território'), findsOneWidget);
  });

  testWidgets('deleting a territory says how many blocks and what history go '
      'with it, before anything goes', (tester) async {
    final repository = FakeTerritoryRepository()..territories = [centro];

    await _pumpHome(tester, repository);
    await _openTerritoryMenu(tester, 'Centro');
    await tester.tap(find.text('Apagar território'));
    await tester.pumpAndSettle();

    expect(find.text('Apagar Centro?'), findsOneWidget);
    final body = _dialogText(tester);
    expect(body, contains('3 quadras'));
    // Literal, not a caveat: `block_work_logs.block_id` is ON DELETE CASCADE.
    expect(body, contains('histórico de trabalho'));
    // Merely asking destroys nothing.
    expect(repository.deleted, isEmpty);
  });

  testWidgets('confirming deletes that territory and refreshes the list', (
    tester,
  ) async {
    final repository = FakeTerritoryRepository()
      ..territories = [centro, jardim];

    await _pumpHome(tester, repository);
    await _openTerritoryMenu(tester, 'Centro');
    await tester.tap(find.text('Apagar território'));
    await tester.pumpAndSettle();
    // What the server will answer once Centro is gone.
    repository.territories = [jardim];
    await tester.tap(find.text('Apagar'));
    await tester.pumpAndSettle();

    expect(repository.deleted, ['t1']);
    expect(repository.listCalls, 2);
    expect(find.text('Centro'), findsNothing);
    expect(find.text('Jardim'), findsOneWidget);
  });

  testWidgets('cancelling leaves the territory alone', (tester) async {
    final repository = FakeTerritoryRepository()..territories = [centro];

    await _pumpHome(tester, repository);
    await _openTerritoryMenu(tester, 'Centro');
    await tester.tap(find.text('Apagar território'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();

    expect(repository.deleted, isEmpty);
    expect(repository.listCalls, 1);
    expect(find.text('Centro'), findsOneWidget);
  });

  testWidgets('a refusal to delete is shown and the territory stays', (
    tester,
  ) async {
    final repository = FakeTerritoryRepository()
      ..territories = [centro]
      ..deleteFailure = const ApiErrorException(
        statusCode: 409,
        code: 'conflict',
        detail: 'O território Centro não pôde ser apagado.',
      );

    await _pumpHome(tester, repository);
    await _openTerritoryMenu(tester, 'Centro');
    await tester.tap(find.text('Apagar território'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Apagar'));
    await tester.pumpAndSettle();

    expect(find.byType(SnackBar), findsOneWidget);
    expect(
      find.text('O território Centro não pôde ser apagado.'),
      findsOneWidget,
    );
    // The refetch never happened, so the territory is still on screen.
    expect(repository.listCalls, 1);
    expect(find.text('Centro'), findsOneWidget);
  });

  testWidgets('each menu entry lands on the screen it names', (tester) async {
    final repository = FakeTerritoryRepository()..territories = [centro];
    await _pumpHome(tester, repository);

    await _openTerritoryMenu(tester, 'Centro');
    await tester.tap(find.text('Editar demarcação'));
    await tester.pumpAndSettle();
    // The existing boundary is what is being reshaped, so its name is loaded.
    expect(find.byType(TerritoryEditorScreen), findsOneWidget);
    expect(
      tester
          .widget<TerritoryEditorScreen>(find.byType(TerritoryEditorScreen))
          .territory,
      centro,
    );

    await tester.pageBack();
    await tester.pumpAndSettle();
    await _openTerritoryMenu(tester, 'Centro');
    await tester.tap(find.text('Adicionar quadra'));
    await tester.pumpAndSettle();

    final editor = tester.widget<BlockEditorScreen>(
      find.byType(BlockEditorScreen),
    );
    expect(editor.territory, centro);
    // A new block, not an edit of an existing one.
    expect(editor.block, isNull);
  });

  testWidgets('the button for a new territory opens an empty editor', (
    tester,
  ) async {
    final repository = FakeTerritoryRepository()..territories = [centro];
    await _pumpHome(tester, repository);

    await tester.tap(find.text('Novo território'));
    await tester.pumpAndSettle();

    final editor = tester.widget<TerritoryEditorScreen>(
      find.byType(TerritoryEditorScreen),
    );
    expect(editor.territory, isNull);
    // The neighbours travel along: overlap is the server's call, but the admin
    // has to be able to see what to avoid while drawing.
    expect(editor.neighbours, [centro]);
  });

  testWidgets('the reload button asks the server again', (tester) async {
    final repository = FakeTerritoryRepository()..territories = [centro];
    await _pumpHome(tester, repository);
    expect(repository.listCalls, 1);

    await tester.tap(find.byIcon(Icons.refresh));
    await tester.pumpAndSettle();

    expect(repository.listCalls, 2);
  });

  testWidgets('tapping a block number on the map opens its actions', (
    tester,
  ) async {
    final repository = FakeTerritoryRepository()..territories = [centro];
    await _pumpHome(tester, repository);

    // The number drawn on the map, not the side list, which shows no numbers.
    await tester.tap(find.text('2'));
    await tester.pumpAndSettle();

    expect(find.text('Quadra 2 — Centro'), findsOneWidget);
    expect(find.text('Ver histórico'), findsOneWidget);
    expect(find.text('Apagar quadra'), findsOneWidget);
  });

  testWidgets('a block is drawn by how long it has gone unworked', (
    tester,
  ) async {
    final repository = FakeTerritoryRepository()..territories = [centro];

    await _pumpHome(tester, repository);

    final scheme = Theme.of(
      tester.element(find.byType(TerritoryMap)),
    ).colorScheme;
    // The territory outline comes first, then one polygon per block, in order.
    final polygons = tester
        .widget<PolygonLayer>(find.byType(PolygonLayer))
        .polygons;
    expect(polygons, hasLength(4));
    expect(polygons.first.borderColor, scheme.primary);

    // Never worked is the loudest state on the map: it is where to go next.
    expect(polygons[1].borderColor, scheme.error);
    expect(polygons[2].borderColor, Colors.orange.shade800);
    expect(polygons[3].borderColor, Colors.green.shade700);
  });

  testWidgets('the overdue line is crossed, not touched', (tester) async {
    final onTheLine = Block(
      id: 'b4',
      number: 4,
      polygon: _ringAt(-23.3035, -51.154),
      lastWorkedAt: now.subtract(overdueAfter),
    );
    final repository = FakeTerritoryRepository()
      ..territories = [
        Territory(
          id: 't3',
          name: 'Limite',
          boundary: _boundary,
          blocks: [onTheLine],
        ),
      ];

    await _pumpHome(tester, repository);

    final polygons = tester
        .widget<PolygonLayer>(find.byType(PolygonLayer))
        .polygons;
    // Exactly 120 days is still within the cycle -- overdue starts after it.
    expect(polygons[1].borderColor, Colors.green.shade700);
  });
}
