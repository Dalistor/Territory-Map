/// Drawing a boundary: what blocks the save, and what a refusal does to it.
///
/// The map is mounted for real -- the editor is a `FlutterMap` and the save
/// button reads the ring out of it -- but the drawing is done by calling the
/// `PolygonEditorController` directly. Simulated taps on a map would be testing
/// `flutter_map`'s hit testing, and the gestures already have their own cover
/// in `polygon_editor_test.dart`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart' as map;
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/data/territory_repository.dart';
import 'package:territory_admin/presentation/map/polygon_editor.dart';
import 'package:territory_admin/presentation/territory_editor_screen.dart';
import 'package:territory_core/territory_core.dart';

const _ring = <LatLng>[
  LatLng(-23.295, -51.160),
  LatLng(-23.295, -51.148),
  LatLng(-23.312, -51.148),
];

final _centro = Territory(id: 't1', name: 'Centro', boundary: _ring);

/// What the admin's three taps on the map would have produced.
const _drawn = [
  map.LatLng(-23.30, -51.16),
  map.LatLng(-23.30, -51.15),
  map.LatLng(-23.31, -51.15),
];

class CreateCall {
  const CreateCall(this.name, this.boundary);

  final String name;
  final List<LatLng> boundary;
}

class UpdateCall {
  const UpdateCall(this.id, this.name, this.boundary);

  final String id;
  final String? name;
  final List<LatLng>? boundary;
}

class FakeTerritoryRepository implements TerritoryRepository {
  List<Territory> territories = const [];
  int listCalls = 0;

  final List<CreateCall> created = [];
  final List<UpdateCall> updated = [];

  /// When set, both `create` and `update` throw it instead of answering.
  ApiException? failure;

  @override
  Future<List<Territory>> listWithBlocks() async {
    listCalls++;
    return territories;
  }

  @override
  Future<Territory> create({
    required String name,
    required List<LatLng> boundary,
  }) async {
    created.add(CreateCall(name, boundary));
    if (failure != null) throw failure!;
    return Territory(id: 'new', name: name, boundary: boundary);
  }

  @override
  Future<Territory> update(
    String id, {
    String? name,
    List<LatLng>? boundary,
  }) async {
    updated.add(UpdateCall(id, name, boundary));
    if (failure != null) throw failure!;
    return Territory(id: id, name: name ?? '', boundary: boundary ?? const []);
  }

  @override
  Future<void> delete(String id) => throw UnimplementedError();
}

/// The controller the screen built for itself, reached through the layer it
/// handed to the map.
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

ButtonStyleButton _button(WidgetTester tester, String label) =>
    tester.widget<ButtonStyleButton>(find.widgetWithText(FilledButton, label));

/// By icon rather than by tooltip: `find.byTooltip` lands on the `Tooltip`
/// wrapper, which knows nothing about whether the button is enabled.
IconButton _iconButton(WidgetTester tester, IconData icon) =>
    tester.widget<IconButton>(find.widgetWithIcon(IconButton, icon));

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

