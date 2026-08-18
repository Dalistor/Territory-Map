import { getGenericPassword, resetGenericPassword, setGenericPassword } from 'react-native-keychain'
import type { Session } from '../domain/models'
import { clearSession, getSession, saveSession } from './session-store'

/**
 * `react-native-keychain` is mocked here the same way `admin/src/main/credentials-store.test.ts`
 * mocks Electron's `safeStorage`: the real module never runs in a test process (there is no OS
 * keystore to talk to), so what is under test is this module's own logic — round-tripping a
 * `Session` through `setGenericPassword`/`getGenericPassword`/`resetGenericPassword` — not the
 * native keychain itself.
 */
jest.mock('react-native-keychain')

const mockedSetGenericPassword = jest.mocked(setGenericPassword)
const mockedGetGenericPassword = jest.mocked(getGenericPassword)
const mockedResetGenericPassword = jest.mocked(resetGenericPassword)

/**
 * Installs a fresh in-memory fake behind the three mocked keychain functions, so each test starts
 * from "nothing stored" regardless of what a previous test saved — the same role
 * `inMemoryFs()`/`fakeSafeStorage()` play in the admin's credentials-store test.
 */
function installFakeKeychain(): void {
  let stored: { username: string; password: string } | null = null

  mockedSetGenericPassword.mockImplementation(async (username, password) => {
    stored = { username, password }
    return { service: 'territory-map/session', storage: 'KeystoreAESGCM' } as never
  })
  mockedGetGenericPassword.mockImplementation(async () => {
    if (!stored) return false
    return {
      service: 'territory-map/session',
      storage: 'KeystoreAESGCM',
      username: stored.username,
      password: stored.password
    } as never
  })
  mockedResetGenericPassword.mockImplementation(async () => {
    stored = null
    return true
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  installFakeKeychain()
})

const SESSION: Session = {
  token: 'app-token-abc123',
  user: { id: 'user-1', name: 'João' },
  congregation: { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' }
}

describe('session-store', () => {
  describe('getSession', () => {
    it('returns null when nothing has been saved, without throwing', async () => {
      await expect(getSession()).resolves.toBeNull()
    })
  })

  describe('saveSession + getSession', () => {
    it('getSession returns exactly the session that was saved', async () => {
      await saveSession(SESSION)

      await expect(getSession()).resolves.toEqual(SESSION)
    })
  })

  describe('clearSession', () => {
    it('getSession returns null after a session that had been saved is cleared', async () => {
      await saveSession(SESSION)

      await clearSession()

      await expect(getSession()).resolves.toBeNull()
    })
  })
})
