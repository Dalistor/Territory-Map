/// The composition root: where the concrete pieces are wired together.
///
/// Screens depend on these providers, never on a constructor, so a test can
/// swap the API for a fake without touching a widget.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:territory_admin/config.dart';
import 'package:territory_admin/data/block_repository.dart';
import 'package:territory_admin/data/credentials_store.dart';
import 'package:territory_admin/data/publisher_repository.dart';
import 'package:territory_admin/data/session.dart';
import 'package:territory_admin/data/territory_repository.dart';
import 'package:territory_admin/data/work_log_repository.dart';
import 'package:territory_core/territory_core.dart';

final apiProvider = Provider<TerritoryMapApi>((ref) {
  final api = TerritoryMapApi(baseUrl: Uri.parse(apiBaseUrl), appKey: appKey);
  ref.onDispose(api.close);
  return api;
});

final credentialsStoreProvider = Provider<CredentialsStore>(
  (ref) => SecureCredentialsStore(),
);

final sessionProvider = Provider<Session>(
  (ref) => Session(
    api: ref.watch(apiProvider),
    store: ref.watch(credentialsStoreProvider),
  ),
);

/// Whether this installation has been configured yet -- the first thing the app
/// asks, and what decides between the setup screen and the map.
final isConfiguredProvider = FutureProvider<bool>(
  (ref) => ref.watch(sessionProvider).isConfigured,
);

// The repositories, all over the same api and the same session: one sign-in
// serves every screen, and a test replaces any of them with a fake without a
// server in sight.

final territoryRepositoryProvider = Provider<TerritoryRepository>(
  (ref) => ApiTerritoryRepository(
    api: ref.watch(apiProvider),
    session: ref.watch(sessionProvider),
  ),
);

final blockRepositoryProvider = Provider<BlockRepository>(
  (ref) => ApiBlockRepository(
    api: ref.watch(apiProvider),
    session: ref.watch(sessionProvider),
  ),
);

final publisherRepositoryProvider = Provider<PublisherRepository>(
  (ref) => ApiPublisherRepository(
    api: ref.watch(apiProvider),
    session: ref.watch(sessionProvider),
  ),
);

final workLogRepositoryProvider = Provider<WorkLogRepository>(
  (ref) => ApiWorkLogRepository(
    api: ref.watch(apiProvider),
    session: ref.watch(sessionProvider),
  ),
);

// The read models the screens watch. They live here, and not next to the
// screen that first needed them, so that a test can override the repository
// underneath and every screen watching the same data sees the same fake.

/// The territories, with their blocks.
final territoriesProvider = FutureProvider<List<Territory>>(
  (ref) => ref.watch(territoryRepositoryProvider).listWithBlocks(),
);

final publishersProvider = FutureProvider<List<Publisher>>(
  (ref) => ref.watch(publisherRepositoryProvider).list(),
);

/// The work history of one block, keyed by block id.
final workLogsProvider = FutureProvider.family<List<WorkLog>, String>(
  (ref, blockId) => ref.watch(workLogRepositoryProvider).listFor(blockId),
);
