/// Publishers, and the access codes handed to them.
///
/// The code that comes back on [create] and [regenerateCode] is a live
/// credential: show it, never log it, never put it in a URL.
library;

import 'package:territory_admin/data/session.dart';
import 'package:territory_core/territory_core.dart';

abstract interface class PublisherRepository {
  Future<List<Publisher>> list();

  /// The admin types the name; the server mints the code.
  Future<Publisher> create(String name);

  /// Mints a new code, which invalidates whatever the publisher had before.
  Future<Publisher> regenerateCode(String id);

  /// Revokes or restores access. The work log is kept either way.
  Future<Publisher> setActive(String id, bool isActive);
}

/// See [ApiTerritoryRepository] on why [api] and [session] are public here.
class ApiPublisherRepository implements PublisherRepository {
  ApiPublisherRepository({required this.api, required this.session});

  final TerritoryMapApi api;
  final Session session;

  @override
  Future<List<Publisher>> list() => session.run(api.listPublishers);

  @override
  Future<Publisher> create(String name) =>
      session.run(() => api.createPublisher(name));

  @override
  Future<Publisher> regenerateCode(String id) =>
      session.run(() => api.regenerateAccessCode(id));

  /// [isActive] is the state wanted, not the state now: the screen decides the
  /// inversion, so that "Desativar" cannot come back as a reactivation.
  @override
  Future<Publisher> setActive(String id, bool isActive) =>
      session.run(() => api.setPublisherActive(id, isActive));
}
