/// The domain entities, exactly as the API spells them.
///
/// Every one is immutable and parses from the response bodies documented in
/// `CLAUDE.md`. They carry no behaviour beyond serialisation: the rules live on
/// the server, and duplicating them here would only create a second opinion.
library;

import 'package:meta/meta.dart';
import 'package:territory_core/geo/lat_lng.dart';

DateTime? _parseOptionalDate(Object? value) =>
    value == null ? null : DateTime.parse(value as String).toLocal();

@immutable
class Congregation {
  const Congregation({
    required this.id,
    required this.name,
    required this.city,
  });

  factory Congregation.fromJson(Map<String, dynamic> json) => Congregation(
        id: json['id'] as String,
        name: json['name'] as String,
        city: json['city'] as String,
      );

  final String id;
  final String name;
  final String city;
}

/// A publisher, as the admin sees them.
///
/// [accessCode] is a live credential and is only present while the code has not
/// been redeemed or expired. It must never be logged or put in a URL.
@immutable
class Publisher {
  const Publisher({
    required this.id,
    required this.name,
    required this.isActive,
    this.accessCode,
    this.accessCodeExpiresAt,
    this.activatedAt,
  });

  factory Publisher.fromJson(Map<String, dynamic> json) => Publisher(
        id: json['id'] as String,
        name: json['name'] as String,
        isActive: json['is_active'] as bool,
        accessCode: json['access_code'] as String?,
        accessCodeExpiresAt: _parseOptionalDate(json['access_code_expires_at']),
        activatedAt: _parseOptionalDate(json['activated_at']),
      );

  final String id;
  final String name;
  final bool isActive;
  final String? accessCode;
  final DateTime? accessCodeExpiresAt;
  final DateTime? activatedAt;

  /// Whether the admin still has a code to hand over.
  bool hasLiveCode(DateTime now) =>
      accessCode != null &&
      accessCodeExpiresAt != null &&
      accessCodeExpiresAt!.isAfter(now);

  /// Nobody has redeemed a code on a device yet.
  bool get isPending => activatedAt == null;
}

/// Just the identity of a publisher, as it appears nested in a work log.
@immutable
class PublisherBrief {
  const PublisherBrief({required this.id, required this.name});

  factory PublisherBrief.fromJson(Map<String, dynamic> json) => PublisherBrief(
        id: json['id'] as String,
        name: json['name'] as String,
      );

  final String id;
  final String name;
}

@immutable
class Territory {
  const Territory({
    required this.id,
    required this.name,
    required this.boundary,
    this.blocks = const [],
  });

  factory Territory.fromJson(Map<String, dynamic> json) => Territory(
        id: json['id'] as String,
        name: json['name'] as String,
        boundary: ringFromJson(json['boundary'] as List<dynamic>),
        blocks: ((json['blocks'] ?? const []) as List<dynamic>)
            .map((block) => Block.fromJson(block as Map<String, dynamic>))
            .toList(growable: false),
      );

  final String id;
  final String name;
  final List<LatLng> boundary;

  /// Empty on the listing endpoint, populated on the detail one.
  final List<Block> blocks;
}

@immutable
class Block {
  const Block({
    required this.id,
    required this.number,
    required this.polygon,
    this.lastWorkedAt,
  });

  factory Block.fromJson(Map<String, dynamic> json) => Block(
        id: json['id'] as String,
        number: json['number'] as int,
        polygon: ringFromJson(json['polygon'] as List<dynamic>),
        lastWorkedAt: _parseOptionalDate(json['last_worked_at']),
      );

  final String id;
  final int number;
  final List<LatLng> polygon;

  /// `null` means never covered -- the state the map has to highlight.
  final DateTime? lastWorkedAt;

  bool get wasNeverWorked => lastWorkedAt == null;

  /// How long since this block was last covered, for the "where do we go today"
  /// view. `null` when it has never been worked, which sorts as "longest ago".
  Duration? timeSinceWorked(DateTime now) =>
      lastWorkedAt == null ? null : now.difference(lastWorkedAt!);
}

@immutable
class WorkLog {
  const WorkLog({
    required this.id,
    required this.blockId,
    required this.publisher,
    required this.workedAt,
    required this.createdAt,
  });

  factory WorkLog.fromJson(Map<String, dynamic> json) => WorkLog(
        id: json['id'] as String,
        blockId: json['block_id'] as String,
        publisher:
            PublisherBrief.fromJson(json['user'] as Map<String, dynamic>),
        workedAt: DateTime.parse(json['worked_at'] as String).toLocal(),
        createdAt: DateTime.parse(json['created_at'] as String).toLocal(),
      );

  final String id;
  final String blockId;
  final PublisherBrief publisher;

  /// When the block was finished, read from the phone's clock.
  final DateTime workedAt;

  /// When the record reached the server. Later than [workedAt] by however long
  /// the phone stayed offline.
  final DateTime createdAt;

  bool get wasSyncedLate => createdAt.difference(workedAt).inMinutes > 5;
}

/// A successful admin login.
@immutable
class AdminSession {
  const AdminSession({required this.accessToken, required this.congregation});

  factory AdminSession.fromJson(Map<String, dynamic> json) => AdminSession(
        accessToken: json['access_token'] as String,
        congregation:
            Congregation.fromJson(json['congregation'] as Map<String, dynamic>),
      );

  final String accessToken;
  final Congregation congregation;
}

/// A successful code redemption on a publisher's device.
@immutable
class AppSession {
  const AppSession({
    required this.token,
    required this.publisher,
    required this.congregation,
  });

  factory AppSession.fromJson(Map<String, dynamic> json) => AppSession(
        token: json['token'] as String,
        publisher:
            PublisherBrief.fromJson(json['user'] as Map<String, dynamic>),
        congregation:
            Congregation.fromJson(json['congregation'] as Map<String, dynamic>),
      );

  /// Permanent, and stored in secure storage on the device -- never the code.
  final String token;
  final PublisherBrief publisher;
  final Congregation congregation;
}
