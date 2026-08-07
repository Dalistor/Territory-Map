/// The visits recorded on one block, and the admin's power to correct them.
///
/// Removing a record is the only destructive thing here, and it reaches further
/// than the sheet: the server recomputes `last_worked_at`, so the colour of the
/// block on the map changes with it.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/data/territory_repository.dart';
import 'package:territory_admin/data/work_log_repository.dart';
import 'package:territory_admin/presentation/block_history_sheet.dart';
import 'package:territory_core/territory_core.dart';

const _boundary = <LatLng>[
  LatLng(-23.295, -51.160),
  LatLng(-23.295, -51.148),
  LatLng(-23.312, -51.148),
];

final _quadra7 = Block(
  id: 'b7',
  number: 7,
  polygon: _boundary,
  lastWorkedAt: DateTime(2026, 7, 20, 9, 5),
);

final _centro = Territory(
  id: 't1',
  name: 'Centro',
  boundary: _boundary,
  blocks: [_quadra7],
);

const _joana = PublisherBrief(id: 'u1', name: 'Joana Ribeiro');
const _pedro = PublisherBrief(id: 'u2', name: 'Pedro Alves');

/// Worked and synced in the same breath: the phone had signal.
final _online = WorkLog(
  id: 'w1',
  blockId: 'b7',
  publisher: _joana,
  workedAt: DateTime(2026, 7, 20, 9, 5),
  createdAt: DateTime(2026, 7, 20, 9, 6),
);

/// Worked on Saturday, delivered on Monday: the offline queue draining.
final _queued = WorkLog(
  id: 'w2',
  blockId: 'b7',
  publisher: _pedro,
  workedAt: DateTime(2026, 7, 18, 15, 30),
  createdAt: DateTime(2026, 7, 20, 8),
);

class FakeWorkLogRepository implements WorkLogRepository {
  List<WorkLog> logs = const [];

  /// When set, `listFor` throws it instead of answering.
  ApiException? listFailure;

  /// When set, `delete` throws it after recording the attempt.
  ApiException? deleteFailure;

  final List<String> listedFor = [];
  final List<String> deleted = [];

  @override
  Future<List<WorkLog>> listFor(String blockId) async {
    listedFor.add(blockId);
    if (listFailure != null) throw listFailure!;
    return logs;
  }

  @override
  Future<void> delete(String logId) async {
    deleted.add(logId);
    if (deleteFailure != null) throw deleteFailure!;
  }
}

/// Stands in for the map's source, so that the second invalidation the sheet
/// fires has something to be observed on.
class FakeTerritoryRepository implements TerritoryRepository {
  int listCalls = 0;

