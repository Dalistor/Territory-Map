import { describe, expect, it, vi } from 'vitest'
import { createSession, CredentialsRejectedException } from './session'
import type { ApiClient } from './api-client'
import type { Credentials, CredentialsStore } from './credentials-store'
import type { AdminSession, Congregation } from '../shared/models'
import { ApiErrorException, NetworkException } from '../shared/api-errors'

/**
 * A fake covering every member of `ApiClient` -- session.ts only calls
 * `login` and `setToken`, but the interface is wide, and `vi.fn()` stubs for
 * the rest keep this fake honest about what it implements without needing
 * the real HTTP client (Task 04) or any network access.
 */
function fakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    login: vi.fn(),
    setToken: vi.fn(),
    listPublishers: vi.fn(),
    createPublisher: vi.fn(),
    regenerateAccessCode: vi.fn(),
    setPublisherActive: vi.fn(),
    deletePublisher: vi.fn(),
    listTerritories: vi.fn(),
    getTerritory: vi.fn(),
    createTerritory: vi.fn(),
    updateTerritory: vi.fn(),
    deleteTerritory: vi.fn(),
    listAssignments: vi.fn(),
    listAllAssignments: vi.fn(),
    designate: vi.fn(),
    completeAssignment: vi.fn(),
    deleteAssignment: vi.fn(),
    createBlock: vi.fn(),
    updateBlock: vi.fn(),
    deleteBlock: vi.fn(),
    listWorkLogs: vi.fn(),
    deleteWorkLog: vi.fn(),
    markBlockWorked: vi.fn(),
    ...overrides
  }
}

function fakeStore(overrides: Partial<CredentialsStore> = {}): CredentialsStore {
  return {
    read: vi.fn(async () => null),
    write: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    ...overrides
  }
}

const CREDENTIALS: Credentials = {
  name: 'Congregação Central',
  city: 'São Paulo',
  password: 'super-secret'
}

