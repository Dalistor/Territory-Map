/// The API's failures, as something the UI can branch on.
///
/// Every refusal from the server arrives as `{"code": …, "detail": …}`. `detail`
/// is written for the admin and is meant to be shown as-is; `code` is the stable
/// string to branch on. Anything that is not one of those -- no network, a proxy
/// error page, malformed JSON -- becomes [NetworkException], so a caller never has
/// to tell an HTTP failure from a parsing one.
library;

/// Base of everything this client throws.
sealed class ApiException implements Exception {
  const ApiException(this.message);

  /// Safe to show to the user: the server writes it for the admin.
  final String message;

  @override
  String toString() => message;
}

/// The server refused for a reason it named.
class ApiErrorException extends ApiException {
  const ApiErrorException({
    required this.statusCode,
    required this.code,
    required String detail,
  }) : super(detail);

  final int statusCode;

  /// The stable machine-readable reason, e.g. `invalid_credentials`.
  final String code;

  /// The credentials, the access code or the app key were not accepted.
  bool get isUnauthorized => statusCode == 401;

  /// The resource does not exist -- or belongs to another congregation, which
  /// the server deliberately reports the same way.
  bool get isNotFound => statusCode == 404;

  /// A name or a block number is already taken.
  bool get isConflict => statusCode == 409;

  /// A business rule refused the content: an invalid polygon, an overlap, a
  /// block outside its territory, an implausible `worked_at`.
  bool get isRuleViolation => statusCode == 422;

  /// Too many attempts. The client should back off, not retry immediately.
  bool get isRateLimited => statusCode == 429;
}

/// The request never produced a usable answer.
class NetworkException extends ApiException {
  const NetworkException(super.message, {this.cause});

  final Object? cause;
}
