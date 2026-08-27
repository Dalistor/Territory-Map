// The heart of "never ask for login again" -- ported from
// `admin/src/main/session.ts` on the desktop. The admin JWT lasts twelve
// hours; this is what renews it in silence, using the credentials the admin
// only ever types once (`credentials-store.ts`, in the Android keystore).
//
// Two very different failures look alike to whoever calls `run()`, and are
// handled differently here: the *token* going stale (expected, happens every
// twelve hours -- retried once, transparently) versus the *credentials*
// themselves no longer being valid (unexpected -- the password changed on the
// server, or nothing was ever configured -- surfaced as
// `CredentialsRejectedError` so the navigation can send the admin back to the
// setup screen instead of stalling on a request that will never succeed).
//
// This module is the only thing the screens call to write anything: no screen
// knows there is a token, a password, or a `fetch` underneath.

import { ApiError } from './api-client';
import type { ApiClient } from './api-client';
import { clearCredentials, readCredentials, saveCredentials } from './credentials-store';
import type { Credentials } from './credentials-store';
import type { Congregation } from '../domain/models';

/**
 * Raised whenever the session cannot get (or keep) a valid credential --
 * nothing saved yet, or the server no longer accepts what was saved. Never
 * thrown by `configure()` itself: a login failure there is the admin's own
 * fresh attempt, so it propagates as whatever the API client threw.
 */
export class CredentialsRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialsRejectedError';
  }
}

const NOTHING_SAVED_MESSAGE =
  'Nenhuma congregação configurada neste aparelho. Informe nome, cidade e senha novamente.';
const SAVED_CREDENTIALS_REJECTED_MESSAGE =
  'As credenciais salvas não foram aceitas pelo servidor. Digite os dados da congregação novamente.';

export interface CredentialsStore {
  read(): Promise<Credentials | null>;
  write(credentials: Credentials): Promise<void>;
  clear(): Promise<void>;
}

/**
 * The real store: Task 05's three functions behind the interface above, so
 * the app can wire `createSession({api: createApiClient(), store:
 * credentialsStore})` while every test passes a fake instead.
 */
export const credentialsStore: CredentialsStore = {
  read: readCredentials,
  write: saveCredentials,
  clear: clearCredentials,
};

export interface CreateSessionOptions {
  readonly api: ApiClient;
  readonly store: CredentialsStore;
}

export interface Session {
  isConfigured(): Promise<boolean>;
  configure(credentials: Credentials): Promise<Congregation>;
  /**
   * Runs `action` under a valid token, signing in first if needed and
   * transparently retrying once if the token turned out to be stale.
   */
  run<T>(action: () => Promise<T>): Promise<T>;
  signOut(): Promise<void>;
  readonly congregation: Congregation | null;
}

/**
 * Only a 401 means "this credential is not good enough". A `NetworkError`, a
 * 409 or a 500 all say something else entirely, and treating them as expired
 * authentication would either blame the admin's password for a dead
 * connection or retry a request that will fail the same way twice.
 */
function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.isUnauthorized;
}

export function createSession({ api, store }: CreateSessionOptions): Session {
  let authenticated = false;
  let congregation: Congregation | null = null;

  /**
   * Reads the saved credentials and logs in with them. Used both the first
   * time `run()` is called and whenever a stale token needs replacing --
   * never by `configure()`, which logs in with credentials it was just
   * handed, not with whatever is in the keystore.
   */
  async function signInFromStore(): Promise<void> {
    const credentials = await store.read();
    if (credentials === null) {
      throw new CredentialsRejectedError(NOTHING_SAVED_MESSAGE);
    }
    let adminSession;
    try {
      adminSession = await api.login(credentials);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        throw new CredentialsRejectedError(SAVED_CREDENTIALS_REJECTED_MESSAGE);
      }
      throw error;
    }

    api.setToken(adminSession.accessToken);
    congregation = adminSession.congregation;
    authenticated = true;
  }

  return {
    async isConfigured() {
      return (await store.read()) !== null;
    },

    async configure(credentials) {
      // Login first -- a rejected attempt must leave nothing behind.
      const adminSession = await api.login(credentials);
      await store.write(credentials);
      api.setToken(adminSession.accessToken);
      congregation = adminSession.congregation;
      authenticated = true;
      return adminSession.congregation;
    },

    async run(action) {
      if (!authenticated) {
        await signInFromStore();
      }

      try {
        return await action();
      } catch (error) {
        if (!isUnauthorizedError(error)) {
          throw error;
        }
        // The token went stale mid-session (its usual twelve-hour death).
        // Sign in again and give the action exactly one more try.
        authenticated = false;
        await signInFromStore();
        return await action();
      }
    },

    async signOut() {
      await store.clear();
      api.setToken(null);
      congregation = null;
      authenticated = false;
    },

    get congregation() {
      return congregation;
    },
  };
}