const CONGREGATION: Congregation = { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' }

const ADMIN_SESSION: AdminSession = { accessToken: 'token-abc', congregation: CONGREGATION }

describe('createSession', () => {
  describe('isConfigured', () => {
    it('is true when the store has saved credentials', async () => {
      const store = fakeStore({ read: vi.fn(async () => CREDENTIALS) })
      const session = createSession({ api: fakeApiClient(), store })

      await expect(session.isConfigured()).resolves.toBe(true)
    })

    it('is false when the store has nothing saved', async () => {
      const store = fakeStore({ read: vi.fn(async () => null) })
      const session = createSession({ api: fakeApiClient(), store })

      await expect(session.isConfigured()).resolves.toBe(false)
    })
  })

  describe('configure', () => {
    it('logs in before writing anything to the store', async () => {
      const order: string[] = []
      const api = fakeApiClient({
        login: vi.fn(async () => {
          order.push('login')
          return ADMIN_SESSION
        })
      })
      const store = fakeStore({
        write: vi.fn(async () => {
          order.push('write')
        })
      })
      const session = createSession({ api, store })

      await session.configure(CREDENTIALS)

      expect(order).toEqual(['login', 'write'])
    })

    it('on success saves the credentials, sets the token, and returns the congregation', async () => {
      const api = fakeApiClient({ login: vi.fn(async () => ADMIN_SESSION) })
      const store = fakeStore()
      const session = createSession({ api, store })

      const result = await session.configure(CREDENTIALS)

      expect(result).toEqual(CONGREGATION)
      expect(session.congregation).toEqual(CONGREGATION)
      expect(store.write).toHaveBeenCalledWith(CREDENTIALS)
      expect(api.setToken).toHaveBeenCalledWith(ADMIN_SESSION.accessToken)
    })

    it('marks the session as authenticated, so a following run() does not sign in again', async () => {
      const api = fakeApiClient({ login: vi.fn(async () => ADMIN_SESSION) })
      const store = fakeStore()
      const session = createSession({ api, store })

      await session.configure(CREDENTIALS)
      const result = await session.run(async () => 'done')

      expect(result).toBe('done')
      expect(api.login).toHaveBeenCalledTimes(1) // only the one from configure
      expect(store.read).not.toHaveBeenCalled()
    })

    it('propagates a login failure unchanged and writes nothing to the store', async () => {
      const loginError = new ApiErrorException(401, 'unauthorized', 'credenciais inválidas')
      const api = fakeApiClient({
        login: vi.fn(async () => {
          throw loginError
        })
      })
      const store = fakeStore()
      const session = createSession({ api, store })

      await expect(session.configure(CREDENTIALS)).rejects.toBe(loginError)
      expect(store.write).not.toHaveBeenCalled()
      expect(api.setToken).not.toHaveBeenCalled()
      expect(session.congregation).toBeNull()
    })
  })

  describe('run', () => {
    it('throws CredentialsRejectedException without calling the API when nothing is saved', async () => {
      const api = fakeApiClient()
      const store = fakeStore({ read: vi.fn(async () => null) })
      const session = createSession({ api, store })

      await expect(session.run(async () => 'x')).rejects.toBeInstanceOf(
        CredentialsRejectedException
      )
      expect(api.login).not.toHaveBeenCalled()
    })

    it('signs in automatically from the stored credentials, then runs the action', async () => {
      const api = fakeApiClient({ login: vi.fn(async () => ADMIN_SESSION) })
      const store = fakeStore({ read: vi.fn(async () => CREDENTIALS) })
      const session = createSession({ api, store })

      const result = await session.run(async () => 'action result')

      expect(result).toBe('action result')
      expect(api.login).toHaveBeenCalledWith(CREDENTIALS)
      expect(api.setToken).toHaveBeenCalledWith(ADMIN_SESSION.accessToken)
      expect(session.congregation).toEqual(CONGREGATION)
    })

    it('does not sign in again on a second run() once already authenticated', async () => {
      const api = fakeApiClient({ login: vi.fn(async () => ADMIN_SESSION) })
      const store = fakeStore({ read: vi.fn(async () => CREDENTIALS) })
      const session = createSession({ api, store })

      await session.run(async () => 'first')
      await session.run(async () => 'second')

      expect(api.login).toHaveBeenCalledTimes(1)
      expect(store.read).toHaveBeenCalledTimes(1)
    })

    it('converts an unauthorized login failure during automatic sign-in into CredentialsRejectedException', async () => {
      const loginError = new ApiErrorException(401, 'unauthorized', 'credenciais inválidas')
      const api = fakeApiClient({
        login: vi.fn(async () => {
          throw loginError
        })
      })
      const store = fakeStore({ read: vi.fn(async () => CREDENTIALS) })
      const session = createSession({ api, store })

      const error = await session.run(async () => 'x').catch((e: unknown) => e)

      expect(error).toBeInstanceOf(CredentialsRejectedException)
      expect((error as Error).message.toLowerCase()).toMatch(/novamente|de novo/)
    })

    it('propagates a non-unauthorized login failure during automatic sign-in unchanged', async () => {
      const networkError = new NetworkException('sem conexão')
      const api = fakeApiClient({
        login: vi.fn(async () => {
          throw networkError
        })
      })
      const store = fakeStore({ read: vi.fn(async () => CREDENTIALS) })
      const session = createSession({ api, store })

      await expect(session.run(async () => 'x')).rejects.toBe(networkError)
    })

    it('retries once after an unauthorized action error: re-signs in and re-runs the action', async () => {
      const api = fakeApiClient({ login: vi.fn(async () => ADMIN_SESSION) })
      const store = fakeStore({ read: vi.fn(async () => CREDENTIALS) })
      const session = createSession({ api, store })
      await session.run(async () => 'warm up') // becomes authenticated

      let attempt = 0
      const result = await session.run(async () => {
        attempt += 1
        if (attempt === 1) {
          throw new ApiErrorException(401, 'unauthorized', 'token expirado')
        }
        return 'second attempt result'
      })

      expect(result).toBe('second attempt result')
      expect(attempt).toBe(2)
      expect(api.login).toHaveBeenCalledTimes(2) // warm up sign-in + retry sign-in
    })

    it('throws CredentialsRejectedException when the retried sign-in also fails unauthorized', async () => {
      const api = fakeApiClient({
        login: vi
          .fn()
          .mockResolvedValueOnce(ADMIN_SESSION)
          .mockRejectedValueOnce(
            new ApiErrorException(401, 'unauthorized', 'credenciais inválidas')
          )
      })
      const store = fakeStore({ read: vi.fn(async () => CREDENTIALS) })
      const session = createSession({ api, store })
      await session.run(async () => 'warm up')

      await expect(
        session.run(async () => {
          throw new ApiErrorException(401, 'unauthorized', 'token expirado')
        })
      ).rejects.toBeInstanceOf(CredentialsRejectedException)
    })

    it('propagates a non-unauthorized action error without retrying sign-in or the action', async () => {
      const api = fakeApiClient({ login: vi.fn(async () => ADMIN_SESSION) })
      const store = fakeStore({ read: vi.fn(async () => CREDENTIALS) })
      const session = createSession({ api, store })
      await session.run(async () => 'warm up')

      const boom = new Error('boom')
      const action = vi.fn(async () => {
        throw boom
      })

      await expect(session.run(action)).rejects.toBe(boom)
      expect(action).toHaveBeenCalledTimes(1)
      expect(api.login).toHaveBeenCalledTimes(1) // no retry sign-in
    })
  })

  describe('signOut', () => {
    it('clears the store, the api token, and the remembered congregation', async () => {
      const api = fakeApiClient({ login: vi.fn(async () => ADMIN_SESSION) })
      const store = fakeStore({ read: vi.fn(async () => CREDENTIALS) })
      const session = createSession({ api, store })
      await session.configure(CREDENTIALS)

      await session.signOut()

      expect(store.clear).toHaveBeenCalledTimes(1)
      expect(api.setToken).toHaveBeenCalledWith(null)
      expect(session.congregation).toBeNull()
    })

    it('marks the session unauthenticated, so the next run() signs in again', async () => {
      const api = fakeApiClient({ login: vi.fn(async () => ADMIN_SESSION) })
      const store = fakeStore({ read: vi.fn(async () => CREDENTIALS) })
      const session = createSession({ api, store })
      await session.configure(CREDENTIALS)
      await session.signOut()

      await session.run(async () => 'after sign out')

      expect(store.read).toHaveBeenCalledTimes(1) // the automatic sign-in inside run()
      expect(api.login).toHaveBeenCalledTimes(2) // configure + the new sign-in
    })

    it('propagates a store.clear() failure instead of swallowing it', async () => {
      // `CredentialsStore.clear()` itself swallows a missing file (nothing
      // left to remove is success), but a real failure -- disk full, no
      // permission -- must still reach the caller: the admin should not be
      // told they signed out when the credentials are, in fact, still there.
      const clearError = new Error('disk full')
      const api = fakeApiClient()
      const store = fakeStore({
        clear: vi.fn(async () => {
          throw clearError
        })
      })
      const session = createSession({ api, store })

      await expect(session.signOut()).rejects.toBe(clearError)
    })
  })
})
