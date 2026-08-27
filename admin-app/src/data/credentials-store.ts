/**
 * Where the admin's congregation credentials live between launches.
 *
 * The app logs in on its own, so it has to keep the password itself and not
 * just a token -- the admin JWT lasts twelve hours and something has to renew
 * it without asking. That is the price of never showing a login screen, and
 * it is why this goes through `react-native-keychain` (Android Keystore) and
 * not `AsyncStorage`. Same contract as `admin/src/main/credentials-store.ts`
 * on the desktop, where the equivalent job is done by Electron's
 * `safeStorage`; same keychain usage as `app/src/data/session-store.ts`.
 *
 * Nothing here is ever logged, not even in an error message: on Android a
 * `console.*` call reaches logcat, which anything with USB debugging enabled
 * can read.
 */
import * as Keychain from 'react-native-keychain';

export interface Credentials {
  readonly name: string;
  readonly city: string;
  readonly password: string;
}

/**
 * Keychain "service" this module's entry lives under. Deliberately different
 * from the publisher app's 'territory-map/session': the two APKs
 * (`com.territorymapadmin` and `com.territorymapapp`) are meant to coexist on
 * one phone, and a shared name would have each one reading the other's entry.
 */
const KEYCHAIN_SERVICE = 'territory-map-admin/credentials';

/**
 * `setGenericPassword` requires a username alongside the password. There is
 * only ever one congregation per install, so this is a fixed label rather
 * than an identifier -- the real values live inside the serialized JSON.
 */
const KEYCHAIN_USERNAME = 'territory-map-admin-credentials';

function isCredentials(value: unknown): value is Credentials {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === 'string' &&
    typeof record.city === 'string' &&
    typeof record.password === 'string'
  );
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
  await Keychain.setGenericPassword(KEYCHAIN_USERNAME, JSON.stringify(credentials), {
    service: KEYCHAIN_SERVICE,
  });
}

export async function readCredentials(): Promise<Credentials | null> {
  const stored = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
  if (!stored) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored.password);
  } catch {
    // Corrupted or truncated entry. All-or-nothing, same as a missing one: a
    // broken record does not count as configured, so the admin lands on the
    // setup screen and types the three fields again instead of crashing.
    return null;
  }
  return isCredentials(parsed) ? parsed : null;
}

export async function clearCredentials(): Promise<void> {
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
}
