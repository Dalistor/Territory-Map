/// Keeps the app authenticated without ever asking.
///
/// Every call goes through [run], which signs in when there is no token yet and
/// signs in again when the server says the token is stale. No use case and no
/// screen knows that a token exists, which is the whole point: expiry is an
/// infrastructure detail, not something a feature should have to handle.
library;

import 'package:territory_admin/data/credentials_store.dart';
import 'package:territory_core/territory_core.dart';

/// Thrown when the stored credentials no longer work.
///
/// Distinct from a plain 401 on purpose: this is the one failure the UI must
/// react to by going back to the setup screen, because retrying cannot fix it.
class CredentialsRejectedException implements Exception {
  const CredentialsRejectedException(this.message);

  final String message;

  @override
  String toString() => message;
}

class Session {
  // Initializing formals are not an option here: `this._api` would put a
  // private name in a named parameter, which callers in another library cannot
  // pass.
  Session({required TerritoryMapApi api, required CredentialsStore store})
    // ignore: prefer_initializing_formals
    : _api = api,
      // ignore: prefer_initializing_formals
      _store = store;

  final TerritoryMapApi _api;
  final CredentialsStore _store;

  Congregation? _congregation;
  bool _signedIn = false;

  /// The congregation this installation manages, once known.
  Congregation? get congregation => _congregation;

  /// Whether the app has credentials at all -- false only before first setup.
  Future<bool> get isConfigured async => await _store.read() != null;

  /// Stores the credentials and proves they work before keeping them.
  ///
  /// Writing first and validating later would leave a broken install behind on
  /// a typo, and the app would then loop on a login it can never complete.
  Future<Congregation> configure(Credentials credentials) async {
    final session = await _api.login(
      name: credentials.name,
      city: credentials.city,
      password: credentials.password,
    );
    await _store.write(credentials);
    _api.token = session.accessToken;
    _congregation = session.congregation;
    _signedIn = true;
    return session.congregation;
  }

  /// Runs [action] signed in, renewing the token once if the server rejects it.
  ///
  /// The retry happens exactly once. Retrying a second time would spin against
  /// a password that has genuinely changed on the server, and the honest answer
  /// there is to send the admin back to setup.
  Future<T> run<T>(Future<T> Function() action) async {
    if (!_signedIn) await _signIn();
    try {
      return await action();
    } on ApiErrorException catch (error) {
      if (!error.isUnauthorized) rethrow;
      _signedIn = false;
      await _signIn();
      return await action();
    }
  }

  Future<void> _signIn() async {
    final credentials = await _store.read();
    if (credentials == null) {
      throw const CredentialsRejectedException(
        'O aplicativo ainda não foi configurado.',
      );
    }
    try {
      final session = await _api.login(
        name: credentials.name,
        city: credentials.city,
        password: credentials.password,
      );
      _api.token = session.accessToken;
      _congregation = session.congregation;
      _signedIn = true;
    } on ApiErrorException catch (error) {
      if (!error.isUnauthorized) rethrow;
      // The password changed on the server, or the congregation was renamed.
      // Nothing this layer can do; the admin has to type them again.
      throw const CredentialsRejectedException(
        'As credenciais guardadas não são mais aceitas pelo servidor. '
        'Informe os dados da congregação de novo.',
      );
    }
  }

  Future<void> signOut() async {
    await _store.clear();
    _api.token = null;
    _congregation = null;
    _signedIn = false;
  }
}
