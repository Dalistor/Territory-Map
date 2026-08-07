/// Removing a block the admin drew wrong -- and the history that goes with it.
///
/// The map is not under test here: `showBlockActions` is called from a bare
/// harness, so what is exercised is the action, not the drawing. What the
/// harness does render is the block list coming out of `territoriesProvider`,
/// because "the block is gone from the map" is the only observable proof that
/// the provider was invalidated.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:territory_admin/data/block_repository.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/data/territory_repository.dart';
import 'package:territory_admin/presentation/home_screen.dart';
import 'package:territory_core/territory_core.dart';

const _ring = <LatLng>[
  LatLng(-23.1, -51.1),
  LatLng(-23.1, -51.2),
  LatLng(-23.2, -51.2),
];

const block7 = Block(id: 'b7', number: 7, polygon: _ring);
const block8 = Block(id: 'b8', number: 8, polygon: _ring);

const territory = Territory(
  id: 't1',
  name: 'Centro',
  boundary: _ring,
  blocks: [block7, block8],
);

const refused = ApiErrorException(
  statusCode: 409,
  code: 'conflict',
  detail: 'A quadra 7 não pôde ser apagada.',
);

/// Records what it was asked to delete, and fails when told to.
class FakeBlockRepository implements BlockRepository {
  final List<String> deleted = [];
  ApiException? failure;

  @override
  Future<void> delete(String id) async {
    deleted.add(id);
    if (failure != null) throw failure!;
  }

  @override
  Future<Block> create({
    required String territoryId,
    required List<LatLng> polygon,
    int? number,
  }) => throw UnimplementedError();

  @override
  Future<Block> update(String id, {List<LatLng>? polygon, int? number}) =>
      throw UnimplementedError();
}

/// Counts the listings, so an invalidation of `territoriesProvider` is visible,
/// and serves whatever the test last set -- which is how the deleted block
/// disappears on the refetch.
class FakeTerritoryRepository implements TerritoryRepository {
  List<Territory> territories = const [territory];
  int listCalls = 0;

  @override
  Future<List<Territory>> listWithBlocks() async {
    listCalls++;
    return territories;
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

/// A screen with nothing but the blocks it knows about and a way in.
class _Harness extends ConsumerWidget {
  const _Harness();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final territories = ref.watch(territoriesProvider);

    return Scaffold(
      body: Column(
        children: [
          ElevatedButton(
            onPressed: () => showBlockActions(context, ref, territory, block7),
            child: const Text('Abrir ações'),
          ),
          for (final area in territories.value ?? const <Territory>[])
            for (final block in area.blocks)
              Text('mapa: quadra ${block.number}'),
        ],
      ),
    );
  }
}

({FakeBlockRepository blocks, FakeTerritoryRepository territories}) _fakes() =>
    (blocks: FakeBlockRepository(), territories: FakeTerritoryRepository());

Future<void> _pumpHarness(
  WidgetTester tester, {
  required FakeBlockRepository blocks,
  required FakeTerritoryRepository territories,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        blockRepositoryProvider.overrideWithValue(blocks),
        territoryRepositoryProvider.overrideWithValue(territories),
      ],
      child: const MaterialApp(home: _Harness()),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _openSheet(WidgetTester tester) async {
  await tester.tap(find.text('Abrir ações'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the block sheet offers to delete the block', (tester) async {
    final fakes = _fakes();
    await _pumpHarness(
      tester,
      blocks: fakes.blocks,
      territories: fakes.territories,
    );

    await _openSheet(tester);

    expect(find.text('Apagar quadra'), findsOneWidget);
  });

  testWidgets('confirming names the block and warns the history goes too', (
    tester,
  ) async {
    final fakes = _fakes();
    await _pumpHarness(
      tester,
      blocks: fakes.blocks,
      territories: fakes.territories,
    );

    await _openSheet(tester);
    await tester.tap(find.text('Apagar quadra'));
    await tester.pumpAndSettle();

    expect(find.text('Apagar a quadra 7?'), findsOneWidget);
    expect(
      find.textContaining('histórico de trabalho', findRichText: true),
      findsOneWidget,
    );
    // Nothing is destroyed by merely asking.
    expect(fakes.blocks.deleted, isEmpty);
  });

  testWidgets('confirming deletes that block once and refreshes the map', (
    tester,
  ) async {
    final fakes = _fakes();
    await _pumpHarness(
      tester,
      blocks: fakes.blocks,
      territories: fakes.territories,
    );
    expect(find.text('mapa: quadra 7'), findsOneWidget);

    await _openSheet(tester);
    await tester.tap(find.text('Apagar quadra'));
    await tester.pumpAndSettle();
    // What the server will answer once the block is gone.
    fakes.territories.territories = const [
      Territory(id: 't1', name: 'Centro', boundary: _ring, blocks: [block8]),
    ];
    await tester.tap(find.text('Apagar'));
    await tester.pumpAndSettle();

    expect(fakes.blocks.deleted, ['b7']);
    expect(fakes.territories.listCalls, 2);
    expect(find.text('mapa: quadra 7'), findsNothing);
    expect(find.text('mapa: quadra 8'), findsOneWidget);
  });

  testWidgets('cancelling leaves the block alone', (tester) async {
    final fakes = _fakes();
    await _pumpHarness(
      tester,
      blocks: fakes.blocks,
      territories: fakes.territories,
    );

    await _openSheet(tester);
    await tester.tap(find.text('Apagar quadra'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();

    expect(fakes.blocks.deleted, isEmpty);
    expect(fakes.territories.listCalls, 1);
    expect(find.text('mapa: quadra 7'), findsOneWidget);
  });

  testWidgets('a refusal from the server is shown and the block stays', (
    tester,
  ) async {
    final fakes = _fakes()..blocks.failure = refused;
    await _pumpHarness(
      tester,
      blocks: fakes.blocks,
      territories: fakes.territories,
    );

    await _openSheet(tester);
    await tester.tap(find.text('Apagar quadra'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Apagar'));
    await tester.pumpAndSettle();

    expect(find.text('A quadra 7 não pôde ser apagada.'), findsOneWidget);
    expect(find.byType(SnackBar), findsOneWidget);
    expect(fakes.territories.listCalls, 1);
    expect(find.text('mapa: quadra 7'), findsOneWidget);
  });
}
