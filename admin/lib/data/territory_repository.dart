/// Territories, as the screens see them.
library;

import 'package:territory_admin/data/session.dart';
import 'package:territory_core/territory_core.dart';

abstract interface class TerritoryRepository {
  /// Every territory of the congregation, each already carrying its blocks.
  Future<List<Territory>> listWithBlocks();

  Future<Territory> create({
    required String name,
    required List<LatLng> boundary,
  });

  /// Leaves out whatever is `null`, so renaming does not resend the drawing.
  Future<Territory> update(String id, {String? name, List<LatLng>? boundary});

  Future<void> delete(String id);
}

/// The api and the session are held as public fields only because a private
/// name cannot be a named parameter in Dart. Nothing above this layer sees
/// them: the screens hold the interface, which has no such member.
class ApiTerritoryRepository implements TerritoryRepository {
  ApiTerritoryRepository({required this.api, required this.session});

  final TerritoryMapApi api;
  final Session session;

  /// The listing endpoint returns areas without blocks, so this fetches the
  /// list and then each detail. The volume is dozens of territories, which is
  /// what makes that acceptable; if it ever stops being, the fix is on the
  /// server.
  @override
  Future<List<Territory>> listWithBlocks() => session.run(() async {
    final summaries = await api.listTerritories();
    return Future.wait(
      summaries.map((territory) => api.getTerritory(territory.id)),
    );
  });

  @override
  Future<Territory> create({
    required String name,
    required List<LatLng> boundary,
  }) => session.run(() => api.createTerritory(name: name, boundary: boundary));

  @override
  Future<Territory> update(String id, {String? name, List<LatLng>? boundary}) =>
      session.run(
        () => api.updateTerritory(id, name: name, boundary: boundary),
      );

  @override
  Future<void> delete(String id) => session.run(() => api.deleteTerritory(id));
}
