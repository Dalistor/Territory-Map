/// The one place either client talks to the server.
///
/// Two things are injected here so that no use case ever has to remember them:
/// the `X-App-Key` header, which every request must carry, and the bearer token,
/// which differs between the admin (a JWT that expires) and the app (a permanent
/// token). A use case calls a method and gets a model or an [ApiException].
library;

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:territory_core/api/api_exception.dart';
import 'package:territory_core/geo/lat_lng.dart';
import 'package:territory_core/models/models.dart';

/// The header carrying the shared application key.
///
/// Not authentication: the value ships inside the APK and the desktop binary, so
/// anyone holding either can read it. It exists so the server stops answering
/// unaddressed scanners. Authorisation is the bearer token.
const String appKeyHeader = 'X-App-Key';

class TerritoryMapApi {
  TerritoryMapApi({
    required Uri baseUrl,
    required String appKey,
    http.Client? httpClient,
  })  : _baseUrl = baseUrl,
        _appKey = appKey,
        _http = httpClient ?? http.Client();

  final Uri _baseUrl;
  final String _appKey;
  final http.Client _http;

  String? _token;

  /// The bearer token sent from now on, or `null` to send none.
  ///
  /// The admin sets the JWT after logging in; the app sets its permanent token
  /// after redeeming a code. Neither is persisted here -- storage belongs to the
  /// client, in `flutter_secure_storage`.
  // ignore: avoid_setters_without_getters
  set token(String? value) => _token = value;

  void close() => _http.close();

  // ---------------------------------------------------------------- public --

  /// `POST /auth/login`. Name, city and password are validated together; any one
  /// of them being wrong yields the same 401.
  Future<AdminSession> login({
    required String name,
    required String city,
    required String password,
  }) async {
    final json = await _send(
      'POST',
      '/auth/login',
      body: {'name': name, 'city': city, 'password': password},
    );
    return AdminSession.fromJson(json as Map<String, dynamic>);
  }

  /// `POST /app/activate`. Single use: the code stops existing on success.
  Future<AppSession> activate(String accessCode) async {
    final json = await _send(
      'POST',
      '/app/activate',
      body: {'access_code': accessCode.trim().toUpperCase()},
    );
    return AppSession.fromJson(json as Map<String, dynamic>);
  }

  // ----------------------------------------------------------------- admin --

  Future<List<Publisher>> listPublishers() async =>
      _list('/admin/users', Publisher.fromJson);

  Future<Publisher> createPublisher(String name) async {
    final json = await _send('POST', '/admin/users', body: {'name': name});
    return Publisher.fromJson(json as Map<String, dynamic>);
  }

  /// Mints a new code, which invalidates whatever the publisher had before.
  Future<Publisher> regenerateAccessCode(String publisherId) async {
    final json = await _send('POST', '/admin/users/$publisherId/access-code');
    return Publisher.fromJson(json as Map<String, dynamic>);
  }

  /// Revokes or restores access. The work log is kept either way.
  Future<Publisher> setPublisherActive(
      String publisherId, bool isActive) async {
    final json = await _send(
      'PATCH',
      '/admin/users/$publisherId',
      body: {'is_active': isActive},
    );
    return Publisher.fromJson(json as Map<String, dynamic>);
  }

  Future<List<Territory>> listTerritories() async =>
      _list('/admin/territories', Territory.fromJson);

  /// The detail endpoint, which is the one that carries the blocks.
  Future<Territory> getTerritory(String territoryId) async {
    final json = await _send('GET', '/admin/territories/$territoryId');
    return Territory.fromJson(json as Map<String, dynamic>);
  }

  /// Pre-validates the ring locally so an impossible drawing never leaves the
  /// machine, then lets PostGIS have the final word on overlap.
  Future<Territory> createTerritory({
    required String name,
    required List<LatLng> boundary,
  }) async {
    validateRing(boundary);
    final json = await _send(
      'POST',
      '/admin/territories',
      body: {'name': name, 'boundary': ringToJson(boundary)},
    );
    return Territory.fromJson(json as Map<String, dynamic>);
  }

  Future<Territory> updateTerritory(
    String territoryId, {
    String? name,
    List<LatLng>? boundary,
  }) async {
    if (boundary != null) validateRing(boundary);
    final json = await _send(
      'PATCH',
      '/admin/territories/$territoryId',
      body: {
        if (name != null) 'name': name,
        if (boundary != null) 'boundary': ringToJson(boundary),
      },
    );
    return Territory.fromJson(json as Map<String, dynamic>);
  }

  Future<void> deleteTerritory(String territoryId) =>
      _send('DELETE', '/admin/territories/$territoryId');

  /// [number] left null asks the server for the lowest free integer.
  Future<Block> createBlock({
    required String territoryId,
    required List<LatLng> polygon,
    int? number,
  }) async {
    validateRing(polygon);
    final json = await _send(
      'POST',
      '/admin/territories/$territoryId/blocks',
      body: {
        if (number != null) 'number': number,
        'polygon': ringToJson(polygon),
      },
    );
    return Block.fromJson(json as Map<String, dynamic>);
  }

