/// Drawing a block and numbering it.
///
/// The numbering usually already exists on paper, so the interesting cases are
/// the two ends of the field: left blank the server picks, and filled with
/// nonsense nothing may be sent at all.
library;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart' as map;
import 'package:territory_admin/data/block_repository.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/data/territory_repository.dart';
import 'package:territory_admin/presentation/block_editor_screen.dart';
import 'package:territory_admin/presentation/map/polygon_editor.dart';
import 'package:territory_core/territory_core.dart';

const _boundary = <LatLng>[
  LatLng(-23.295, -51.160),
  LatLng(-23.295, -51.148),
  LatLng(-23.312, -51.148),
  LatLng(-23.312, -51.160),
];

const _existingRing = <LatLng>[
  LatLng(-23.300, -51.156),
  LatLng(-23.300, -51.154),
  LatLng(-23.302, -51.154),
];

final _quadra7 = Block(id: 'b7', number: 7, polygon: _existingRing);

final _centro = Territory(
  id: 't1',
  name: 'Centro',
  boundary: _boundary,
  blocks: [_quadra7],
);

/// What the admin's three taps inside the territory would have produced.
const _drawn = [
  map.LatLng(-23.305, -51.158),
  map.LatLng(-23.305, -51.152),
  map.LatLng(-23.308, -51.152),
];

class CreateCall {
  const CreateCall(this.territoryId, this.polygon, this.number);

  final String territoryId;
  final List<LatLng> polygon;
  final int? number;
}

class UpdateCall {
  const UpdateCall(this.id, this.polygon, this.number);

  final String id;
  final List<LatLng>? polygon;
  final int? number;
}

class FakeBlockRepository implements BlockRepository {
  final List<CreateCall> created = [];
  final List<UpdateCall> updated = [];

  /// When set, both `create` and `update` throw it instead of answering.
  ApiException? failure;

  @override
  Future<Block> create({
    required String territoryId,
    required List<LatLng> polygon,
    int? number,
  }) async {
    created.add(CreateCall(territoryId, polygon, number));
    if (failure != null) throw failure!;
    return Block(id: 'new', number: number ?? 1, polygon: polygon);
  }

  @override
  Future<Block> update(String id, {List<LatLng>? polygon, int? number}) async {
    updated.add(UpdateCall(id, polygon, number));
    if (failure != null) throw failure!;
    return Block(id: id, number: number ?? 1, polygon: polygon ?? const []);
  }

  @override
  Future<void> delete(String id) => throw UnimplementedError();
}

/// Only there so the invalidation of `territoriesProvider` has something to
/// re-run; the block editor never reads it itself.
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

PolygonEditorController _editorOf(WidgetTester tester) => tester
    .widget<PolygonEditorLayers>(find.byType(PolygonEditorLayers))
    .controller;

Future<void> _draw(WidgetTester tester, List<map.LatLng> points) async {
  final editor = _editorOf(tester);
  for (final point in points) {
    editor.addPoint(point);
  }
  await tester.pumpAndSettle();
}

ButtonStyleButton _saveButton(WidgetTester tester) => tester
    .widget<ButtonStyleButton>(find.widgetWithText(FilledButton, 'Salvar'));

/// The callback the screen handed to the map, fired directly.
///
/// A synthetic gesture on a `FlutterMap` would be exercising its hit testing
/// and its projection; what matters here is only that a tap on the map is what
/// adds a vertex.
Future<void> _tapMap(WidgetTester tester, map.LatLng point) async {
  final options = tester.widget<FlutterMap>(find.byType(FlutterMap)).options;
  options.onTap!(const TapPosition(Offset.zero, Offset.zero), point);
  await tester.pumpAndSettle();
}

/// Pushes the editor over a placeholder route, so a `pop` is observable.
Future<FakeTerritoryRepository> _pumpEditor(
  WidgetTester tester,
  FakeBlockRepository blocks, {
  Block? block,
}) async {
  final territories = FakeTerritoryRepository();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        blockRepositoryProvider.overrideWithValue(blocks),
        territoryRepositoryProvider.overrideWithValue(territories),
      ],
      child: MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<bool>(
                    builder: (_) =>
                        BlockEditorScreen(territory: _centro, block: block),
                  ),
                ),
                child: const Text('abrir'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('abrir'));
  await tester.pumpAndSettle();
  return territories;
}

