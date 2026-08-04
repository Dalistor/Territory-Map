/// Where the admin's credentials live between runs.
///
/// The app logs in on its own, so it has to keep the password itself and not
/// just a token -- the admin JWT lasts twelve hours and something has to renew
/// it without asking. That is the price of never showing a login screen, and it
/// is why this goes to the OS keystore (DPAPI on Windows, libsecret on Linux)
/// and never to SharedPreferences, which is plain text on disk.
///
/// Nothing here is ever logged, not even in debug.
library;

// `@immutable` comes from Flutter's own re-export rather than from `meta`
// directly, so the admin does not take a dependency it would only use for one
// annotation.
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

@immutable
class Credentials {
  const Credentials({
    required this.name,
    required this.city,
    required this.password,
  });

  final String name;
  final String city;
  final String password;

  @override
  bool operator ==(Object other) =>
      other is Credentials &&
      other.name == name &&
      other.city == city &&
      other.password == password;

  @override
  int get hashCode => Object.hash(name, city, password);

  /// Deliberately opaque: a credential must not reach a log through an
  /// accidental interpolation.
  @override
  String toString() => 'Credentials($name / $city, senha oculta)';
}

abstract interface class CredentialsStore {
  Future<Credentials?> read();
  Future<void> write(Credentials credentials);
  Future<void> clear();
}

class SecureCredentialsStore implements CredentialsStore {
  SecureCredentialsStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _nameKey = 'congregation_name';
  static const _cityKey = 'congregation_city';
  static const _passwordKey = 'congregation_password';

  final FlutterSecureStorage _storage;

  @override
  Future<Credentials?> read() async {
    final name = await _storage.read(key: _nameKey);
    final city = await _storage.read(key: _cityKey);
    final password = await _storage.read(key: _passwordKey);
    // All three or nothing: a partial write would send the app into a login
    // loop it could never satisfy.
    if (name == null || city == null || password == null) return null;
    return Credentials(name: name, city: city, password: password);
  }

  @override
  Future<void> write(Credentials credentials) async {
    await _storage.write(key: _nameKey, value: credentials.name);
    await _storage.write(key: _cityKey, value: credentials.city);
    await _storage.write(key: _passwordKey, value: credentials.password);
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _nameKey);
    await _storage.delete(key: _cityKey);
    await _storage.delete(key: _passwordKey);
  }
}

/// In-memory store, for tests and for the widget previews.
class InMemoryCredentialsStore implements CredentialsStore {
  InMemoryCredentialsStore([this._credentials]);

  Credentials? _credentials;

  @override
  Future<Credentials?> read() async => _credentials;

  @override
  Future<void> write(Credentials credentials) async =>
      _credentials = credentials;

  @override
  Future<void> clear() async => _credentials = null;
}
