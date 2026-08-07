/// Blocks: the numbered outlines inside a territory.
///
/// There is no listing here on purpose -- blocks arrive with the territory
/// detail, and a second source for them would be a second opinion.
library;

import 'package:territory_admin/data/session.dart';
import 'package:territory_core/territory_core.dart';

abstract interface class BlockRepository {
  /// [number] left null asks the server for the lowest free integer.
  Future<Block> create({
    required String territoryId,
    required List<LatLng> polygon,
    int? number,
  });

  Future<Block> update(String id, {List<LatLng>? polygon, int? number});

  /// Removes the block and, by cascade on the server, its work history.
  Future<void> delete(String id);
}

/// See [ApiTerritoryRepository] on why [api] and [session] are public here.
class ApiBlockRepository implements BlockRepository {
  ApiBlockRepository({required this.api, required this.session});

  final TerritoryMapApi api;
  final Session session;

  @override
  Future<Block> create({
    required String territoryId,
    required List<LatLng> polygon,
    int? number,
  }) => session.run(
    () => api.createBlock(
      territoryId: territoryId,
      polygon: polygon,
      number: number,
    ),
  );

  @override
  Future<Block> update(String id, {List<LatLng>? polygon, int? number}) =>
      session.run(() => api.updateBlock(id, polygon: polygon, number: number));

  @override
  Future<void> delete(String id) => session.run(() => api.deleteBlock(id));
}
