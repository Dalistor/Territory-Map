/// Build-time configuration.
///
/// Both values are baked into the binary at compile time, so changing either
/// means a new build -- they cannot be edited on the installed machine. That is
/// on purpose for the server address, and unavoidable for the app key.
library;

/// Where the API lives.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://territorymap.dalistor.com.br',
);

/// The shared `X-App-Key`.
///
/// Not a secret in any meaningful sense: it ships inside this binary and anyone
/// holding it can read the value out. It exists so the server stops answering
/// unaddressed scanners. What actually authorises a request is the admin token.
const String appKey = String.fromEnvironment('APP_KEY');