  Future<Block> updateBlock(
    String blockId, {
    int? number,
    List<LatLng>? polygon,
  }) async {
    if (polygon != null) validateRing(polygon);
    final json = await _send(
      'PATCH',
      '/admin/blocks/$blockId',
      body: {
        if (number != null) 'number': number,
        if (polygon != null) 'polygon': ringToJson(polygon),
      },
    );
    return Block.fromJson(json as Map<String, dynamic>);
  }

  Future<void> deleteBlock(String blockId) =>
      _send('DELETE', '/admin/blocks/$blockId');

  Future<List<WorkLog>> listWorkLogs(String blockId) async =>
      _list('/admin/blocks/$blockId/work-logs', WorkLog.fromJson);

  /// Removing a log recomputes the block's `last_worked_at`.
  Future<void> deleteWorkLog(String logId) =>
      _send('DELETE', '/admin/work-logs/$logId');

  // ------------------------------------------------------------------- app --

  Future<List<Territory>> listAppTerritories() async =>
      _list('/app/territories', Territory.fromJson);

  /// Reports a block as covered.
  ///
  /// [logId] is minted on the device, which is what makes an offline resend
  /// idempotent: the server recognises the id instead of recording a second
  /// visit. Returns true when this call created the record, false when the
  /// server already had it.
  Future<bool> markBlockWorked({
    required String blockId,
    required String logId,
    required DateTime workedAt,
  }) async {
    final response = await _request(
      'POST',
      '/app/blocks/$blockId/worked',
      body: {
        'log_id': logId,
        'worked_at': workedAt.toUtc().toIso8601String(),
      },
    );
    return response.statusCode == 201;
  }

  // --------------------------------------------------------------- plumbing --

  Future<List<T>> _list<T>(
    String path,
    T Function(Map<String, dynamic>) parse,
  ) async {
    final json = await _send('GET', path);
    return (json as List<dynamic>)
        .map((item) => parse(item as Map<String, dynamic>))
        .toList(growable: false);
  }

  Future<Object?> _send(String method, String path, {Object? body}) async {
    final response = await _request(method, path, body: body);
    if (response.body.isEmpty) return null;
    try {
      return jsonDecode(response.body);
    } on FormatException catch (error) {
      throw NetworkException(
        'O servidor respondeu algo que não é JSON.',
        cause: error,
      );
    }
  }

  Future<http.Response> _request(
    String method,
    String path, {
    Object? body,
  }) async {
    final request = http.Request(method, _baseUrl.resolve(path))
      ..headers[appKeyHeader] = _appKey;
    if (_token != null) {
      request.headers['Authorization'] = 'Bearer $_token';
    }
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    final http.Response response;
    try {
      response = await http.Response.fromStream(await _http.send(request));
    } on Object catch (error) {
      throw NetworkException(
        'Não foi possível falar com o servidor. Verifique a conexão.',
        cause: error,
      );
    }

    if (response.statusCode >= 400) throw _errorFrom(response);
    return response;
  }

  ApiException _errorFrom(http.Response response) {
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic> &&
          decoded['code'] is String &&
          decoded['detail'] is String) {
        return ApiErrorException(
          statusCode: response.statusCode,
          code: decoded['code'] as String,
          detail: decoded['detail'] as String,
        );
      }
      // FastAPI's own 422, whose `detail` is a list of field errors rather than
      // a sentence. It means the client sent a malformed body -- a bug here, not
      // something the admin can act on.
      if (decoded is Map<String, dynamic> && decoded['detail'] is List) {
        return ApiErrorException(
          statusCode: response.statusCode,
          code: 'invalid_request',
          detail: 'O aplicativo enviou dados em formato inválido.',
        );
      }
      // A bare `{"detail": "…"}`, with no `code`: FastAPI's own `HTTPException`,
      // which is what the authentication dependencies raise. This is the most
      // common failure the admin will ever hit -- an expired JWT -- and it has to
      // arrive as a recognisable 401 so the UI can go back to the login screen,
      // not as an opaque network error.
      if (decoded is Map<String, dynamic> && decoded['detail'] is String) {
        return ApiErrorException(
          statusCode: response.statusCode,
          code: _codeForStatus(response.statusCode),
          detail: decoded['detail'] as String,
        );
      }
    } on FormatException {
      // Falls through: an HTML error page from a proxy, or an empty body.
    }
    return NetworkException(
      'O servidor respondeu ${response.statusCode} sem explicar o motivo.',
    );
  }

  /// A stable `code` for the responses that do not carry one of their own.
  static String _codeForStatus(int status) => switch (status) {
        401 => 'unauthorized',
        403 => 'forbidden',
        404 => 'not_found',
        409 => 'conflict',
        429 => 'rate_limit_exceeded',
        _ => 'error',
      };
}
