/**
 * Where the app keeps the publisher's session between launches.
 *
 * The app never has a login screen after the first activation: it redeems
 * the disposable access code once (see `api-client.ts`'s `activate`) and
 * from then on relies on a token that never expires. That token — plus the
 * bits of `PublisherBrief` and `Congregation` the app needs to render the
 * dashboard without a round trip — has to survive app restarts, so it goes
 * through `react-native-keychain` (OS keystore-backed: Keystore on Android,
 * Keychain on iOS) instead of plain `AsyncStorage`.
 *
 * The access code itself never reaches this module — only the already
 * exchanged token does. `activate()` in `api-client.ts` trades the code for
 * a token in one request; nothing here ever sees, stores or logs the code.
 */
import * as Keychain from 'react-native-keychain'
import type { Session } from '../domain/models'

/**
 * Keychain "service" this module's entry lives under — scopes it away from
 * any other generic password some other module might store, and lets
 * `getGenericPassword`/`resetGenericPassword` target only this entry.
 */
const KEYCHAIN_SERVICE = 'territory-map/session'

/**
 * `setGenericPassword` requires a username alongside the password. There is
 * only ever one session per device, so this is a fixed label, not an
 * identifier — the real identity lives inside the serialized `Session`.
 */
const KEYCHAIN_USERNAME = 'territory-map-session'

export async function saveSession(session: Session): Promise<void> {
  await Keychain.setGenericPassword(KEYCHAIN_USERNAME, JSON.stringify(session), {
    service: KEYCHAIN_SERVICE
  })
}

export async function getSession(): Promise<Session | null> {
  const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE })
  if (!credentials) return null
  return JSON.parse(credentials.password) as Session
}

export async function clearSession(): Promise<void> {
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
}
