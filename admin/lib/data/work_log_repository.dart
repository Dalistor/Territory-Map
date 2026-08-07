/// The record of who covered a block, and when.
///
/// Read and delete only: the admin corrects history, the app writes it. Removing
/// a log makes the server recompute the block's `last_worked_at`.
library;

import 'package:territory_admin/data/session.dart';
import 'package:territory_core/territory_core.dart';

abstract interface class WorkLogRepository {
  Future<List<WorkLog>> listFor(String blockId);

  /// [logId] is the log's own id, not the block's.
  Future<void> delete(String logId);
}

/// See [ApiTerritoryRepository] on why [api] and [session] are public here.
class ApiWorkLogRepository implements WorkLogRepository {
  ApiWorkLogRepository({required this.api, required this.session});

  final TerritoryMapApi api;
  final Session session;

  @override
  Future<List<WorkLog>> listFor(String blockId) =>
      session.run(() => api.listWorkLogs(blockId));

  @override
  Future<void> delete(String logId) =>
      session.run(() => api.deleteWorkLog(logId));
}