/// Pushes the editor over a placeholder route, so that "the screen did not
/// close" is something the tree can actually show.
Future<void> _pumpEditor(
  WidgetTester tester,
  FakeTerritoryRepository repository, {
  Territory? territory,
  List<Territory> neighbours = const [],
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [territoryRepositoryProvider.overrideWithValue(repository)],
      child: MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<bool>(
                    builder: (_) => TerritoryEditorScreen(
                      territory: territory,
                      neighbours: neighbours,
                    ),
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
}

void main() {
  testWidgets('a tap on the map is what marks a corner', (tester) async {
    await _pumpEditor(tester, FakeTerritoryRepository());
    // An unfinished shape asks for points rather than reporting an error.
    expect(
      find.text('Toque no mapa para marcar ao menos 3 pontos.'),
      findsOneWidget,
    );

    await _tapMap(tester, _drawn.first);

    expect(_editorOf(tester).state.points, const [LatLng(-23.30, -51.16)]);
  });

  testWidgets(
    'a nameless territory cannot be saved, however good the drawing',
    (tester) async {
      final repository = FakeTerritoryRepository();
      await _pumpEditor(tester, repository);

      await _draw(tester, _drawn);

      // Three points is a polygon, so the drawing is not what is missing.
      expect(_editorOf(tester).state.isValid, isTrue);
      expect(_button(tester, 'Salvar').onPressed, isNull);
    },
  );

  testWidgets('a named territory with fewer than three points cannot be saved '
      'either', (tester) async {
    final repository = FakeTerritoryRepository();
    await _pumpEditor(tester, repository);

    await tester.enterText(find.byType(TextField), 'Centro');
    await tester.pumpAndSettle();
    expect(_button(tester, 'Salvar').onPressed, isNull);

    await _draw(tester, _drawn.take(2).toList());
    expect(_button(tester, 'Salvar').onPressed, isNull);

    // The third point is what completes it.
    await _draw(tester, [_drawn.last]);
    expect(_button(tester, 'Salvar').onPressed, isNotNull);
  });

  testWidgets('with nothing drawn there is nothing to undo and nothing to '
      'wipe', (tester) async {
    await _pumpEditor(tester, FakeTerritoryRepository());

    expect(_iconButton(tester, Icons.undo).onPressed, isNull);
    expect(_iconButton(tester, Icons.delete_outline).onPressed, isNull);

    await _draw(tester, [_drawn.first]);

    expect(_iconButton(tester, Icons.undo).onPressed, isNotNull);
    expect(_iconButton(tester, Icons.delete_outline).onPressed, isNotNull);
  });

  testWidgets('the territory being reshaped is not also drawn as its own '
      'neighbour', (tester) async {
    final jardim = Territory(id: 't2', name: 'Jardim', boundary: _ring);

    await _pumpEditor(
      tester,
      FakeTerritoryRepository(),
      territory: _centro,
      // The home screen hands over the whole list, this one included.
      neighbours: [_centro, jardim],
    );

    // Drawn twice, the old shape would sit under the editable one and read as
    // an overlap that is not there.
    expect(
      tester
          .widget<PolygonEditorLayers>(find.byType(PolygonEditorLayers))
          .context,
      [jardim.boundary],
    );
  });

  testWidgets('opening an existing boundary has something to wipe but nothing '
      'to undo', (tester) async {
    await _pumpEditor(tester, FakeTerritoryRepository(), territory: _centro);

    // Nothing has been changed yet, so undo has no earlier shape to return to.
    expect(_iconButton(tester, Icons.undo).onPressed, isNull);
    expect(_iconButton(tester, Icons.delete_outline).onPressed, isNotNull);
  });

  testWidgets('a new territory is created with the name and the ring drawn, '
      'and the map is told to refresh', (tester) async {
    final repository = FakeTerritoryRepository();
    await _pumpEditor(tester, repository);
    // Something has to be watching for an invalidation to be observable, just
    // as the home screen is in the real app.
    final container = ProviderScope.containerOf(
      tester.element(find.byType(TerritoryEditorScreen)),
    )..listen(territoriesProvider, (_, _) {});
    await tester.pumpAndSettle();
    expect(repository.listCalls, 1);

    await tester.enterText(find.byType(TextField), '  Centro  ');
    await _draw(tester, _drawn);
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    expect(repository.created, hasLength(1));
    // Trimmed: the padding around a typed name is not part of it.
    expect(repository.created.single.name, 'Centro');
    expect(repository.created.single.boundary, const [
      LatLng(-23.30, -51.16),
      LatLng(-23.30, -51.15),
      LatLng(-23.31, -51.15),
    ]);
    expect(repository.updated, isEmpty);
    expect(repository.listCalls, 2);
    expect(container.read(territoriesProvider).hasValue, isTrue);
    // The job is done, so the editor gets out of the way.
    expect(find.byType(TerritoryEditorScreen), findsNothing);
  });

  testWidgets('reshaping an existing territory updates it instead of creating '
      'a second one', (tester) async {
    final repository = FakeTerritoryRepository();
    await _pumpEditor(tester, repository, territory: _centro);

    // The admin drops the drawing and redraws it elsewhere.
    await tester.tap(find.byTooltip('Apagar tudo'));
    await tester.pumpAndSettle();
    await _draw(tester, _drawn);
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    expect(repository.created, isEmpty);
    expect(repository.updated, hasLength(1));
    expect(repository.updated.single.id, 't1');
    // The name field opened filled, so it travels back unchanged.
    expect(repository.updated.single.name, 'Centro');
    expect(repository.updated.single.boundary, hasLength(3));
    expect(find.byType(TerritoryEditorScreen), findsNothing);
  });

  testWidgets('an overlap refused by the server is shown in its own words, and '
      'the drawing stays on screen to be fixed', (tester) async {
    final repository = FakeTerritoryRepository()
      ..failure = const ApiErrorException(
        statusCode: 422,
        code: 'territory_overlap',
        detail: 'O território se sobrepõe a Jardim. Ajuste o desenho.',
      );
    await _pumpEditor(tester, repository, neighbours: [_centro]);

    await tester.enterText(find.byType(TextField), 'Vila Nova');
    await _draw(tester, _drawn);
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    expect(
      find.text('O território se sobrepõe a Jardim. Ajuste o desenho.'),
      findsOneWidget,
    );
    // Closing here would throw the drawing away, which is the one thing the
    // admin cannot get back.
    expect(find.byType(TerritoryEditorScreen), findsOneWidget);
    expect(_editorOf(tester).state.points, hasLength(3));
    // And it can be tried again once the shape is moved.
    expect(_button(tester, 'Salvar').onPressed, isNotNull);
  });

  testWidgets('the refusal is drawn as an error, not as a hint', (
    tester,
  ) async {
    final repository = FakeTerritoryRepository()
      ..failure = const ApiErrorException(
        statusCode: 422,
        code: 'territory_overlap',
        detail: 'O território se sobrepõe a Jardim.',
      );
    await _pumpEditor(tester, repository);

    await tester.enterText(find.byType(TextField), 'Vila Nova');
    await _draw(tester, _drawn);
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    final scheme = Theme.of(
      tester.element(find.byType(TerritoryEditorScreen)),
    ).colorScheme;
    final banner = tester.widget<Container>(
      find.ancestor(
        of: find.text('O território se sobrepõe a Jardim.'),
        matching: find.byType(Container),
      ),
    );
    expect(banner.color, scheme.errorContainer);
  });
}
