/// The map, the territory list, and nothing else yet.
///
/// Drawing and numbering come in the next slice; this one proves the whole
/// chain works: silent sign-in, fetch, and the blocks on a real map.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/presentation/map/territory_map.dart';
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
            tooltip: 'Recarregar',
            onPressed: () => ref.invalidate(territoriesProvider),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: territories.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _Failure(
          message: error is ApiException
              ? error.message
              : 'Não foi possível carregar os territórios.',
          onRetry: () => ref.invalidate(territoriesProvider),
        ),
        data: (list) => list.isEmpty
            ? const _Empty()
            : Row(
                children: [
                  SizedBox(
                    width: 280,
                    child: _TerritoryList(territories: list),
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(
                    child: TerritoryMap(
                      territories: list,
                      now: now ?? DateTime.now(),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _TerritoryList extends StatelessWidget {
  const _TerritoryList({required this.territories});

  final List<Territory> territories;

  @override
  Widget build(BuildContext context) {
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
          'Nenhum território cadastrado ainda.',
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
