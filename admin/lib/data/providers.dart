/// The composition root: where the concrete pieces are wired together.
///
/// Screens depend on these providers, never on a constructor, so a test can
/// swap the API for a fake without touching a widget.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:territory_admin/config.dart';
import 'package:territory_admin/data/credentials_store.dart';
import 'package:territory_admin/data/session.dart';
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

/// The territories, with their blocks.
///
/// The listing endpoint returns areas without blocks, so this fetches the list
/// and then each detail. The volume is dozens of territories, which is what
/// makes that acceptable; if it ever stops being, the fix is on the server.
final territoriesProvider = FutureProvider<List<Territory>>((ref) async {
  final session = ref.watch(sessionProvider);
  final api = ref.watch(apiProvider);
  return session.run(() async {
    final summaries = await api.listTerritories();
    return Future.wait(
      summaries.map((territory) => api.getTerritory(territory.id)),
    );
  });
});
