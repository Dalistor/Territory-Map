/// The map, the territory list, and the way into everything else.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/presentation/block_editor_screen.dart';
import 'package:territory_admin/presentation/block_history_sheet.dart';
import 'package:territory_admin/presentation/map/territory_map.dart';
import 'package:territory_admin/presentation/publishers_screen.dart';
import 'package:territory_admin/presentation/territory_editor_screen.dart';
import 'package:territory_core/territory_core.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key, this.now});

  /// Overridable so a test can decide what counts as overdue.
  final DateTime? now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final territories = ref.watch(territoriesProvider);
    final congregation = ref.watch(sessionProvider).congregation;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          congregation == null
              ? 'Territory Map'
              : '${congregation.name} — ${congregation.city}',
        ),
        actions: [
          IconButton(
            tooltip: 'Publicadores',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const PublishersScreen()),
            ),
            icon: const Icon(Icons.people_outline),
          ),
          IconButton(
            tooltip: 'Recarregar',
            onPressed: () => ref.invalidate(territoriesProvider),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: territories.hasValue
          ? FloatingActionButton.extended(
              onPressed: () => _editTerritory(context, ref, null),
              icon: const Icon(Icons.add_location_alt_outlined),
              label: const Text('Novo território'),
            )
          : null,
      body: territories.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _Failure(
          message: error is ApiException
              ? error.message
              : 'Não foi possível carregar os territórios.',
          onRetry: () => ref.invalidate(territoriesProvider),
        ),
        data: (list) => Row(
          children: [
            SizedBox(
              width: 300,
              child: _TerritoryList(
                territories: list,
                onEdit: (territory) => _editTerritory(context, ref, territory),
                onAddBlock: (territory) => _editBlock(context, territory, null),
                onDelete: (territory) =>
                    _deleteTerritory(context, ref, territory),
              ),
            ),
            const VerticalDivider(width: 1),
            Expanded(
              child: list.isEmpty
                  ? const _Empty()
                  : TerritoryMap(
                      territories: list,
                      now: now ?? DateTime.now(),
                      onBlockTap: (territory, block) =>
                          _blockActions(context, territory, block),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _editTerritory(
    BuildContext context,
    WidgetRef ref,
    Territory? territory,
  ) async {
    final neighbours =
        ref.read(territoriesProvider).value ?? const <Territory>[];
    await Navigator.of(context).push(
      MaterialPageRoute<bool>(
        builder: (_) =>
            TerritoryEditorScreen(territory: territory, neighbours: neighbours),
      ),
    );
  }

  Future<void> _editBlock(
    BuildContext context,
    Territory territory,
    Block? block,
  ) async {
    await Navigator.of(context).push(
      MaterialPageRoute<bool>(
        builder: (_) => BlockEditorScreen(territory: territory, block: block),
      ),
    );
  }

  Future<void> _deleteTerritory(
    BuildContext context,
    WidgetRef ref,
    Territory territory,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Apagar ${territory.name}?'),
        content: Text(
          territory.blocks.isEmpty
              ? 'O território será removido.'
              : 'As ${territory.blocks.length} quadras dele e todo o '
                    'histórico de trabalho serão apagados junto.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Apagar'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final api = ref.read(apiProvider);
    try {
      await ref
          .read(sessionProvider)
          .run(() => api.deleteTerritory(territory.id));
      ref.invalidate(territoriesProvider);
    } on ApiException catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _blockActions(
    BuildContext context,
    Territory territory,
    Block block,
  ) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text('Quadra ${block.number} — ${territory.name}'),
              subtitle: Text(
                block.wasNeverWorked
                    ? 'Nunca trabalhada'
                    : 'Última vez trabalhada em '
                          '${block.lastWorkedAt!.day}/'
                          '${block.lastWorkedAt!.month}/'
                          '${block.lastWorkedAt!.year}',
              ),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.history),
              title: const Text('Ver histórico'),
              onTap: () => Navigator.of(context).pop('history'),
            ),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Editar contorno ou número'),
              onTap: () => Navigator.of(context).pop('edit'),
            ),
          ],
        ),
      ),
    );
    if (!context.mounted || choice == null) return;
    if (choice == 'history') {
      await showBlockHistory(context, territory, block);
    } else {
      await _editBlock(context, territory, block);
    }
  }
}

class _TerritoryList extends StatelessWidget {
  const _TerritoryList({
    required this.territories,
    required this.onEdit,
    required this.onAddBlock,
    required this.onDelete,
  });

  final List<Territory> territories;
  final void Function(Territory) onEdit;
  final void Function(Territory) onAddBlock;
  final void Function(Territory) onDelete;

  @override
  Widget build(BuildContext context) {
    if (territories.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Nenhum território ainda.', textAlign: TextAlign.center),
        ),
      );
    }

    return ListView.builder(
      itemCount: territories.length,
      itemBuilder: (context, index) {
        final territory = territories[index];
        final never = territory.blocks
            .where((block) => block.wasNeverWorked)
            .length;
        return ListTile(
          title: Text(territory.name),
          subtitle: Text(
            '${territory.blocks.length} quadras'
            '${never > 0 ? ' · $never nunca trabalhadas' : ''}',
          ),
          trailing: PopupMenuButton<String>(
            onSelected: (action) => switch (action) {
              'block' => onAddBlock(territory),
              'edit' => onEdit(territory),
              _ => onDelete(territory),
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'block', child: Text('Adicionar quadra')),
              PopupMenuItem(value: 'edit', child: Text('Editar demarcação')),
              PopupMenuItem(value: 'delete', child: Text('Apagar território')),
            ],
          ),
        );
      },
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Text(
          'Nenhum território cadastrado ainda.\n'
          'Use "Novo território" para desenhar o primeiro.',
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

class _Failure extends StatelessWidget {
  const _Failure({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: onRetry,
              child: const Text('Tentar de novo'),
            ),
          ],
        ),
      ),
    );
  }
}
