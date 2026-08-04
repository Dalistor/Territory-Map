/// The visits recorded on one block, and the admin's power to correct them.
///
/// The app can only ever add; removing is the admin's alone. Deleting a record
/// makes the server recompute `last_worked_at` from what is left, which is why
/// the map has to be refreshed afterwards.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_core/territory_core.dart';

final workLogsProvider = FutureProvider.family<List<WorkLog>, String>((
  ref,
  blockId,
) {
  final api = ref.watch(apiProvider);
  return ref.watch(sessionProvider).run(() => api.listWorkLogs(blockId));
});

Future<void> showBlockHistory(
  BuildContext context,
  Territory territory,
  Block block,
) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => _BlockHistorySheet(territory: territory, block: block),
  );
}

class _BlockHistorySheet extends ConsumerWidget {
  const _BlockHistorySheet({required this.territory, required this.block});

  final Territory territory;
  final Block block;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final logs = ref.watch(workLogsProvider(block.id));

    return SizedBox(
      height: 420,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              'Quadra ${block.number} — ${territory.name}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: logs.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(
                child: Text(
                  error is ApiException
                      ? error.message
                      : 'Não foi possível carregar o histórico.',
                ),
              ),
              data: (list) => list.isEmpty
                  ? const Center(
                      child: Text('Esta quadra nunca foi trabalhada.'),
                    )
                  : ListView.separated(
                      itemCount: list.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, index) =>
                          _LogTile(log: list[index], blockId: block.id),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LogTile extends ConsumerWidget {
  const _LogTile({required this.log, required this.blockId});

  final WorkLog log;
  final String blockId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListTile(
      title: Text(log.publisher.name),
      subtitle: Text(
        _formatDate(log.workedAt) +
            // The gap between doing the work and it reaching the server is the
            // offline queue draining; without saying so, a late sync looks like
            // a wrong date.
            (log.wasSyncedLate
                ? ' · sincronizado em ${_formatDate(log.createdAt)}'
                : ''),
      ),
      trailing: IconButton(
        tooltip: 'Remover registro',
        icon: const Icon(Icons.delete_outline),
        onPressed: () => _confirmDelete(context, ref),
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remover este registro?'),
        content: Text(
          'A marcação de ${log.publisher.name} em '
          '${_formatDate(log.workedAt)} será apagada, e a data da última '
          'visita da quadra será recalculada.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Remover'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final api = ref.read(apiProvider);
    try {
      await ref.read(sessionProvider).run(() => api.deleteWorkLog(log.id));
      ref
        ..invalidate(workLogsProvider(blockId))
        // last_worked_at just changed, so the colour on the map has to follow.
        ..invalidate(territoriesProvider);
    } on ApiException catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }
}

String _formatDate(DateTime moment) {
  String two(int value) => value.toString().padLeft(2, '0');
  return '${two(moment.day)}/${two(moment.month)}/${moment.year} '
      '${two(moment.hour)}:${two(moment.minute)}';
}
