/// Drawing or reshaping a territory boundary.
///
/// The client refuses an impossible ring before sending it, but overlap is the
/// server's call: only PostGIS knows where the other territories are. So a
/// refusal from the server is shown as-is -- its message names what happened
/// and, when a block would be left outside, which blocks.
library;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart' as map;
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/presentation/map/polygon_editor.dart';
import 'package:territory_admin/presentation/map/territory_map.dart';
import 'package:territory_core/territory_core.dart' as core;

class TerritoryEditorScreen extends ConsumerStatefulWidget {
  const TerritoryEditorScreen({
    super.key,
    this.territory,
    this.neighbours = const [],
  });

  /// Null when drawing a new one.
  final core.Territory? territory;

  /// The other territories, drawn faintly so the admin can see what to avoid.
  final List<core.Territory> neighbours;

  bool get isNew => territory == null;

  @override
  ConsumerState<TerritoryEditorScreen> createState() =>
      _TerritoryEditorScreenState();
}

class _TerritoryEditorScreenState extends ConsumerState<TerritoryEditorScreen> {
  late final PolygonEditorController _editor = PolygonEditorController(
    initial: widget.territory?.boundary ?? const [],
  );
  late final TextEditingController _name = TextEditingController(
    text: widget.territory?.name ?? '',
  );

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _editor.addListener(_onEditorChanged);
  }

  void _onEditorChanged() => setState(() {});

  @override
  void dispose() {
    _editor
      ..removeListener(_onEditorChanged)
      ..dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final state = _editor.state;
    if (!state.isValid || _name.text.trim().isEmpty) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    final territories = ref.read(territoryRepositoryProvider);
    try {
      if (widget.isNew) {
        await territories.create(
          name: _name.text.trim(),
          boundary: state.points,
        );
      } else {
        await territories.update(
          widget.territory!.id,
          name: _name.text.trim(),
          boundary: state.points,
        );
      }
      ref.invalidate(territoriesProvider);
      if (mounted) Navigator.of(context).pop(true);
    } on core.ApiException catch (error) {
      setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = _editor.state;
    final canSave = state.isValid && _name.text.trim().isNotEmpty && !_saving;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.isNew ? 'Novo território' : 'Editar ${widget.territory!.name}',
        ),
        actions: [
          IconButton(
            tooltip: 'Desfazer',
            onPressed: _editor.canUndo ? _editor.undo : null,
            icon: const Icon(Icons.undo),
          ),
          IconButton(
            tooltip: 'Apagar tudo',
            onPressed: state.isEmpty ? null : _editor.clear,
            icon: const Icon(Icons.delete_outline),
          ),
          const SizedBox(width: 8),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
            child: FilledButton(
              onPressed: canSave ? _save : null,
              child: _saving
                  ? const SizedBox(
                      height: 16,
                      width: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Salvar'),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _name,
              decoration: const InputDecoration(
                labelText: 'Nome do território',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),
          _Hint(text: state.hint ?? _instruction(state)),
          if (_error != null)
            Container(
              width: double.infinity,
              color: Theme.of(context).colorScheme.errorContainer,
              padding: const EdgeInsets.all(12),
              child: Text(
                _error!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onErrorContainer,
                ),
              ),
            ),
          Expanded(
            child: FlutterMap(
              options: MapOptions(
                initialCenter: _initialCenter(),
                initialZoom: 16,
                onTap: (_, point) => _editor.addPoint(point),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'br.com.dalistor.territory_admin',
                ),
                PolygonEditorLayers(
                  controller: _editor,
                  context: [
                    for (final neighbour in widget.neighbours)
                      if (neighbour.id != widget.territory?.id)
                        neighbour.boundary,
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _instruction(EditorState state) => state.isEmpty
      ? 'Toque no mapa para marcar os cantos do território.'
      : 'Arraste um ponto para mover, o ponto vazado para inserir, '
            'e segure para remover.';

  map.LatLng _initialCenter() {
    final existing = widget.territory?.boundary;
    if (existing != null && existing.isNotEmpty) {
      return toMapPoint(existing.first);
    }
    final neighbour = widget.neighbours
        .expand((territory) => territory.boundary)
        .firstOrNull;
    // Falls back to the middle of Brazil only on a truly empty install; the
    // admin pans from there once and every later session opens on real data.
    return neighbour == null
        ? const map.LatLng(-15.78, -47.93)
        : toMapPoint(neighbour);
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Text(text, style: Theme.of(context).textTheme.bodySmall),
    );
  }
}