  @override
  Future<List<Territory>> listWithBlocks() async {
    listCalls++;
    return [_centro];
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

/// Only the dialog's own words, so an assertion about it cannot be satisfied by
/// something the sheet behind it happens to say.
String _dialogText(WidgetTester tester) => tester
    .widgetList<Text>(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.byType(Text),
      ),
    )
    .map((text) => text.data ?? '')
    .join(' ');

Future<FakeTerritoryRepository> _openHistory(
  WidgetTester tester,
  FakeWorkLogRepository logs,
) async {
  final territories = FakeTerritoryRepository();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        workLogRepositoryProvider.overrideWithValue(logs),
        territoryRepositoryProvider.overrideWithValue(territories),
      ],
      child: MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showBlockHistory(context, _centro, _quadra7),
                child: const Text('abrir'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  // The map's provider is listened to from the start, exactly as the home
  // screen listens to it in the real app: without a listener an invalidation
  // is a no-op, and "the map was not refreshed" would pass for free.
  ProviderScope.containerOf(
    tester.element(find.text('abrir')),
  ).listen(territoriesProvider, (_, _) {});
  await tester.tap(find.text('abrir'));
  await tester.pumpAndSettle();
  return territories;
}

void main() {
  testWidgets('a block nobody has covered says exactly that', (tester) async {
    final logs = FakeWorkLogRepository();

    await _openHistory(tester, logs);

    expect(find.text('Quadra 7 — Centro'), findsOneWidget);
    expect(find.text('Esta quadra nunca foi trabalhada.'), findsOneWidget);
    // Only this block's history was asked for.
    expect(logs.listedFor, ['b7']);
    // Nothing to remove, so no button offering to.
    expect(find.byIcon(Icons.delete_outline), findsNothing);
  });

  testWidgets('a refused history is reported in the server\'s own words', (
    tester,
  ) async {
    final logs = FakeWorkLogRepository()
      ..listFailure = const ApiErrorException(
        statusCode: 503,
        code: 'unavailable',
        detail: 'O servidor está em manutenção.',
      );

    await _openHistory(tester, logs);

    expect(find.text('O servidor está em manutenção.'), findsOneWidget);
  });

  testWidgets('each record names who covered the block and when', (
    tester,
  ) async {
    final logs = FakeWorkLogRepository()..logs = [_online];

    await _openHistory(tester, logs);

    expect(find.text('Joana Ribeiro'), findsOneWidget);
    expect(find.text('20/07/2026 09:05'), findsOneWidget);
  });

  testWidgets('a record that reached the server late says so, with the date it '
      'arrived', (tester) async {
    final logs = FakeWorkLogRepository()..logs = [_queued, _online];

    await _openHistory(tester, logs);

    // Without this line the Saturday date reads as a mistake rather than as a
    // phone that was offline until Monday.
    expect(
      find.text('18/07/2026 15:30 · sincronizado em 20/07/2026 08:00'),
      findsOneWidget,
    );
    // The one that synced immediately carries no such tail.
    expect(find.text('20/07/2026 09:05'), findsOneWidget);
  });

  testWidgets('removing a record asks first, naming who and when', (
    tester,
  ) async {
    final logs = FakeWorkLogRepository()..logs = [_online];

    await _openHistory(tester, logs);
    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();

    final body = _dialogText(tester);
    expect(body, contains('Joana Ribeiro'));
    expect(body, contains('20/07/2026 09:05'));
    // Merely asking removes nothing.
    expect(logs.deleted, isEmpty);
  });

  testWidgets('confirming removes the record and refreshes both the history '
      'and the map', (tester) async {
    final logs = FakeWorkLogRepository()..logs = [_queued, _online];
    final territories = await _openHistory(tester, logs);
    expect(logs.listedFor, ['b7']);
    expect(territories.listCalls, 1);

    // The second tile is Joana's; the first belongs to Pedro.
    await tester.tap(find.byIcon(Icons.delete_outline).last);
    await tester.pumpAndSettle();
    // What the server will answer once the record is gone.
    logs.logs = [_queued];
    await tester.tap(find.text('Remover'));
    await tester.pumpAndSettle();

    expect(logs.deleted, ['w1']);
    // The history is re-read...
    expect(logs.listedFor, ['b7', 'b7']);
    expect(find.text('Joana Ribeiro'), findsNothing);
    expect(find.text('Pedro Alves'), findsOneWidget);
    // ...and so is the map, because last_worked_at just moved.
    expect(territories.listCalls, 2);
  });

  testWidgets('cancelling leaves the record alone', (tester) async {
    final logs = FakeWorkLogRepository()..logs = [_online];
    final territories = await _openHistory(tester, logs);

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();

    expect(logs.deleted, isEmpty);
    expect(logs.listedFor, ['b7']);
    expect(territories.listCalls, 1);
    expect(find.text('Joana Ribeiro'), findsOneWidget);
  });

  testWidgets('a refusal to remove is shown and the record stays', (
    tester,
  ) async {
    final logs = FakeWorkLogRepository()
      ..logs = [_online]
      ..deleteFailure = const ApiErrorException(
        statusCode: 404,
        code: 'not_found',
        detail: 'Este registro já não existe.',
      );
    final territories = await _openHistory(tester, logs);

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remover'));
    await tester.pumpAndSettle();

    expect(find.byType(SnackBar), findsOneWidget);
    expect(find.text('Este registro já não existe.'), findsOneWidget);
    // Neither list was refetched, so the record is still on screen.
    expect(logs.listedFor, ['b7']);
    expect(territories.listCalls, 1);
    expect(find.text('Joana Ribeiro'), findsOneWidget);
  });
}
