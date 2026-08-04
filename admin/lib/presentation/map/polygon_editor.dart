/// Drawing and reshaping an outline on the map.
///
/// Everything about `flutter_map_line_editor` and `flutter_map_dragmarker` is
/// confined to this file. They are small community packages, and if either is
/// ever abandoned the replacement lands here and nowhere else.
///
/// What they give: tap to add a vertex, drag a vertex, drag a midpoint to
/// insert one, long-press to remove. What they do not, and this file adds:
/// undo, and live feedback on whether the shape is a usable polygon.
library;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_map_dragmarker/flutter_map_dragmarker.dart';
import 'package:flutter_map_line_editor/flutter_map_line_editor.dart';
import 'package:latlong2/latlong.dart' as map;
import 'package:territory_admin/presentation/map/territory_map.dart';
import 'package:territory_core/territory_core.dart' as core;

/// What the editor currently holds, and whether it could be saved.
@immutable
class EditorState {
  const EditorState({required this.points, required this.problem});

  final List<core.LatLng> points;

  /// Why this cannot be saved yet, or `null` when it can.
  final core.PolygonProblem? problem;

  bool get isValid => problem == null;
  bool get isEmpty => points.isEmpty;

  /// A sentence for the admin, or `null` while the shape is fine.
  ///
  /// "Too few points" is deliberately not an error while drawing: the shape is
  /// simply unfinished, and shouting about it on every tap would be noise.
  String? get hint => switch (problem) {
    null => null,
    core.PolygonProblem.tooFewPoints =>
      'Toque no mapa para marcar ao menos 3 pontos.',
    core.PolygonProblem.selfIntersecting =>
      'As linhas se cruzam. Arraste um ponto para desfazer o cruzamento.',
    core.PolygonProblem.offGlobe => 'Há um ponto fora do mapa.',
  };
}

class PolygonEditorController extends ChangeNotifier {
  PolygonEditorController({List<core.LatLng> initial = const []})
    : _points = [...initial.map(toMapPoint)];

  final List<map.LatLng> _points;

  /// Snapshots taken before each mutation. Bounded because an editing session
  /// is minutes long and every entry is a whole ring.
  final List<List<map.LatLng>> _undo = [];
  static const _undoLimit = 50;

  late final PolyEditor editor = PolyEditor(
    points: _points,
    addClosePathMarker: true,
    pointIcon: const Icon(Icons.circle, size: 16, color: Color(0xFF2E7D32)),
    intermediateIcon: const Icon(
      Icons.circle_outlined,
      size: 14,
      color: Color(0xFF6D8F6F),
    ),
    // The library mutates the list in place, so the only way to know a drag
    // happened is this callback.
    callbackRefresh: (_) => notifyListeners(),
  );

  List<map.LatLng> get mapPoints => List.unmodifiable(_points);

  bool get canUndo => _undo.isNotEmpty;

  EditorState get state {
    final points = _points
        .map((p) => core.LatLng(p.latitude, p.longitude))
        .toList(growable: false);
    core.PolygonProblem? problem;
    try {
      core.validateRing(points);
    } on core.InvalidPolygonException catch (error) {
      problem = error.problem;
    }
    return EditorState(points: points, problem: problem);
  }

  void _snapshot() {
    _undo.add([..._points]);
    if (_undo.length > _undoLimit) _undo.removeAt(0);
  }

  void addPoint(map.LatLng point) {
    _snapshot();
    _points.add(point);
    notifyListeners();
  }

  /// The editable markers, with undo wired into the gestures that change the
  /// ring.
  ///
  /// `PolyEditor` exposes no hook for the start of a drag or for a removal, so
  /// each marker it produces is rebuilt here with the snapshot chained in front
  /// of the original callback. Without this, undo would jump back past a drag
  /// to whatever the ring looked like before the last *added* point -- losing
  /// the move and a vertex with it.
  List<DragMarker> markers() => [
    for (final marker in editor.edit())
      DragMarker(
        point: marker.point,
        key: marker.key,
        builder: marker.builder,
        size: marker.size,
        offset: marker.offset,
        dragOffset: marker.dragOffset,
        useLongPress: marker.useLongPress,
        onDragStart: (details, latLng) {
          _snapshot();
          marker.onDragStart?.call(details, latLng);
        },
        onDragUpdate: marker.onDragUpdate,
        onDragEnd: marker.onDragEnd,
        onLongDragStart: marker.onLongDragStart,
        onLongDragUpdate: marker.onLongDragUpdate,
        onLongDragEnd: marker.onLongDragEnd,
        onTap: marker.onTap,
        onLongPress: (latLng) {
          _snapshot();
          marker.onLongPress?.call(latLng);
        },
        scrollMapNearEdge: marker.scrollMapNearEdge,
        scrollNearEdgeRatio: marker.scrollNearEdgeRatio,
        scrollNearEdgeSpeed: marker.scrollNearEdgeSpeed,
        rotateMarker: marker.rotateMarker,
        alignment: marker.alignment,
        disableDrag: marker.disableDrag,
      ),
  ];

  void undo() {
    if (_undo.isEmpty) return;
    _points
      ..clear()
      ..addAll(_undo.removeLast());
    notifyListeners();
  }

  void clear() {
    if (_points.isEmpty) return;
    _snapshot();
    _points.clear();
    notifyListeners();
  }
}

/// The map layers that make an outline editable. Drop these into a [FlutterMap].
class PolygonEditorLayers extends StatelessWidget {
  const PolygonEditorLayers({
    required this.controller,
    super.key,
    this.context,
  });

  final PolygonEditorController controller;

  /// Outlines drawn underneath but not editable -- the territory a block is
  /// being drawn inside, or the neighbours it must not overlap.
  final List<List<core.LatLng>>? context;

  @override
  Widget build(BuildContext buildContext) {
    final state = controller.state;
    final scheme = Theme.of(buildContext).colorScheme;
    // Red while the shape cannot be saved, so the refusal is visible on the
    // map itself and not only in a message.
    final colour = state.isValid ? scheme.primary : scheme.error;

    return Stack(
      children: [
        PolygonLayer(
          polygons: [
            for (final ring in context ?? const <List<core.LatLng>>[])
              Polygon(
                points: toMapRing(ring),
                borderColor: scheme.outline,
                borderStrokeWidth: 2,
                color: scheme.outline.withValues(alpha: 0.05),
              ),
            if (controller.mapPoints.length > 1)
              Polygon(
                points: controller.mapPoints,
                borderColor: colour,
                borderStrokeWidth: 3,
                color: colour.withValues(alpha: 0.15),
              ),
          ],
        ),
        DragMarkers(markers: controller.markers()),
      ],
    );
  }
}
