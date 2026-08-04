/// The drawing loop: adding, undoing, and knowing when a shape can be saved.
library;

import 'package:flutter/gestures.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart' as map;
import 'package:territory_admin/presentation/map/polygon_editor.dart';
import 'package:territory_core/territory_core.dart' as core;

const a = map.LatLng(0, 0);
const b = map.LatLng(0, 1);
const c = map.LatLng(1, 1);
const d = map.LatLng(1, 0);

PolygonEditorController square() => PolygonEditorController()
  ..addPoint(a)
  ..addPoint(b)
  ..addPoint(c)
  ..addPoint(d);

void main() {
  test('starts empty and unsavable', () {
    final editor = PolygonEditorController();

    expect(editor.state.isEmpty, isTrue);
    expect(editor.state.isValid, isFalse);
    expect(editor.canUndo, isFalse);
  });

  test('opens on an existing boundary', () {
    final editor = PolygonEditorController(
      initial: const [core.LatLng(0, 0), core.LatLng(0, 1), core.LatLng(1, 1)],
    );

    expect(editor.state.points, hasLength(3));
    expect(editor.state.isValid, isTrue);
    // Nothing has been changed yet, so there is nothing to undo back to.
    expect(editor.canUndo, isFalse);
  });

  test('becomes savable at the third point', () {
    final editor = PolygonEditorController()
      ..addPoint(a)
      ..addPoint(b);
    expect(editor.state.isValid, isFalse);

    editor.addPoint(c);

    expect(editor.state.isValid, isTrue);
  });

  test('an unfinished shape asks for points instead of reporting an error', () {
    final editor = PolygonEditorController()..addPoint(a);

    expect(editor.state.hint, contains('3 pontos'));
  });

  test('a crossing outline says how to fix it', () {
    // A bow tie: the diagonals cross.
    final editor = PolygonEditorController()
      ..addPoint(a)
      ..addPoint(c)
      ..addPoint(b)
      ..addPoint(d);

    expect(editor.state.problem, core.PolygonProblem.selfIntersecting);
    expect(editor.state.hint, contains('cruzam'));
  });

  test('a valid shape has nothing to say', () {
    expect(square().state.hint, isNull);
  });

  test('undo removes the last point', () {
    final editor = square()..undo();

    expect(editor.state.points, hasLength(3));
  });

  test('undo walks all the way back to empty', () {
    final editor = square();

    while (editor.canUndo) {
      editor.undo();
    }

    expect(editor.state.isEmpty, isTrue);
  });

  test('undo on an untouched editor does nothing', () {
    final editor = PolygonEditorController();

    editor.undo();

    expect(editor.state.isEmpty, isTrue);
  });

  test('clear wipes the ring but stays undoable', () {
    final editor = square()..clear();
    expect(editor.state.isEmpty, isTrue);

    editor.undo();

    expect(editor.state.points, hasLength(4));
  });

  test('clearing an empty editor does not stack an undo step', () {
    final editor = PolygonEditorController()..clear();

    expect(editor.canUndo, isFalse);
  });

  test('notifies on every mutation, which is what repaints the map', () {
    var notifications = 0;
    final editor = PolygonEditorController()
      ..addListener(() => notifications++);

    editor
      ..addPoint(a)
      ..addPoint(b)
      ..undo()
      ..clear();

    expect(notifications, 4);
  });

  test('hands back points in the order they were drawn', () {
    expect(square().state.points, const [
      core.LatLng(0, 0),
      core.LatLng(0, 1),
      core.LatLng(1, 1),
      core.LatLng(1, 0),
    ]);
  });

  test('dragging a vertex is undoable, and undo does not eat the point', () {
    // Caught in the browser: PolyEditor exposes no drag-start hook, so without
    // the wrapper in markers() undo jumped back past the drag to before the
    // last *added* point -- losing the move and a vertex with it.
    final editor = square();
    final markers = editor.markers();

    // What the map does to a vertex: announce the drag, then move the point.
    markers.first.onDragStart!(DragStartDetails(), a);
    editor.editor.points[0] = const map.LatLng(5, 5);
    expect(editor.state.points.first, const core.LatLng(5, 5));

    editor.undo();

    expect(editor.state.points, hasLength(4));
    expect(editor.state.points.first, const core.LatLng(0, 0));
  });

  test('removing a vertex by long press is undoable too', () {
    final editor = square();
    final markers = editor.markers();

    markers.first.onLongPress!(a);

    expect(editor.state.points, hasLength(3));
    editor.undo();
    expect(editor.state.points, hasLength(4));
  });

  test('the exposed list cannot be mutated from outside', () {
    final editor = square();

    expect(
      () => editor.mapPoints.add(const map.LatLng(2, 2)),
      throwsUnsupportedError,
    );
  });
}