void main() {
  testWidgets('a tap on the map is what marks a corner', (tester) async {
    await _pumpEditor(tester, FakeBlockRepository());
    // An unfinished shape asks for points rather than reporting an error.
    expect(
      find.text('Toque no mapa para marcar ao menos 3 pontos.'),
      findsOneWidget,
    );

    await _tapMap(tester, _drawn.first);

    expect(_editorOf(tester).state.points, const [LatLng(-23.305, -51.158)]);
  });

  testWidgets('a blank number is left for the server to choose', (
    tester,
  ) async {
    final blocks = FakeBlockRepository();
    await _pumpEditor(tester, blocks);

    // The field is untouched, and the screen says what that means.
    expect(
      find.text('Em branco, o servidor usa o menor número livre.'),
      findsOneWidget,
    );
    await _draw(tester, _drawn);
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    expect(blocks.created, hasLength(1));
    // null, not 0 and not 1: only the server knows which numbers are taken.
    expect(blocks.created.single.number, isNull);
    expect(blocks.created.single.territoryId, 't1');
    expect(blocks.created.single.polygon, const [
      LatLng(-23.305, -51.158),
      LatLng(-23.305, -51.152),
      LatLng(-23.308, -51.152),
    ]);
  });

  testWidgets('a number below one is refused before it reaches the server', (
    tester,
  ) async {
    final blocks = FakeBlockRepository();
    await _pumpEditor(tester, blocks);

    await _draw(tester, _drawn);
    expect(_saveButton(tester).onPressed, isNotNull);

    await tester.enterText(find.byType(TextField), '0');
    await tester.pumpAndSettle();

    expect(find.text('Use um número a partir de 1.'), findsOneWidget);
    expect(_saveButton(tester).onPressed, isNull);
    expect(blocks.created, isEmpty);
  });

  testWidgets('a negative number is refused the same way', (tester) async {
    final blocks = FakeBlockRepository();
    await _pumpEditor(tester, blocks);

    await _draw(tester, _drawn);
    await tester.enterText(find.byType(TextField), '-3');
    await tester.pumpAndSettle();

    expect(find.text('Use um número a partir de 1.'), findsOneWidget);
    expect(_saveButton(tester).onPressed, isNull);
  });

  testWidgets('something that is not a number is refused too', (tester) async {
    final blocks = FakeBlockRepository();
    await _pumpEditor(tester, blocks);

    await _draw(tester, _drawn);
    // The desktop keyboard has no numeric mode to enforce, so letters can and
    // do arrive here.
    await tester.enterText(find.byType(TextField), '12a');
    await tester.pumpAndSettle();

    expect(find.text('Use um número a partir de 1.'), findsOneWidget);
    expect(_saveButton(tester).onPressed, isNull);
    expect(blocks.created, isEmpty);
  });

  testWidgets('clearing a bad number puts the save back within reach', (
    tester,
  ) async {
    final blocks = FakeBlockRepository();
    await _pumpEditor(tester, blocks);

    await _draw(tester, _drawn);
    await tester.enterText(find.byType(TextField), '0');
    await tester.pumpAndSettle();
    expect(_saveButton(tester).onPressed, isNull);

    await tester.enterText(find.byType(TextField), '1');
    await tester.pumpAndSettle();

    expect(find.text('Use um número a partir de 1.'), findsNothing);
    expect(_saveButton(tester).onPressed, isNotNull);
  });

  testWidgets('a new block is created with the number typed, and the map is '
      'told to refresh', (tester) async {
    final blocks = FakeBlockRepository();
    final territories = await _pumpEditor(tester, blocks);
    final container = ProviderScope.containerOf(
      tester.element(find.byType(BlockEditorScreen)),
    )..listen(territoriesProvider, (_, _) {});
    await tester.pumpAndSettle();
    expect(territories.listCalls, 1);

    await tester.enterText(find.byType(TextField), '12');
    await _draw(tester, _drawn);
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    expect(blocks.created, hasLength(1));
    expect(blocks.created.single.number, 12);
    expect(blocks.updated, isEmpty);
    // The block just changed the map, so the colours have to be fetched again.
    expect(territories.listCalls, 2);
    expect(container.read(territoriesProvider).hasValue, isTrue);
    expect(find.byType(BlockEditorScreen), findsNothing);
  });

  testWidgets('an existing block is updated instead of created again', (
    tester,
  ) async {
    final blocks = FakeBlockRepository();
    await _pumpEditor(tester, blocks, block: _quadra7);

    // It opens on the number it already has, and on its own outline.
    expect(find.text('Editar quadra 7'), findsOneWidget);
    expect(find.widgetWithText(TextField, '7'), findsOneWidget);
    // The blank-field hint belongs to a new block; here the number exists.
    expect(
      find.text('Em branco, o servidor usa o menor número livre.'),
      findsNothing,
    );
    expect(_editorOf(tester).state.points, _existingRing);

    await tester.enterText(find.byType(TextField), '8');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    expect(blocks.created, isEmpty);
    expect(blocks.updated, hasLength(1));
    expect(blocks.updated.single.id, 'b7');
    expect(blocks.updated.single.number, 8);
    expect(blocks.updated.single.polygon, _existingRing);
    expect(find.byType(BlockEditorScreen), findsNothing);
  });

  testWidgets('a block refused for falling outside its territory keeps the '
      'drawing on screen', (tester) async {
    final blocks = FakeBlockRepository()
      ..failure = const ApiErrorException(
        statusCode: 422,
        code: 'block_outside_territory',
        detail: 'A quadra 12 ficou fora da demarcação de Centro.',
      );
    await _pumpEditor(tester, blocks);

    await tester.enterText(find.byType(TextField), '12');
    await _draw(tester, _drawn);
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    expect(
      find.text('A quadra 12 ficou fora da demarcação de Centro.'),
      findsOneWidget,
    );
    expect(find.byType(BlockEditorScreen), findsOneWidget);
    expect(_editorOf(tester).state.points, hasLength(3));
  });
}
