/// Drawing a block inside a territory, and numbering it.
///
/// The boundary of the territory is drawn underneath, because "the block must
/// be entirely inside" is the rule most easily broken by accident. The server
/// is still what decides -- `ST_Within` on the real geometry -- so a refusal
/// comes back as its message rather than being guessed at here.
library;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/presentation/map/polygon_editor.dart';
import 'package:territory_admin/presentation/map/territory_map.dart';
import 'package:territory_core/territory_core.dart' as core;

class BlockEditorScreen extends ConsumerStatefulWidget {
  const BlockEditorScreen({required this.territory, super.key, this.block});

  final core.Territory territory;

  /// Null when drawing a new one.
  final core.Block? block;

  bool get isNew => block == null;

  @override
  ConsumerState<BlockEditorScreen> createState() => _BlockEditorScreenState();
}

class _BlockEditorScreenState extends ConsumerState<BlockEditorScreen> {
  late final PolygonEditorController _editor = PolygonEditorController(
    initial: widget.block?.polygon ?? const [],
  );
  late final TextEditingController _number = TextEditingController(
    text: widget.block?.number.toString() ?? '',
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
    _number.dispose();
    super.dispose();
  }

  /// The typed number, or null to let the server choose the next free one.
  int? get _chosenNumber {
    final raw = _number.text.trim();
    return raw.isEmpty ? null : int.tryParse(raw);
  }

  bool get _numberIsUsable {
    final raw = _number.text.trim();
    if (raw.isEmpty) return true;
    final parsed = int.tryParse(raw);
    return parsed != null && parsed >= 1;
  }

  Future<void> _save() async {
    final state = _editor.state;
    if (!state.isValid || !_numberIsUsable) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    final api = ref.read(apiProvider);
    final session = ref.read(sessionProvider);
    try {
      await session.run(() async {
        if (widget.isNew) {
          return api.createBlock(
            territoryId: widget.territory.id,
            polygon: state.points,
            number: _chosenNumber,
          );
        }
        return api.updateBlock(
          widget.block!.id,
          polygon: state.points,
          number: _chosenNumber,
        );
      });
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
    final canSave = state.isValid && _numberIsUsable && !_saving;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.isNew
              ? 'Nova quadra em ${widget.territory.name}'
              : 'Editar quadra ${widget.block!.number}',
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
              controller: _number,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Número da quadra',
                // The numbering usually already exists on paper, so leaving it
                // blank is the normal path, not an omission.
                helperText: widget.isNew
                    ? 'Em branco, o servidor usa o menor número livre.'
                    : null,
                errorText: _numberIsUsable
                    ? null
                    : 'Use um número a partir de 1.',
                border: const OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),
          _Hint(
            text:
                state.hint ??
                (state.isEmpty
                    ? 'Toque no mapa para marcar os cantos da quadra, '
                          'dentro do contorno do território.'
                    : 'Arraste um ponto para mover, o ponto vazado para '
                          'inserir, e segure para remover.'),
          ),
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
                initialCenter: toMapPoint(widget.territory.boundary.first),
                initialZoom: 17,
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
                    widget.territory.boundary,
                    for (final block in widget.territory.blocks)
                      if (block.id != widget.block?.id) block.polygon,
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
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
