// The heart of "never ask for login again" -- ported from
// `admin/lib/data/session.dart`. The admin JWT lasts twelve hours; this is
// what renews it in silence, using the credentials the admin only ever types
// once (Task 05's `credentials-store.ts`).
//
// Two very different failures look the same to the caller of `run()` but are
// handled differently here: the *token* going stale (expected, happens every
// twelve hours -- retried once, transparently) versus the *credentials*
// themselves being no longer valid (unexpected -- the password changed on
// the server, or nothing was ever configured -- surfaced as
// `CredentialsRejectedException` so the renderer can send the admin back to
// the setup screen instead of stalling on a request that will never
// succeed).

import type { ApiClient } from './api-client'
import type { Credentials, CredentialsStore } from './credentials-store'
import type { Congregation } from '../shared/models'
import { ApiErrorException } from '../shared/api-errors'

/**
 * Raised whenever the session cannot get (or keep) a valid credential --
 * nothing saved yet, or the server no longer accepts what was saved. Never
 * thrown by `configure()` itself: a login failure there is the admin's own
 * fresh attempt, so it propagates as whatever the API client threw.
 */
export class CredentialsRejectedException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CredentialsRejectedException'
  }
}

const NOTHING_SAVED_MESSAGE =
  'Nenhuma credencial configurada neste computador. Configure a congregação novamente.'
const SAVED_CREDENTIALS_REJECTED_MESSAGE =
  'As credenciais salvas não foram aceitas pelo servidor. Digite os dados novamente.'

export interface CreateSessionOptions {
  readonly api: ApiClient
  readonly store: CredentialsStore
}

export interface Session {
  isConfigured(): Promise<boolean>
  configure(credentials: Credentials): Promise<Congregation>
  /**
   * Runs `action` under a valid token, signing in first if needed and
   * transparently retrying once if the token turned out to be stale.
   */
  run<T>(action: () => Promise<T>): Promise<T>
  signOut(): Promise<void>
  readonly congregation: Congregation | null
}

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiErrorException && error.isUnauthorized
}

export function createSession({ api, store }: CreateSessionOptions): Session {
  let authenticated = false
  let congregation: Congregation | null = null

  /**
   * Reads the saved credentials and logs in with them. Used both the first
   * time `run()` is called and whenever a stale token needs replacing --
   * never by `configure()`, which logs in with credentials it was just
   * handed, not with whatever is on disk.
   */
  async function signInFromStore(): Promise<void> {
    const credentials = await store.read()
    if (credentials === null) {
      throw new CredentialsRejectedException(NOTHING_SAVED_MESSAGE)
    }

    let adminSession
    try {
      adminSession = await api.login(credentials)
    } catch (error) {
      if (isUnauthorizedError(error)) {
        throw new CredentialsRejectedException(SAVED_CREDENTIALS_REJECTED_MESSAGE)
      }
      throw error
    }

    api.setToken(adminSession.accessToken)
    congregation = adminSession.congregation
    authenticated = true
  }

  return {
    async isConfigured() {
      return (await store.read()) !== null
    },

    async configure(credentials) {
      // Login first -- a rejected attempt must leave nothing behind.
      const adminSession = await api.login(credentials)
      await store.write(credentials)
      api.setToken(adminSession.accessToken)
      congregation = adminSession.congregation
      authenticated = true
      return adminSession.congregation
    },

    async run(action) {
      if (!authenticated) {
        await signInFromStore()
      }

      try {
        return await action()
      } catch (error) {
        if (!isUnauthorizedError(error)) {
          throw error
        }
        // The token went stale mid-session (its usual twelve-hour death).
        // Sign in again and give the action exactly one more try.
        authenticated = false
        await signInFromStore()
        return await action()
      }
    },

    async signOut() {
      await store.clear()
      api.setToken(null)
      congregation = null
      authenticated = false
    },

    get congregation() {
      return congregation
    }
  }
}
