import {
  getGenericPassword,
  resetGenericPassword,
  setGenericPassword,
} from 'react-native-keychain';

import { createSession, credentialsStore, CredentialsRejectedError } from './session';
import type { CredentialsStore } from './session';
import type { Credentials } from './credentials-store';
import { ApiError, NetworkError } from './api-client';
import type { AdminSession, ApiClient } from './api-client';
import type { Congregation } from '../domain/models';

/**
 * A fake covering every member of `ApiClient`. The session only ever calls
 * `login` and `setToken`, but the interface is wide, and stubbing the rest
 * keeps the fake honest about what it implements without instantiating the
 * real HTTP client -- no test here may reach the network.
 */
function fakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    login: jest.fn(),
    setToken: jest.fn(),
    listTerritories: jest.fn(),
    getTerritory: jest.fn(),
    listTerritoriesWithBlocks: jest.fn(),
    listPublishers: jest.fn(),
    listAssignments: jest.fn(),
    listAllAssignments: jest.fn(),
    designate: jest.fn(),
    completeAssignment: jest.fn(),
    deleteAssignment: jest.fn(),
    updateAssignment: jest.fn(),
    listWorkLogs: jest.fn(),
    markWorked: jest.fn(),
    deleteWorkLog: jest.fn(),
    listCampaigns: jest.fn(),
    getCampaign: jest.fn(),
    ...overrides,
  };
}

/**
 * `store` is a fake, never the real keychain-backed module: this test process
 * has no Android keystore, and what is under test is the session's own
 * decisions, not where the three fields are kept.
 */
function fakeStore(overrides: Partial<CredentialsStore> = {}): CredentialsStore {
  return {
    read: jest.fn(async () => null),
    write: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
    ...overrides,
  };
}

const CREDENTIALS: Credentials = {
  name: 'Congregação Central',
  city: 'São Paulo',
  password: 'senha-da-congregacao',
};

const CONGREGATION: Congregation = {
  id: 'cong-1',
  name: 'Congregação Central',
  city: 'São Paulo',
};

const ADMIN_SESSION: AdminSession = { accessToken: 'token-abc', congregation: CONGREGATION };

const mockedSetGenericPassword = jest.mocked(setGenericPassword);
const mockedGetGenericPassword = jest.mocked(getGenericPassword);
const mockedResetGenericPassword = jest.mocked(resetGenericPassword);

/** What the server answers when the password is wrong, or the JWT expired. */
function unauthorized(message = 'credenciais inválidas'): ApiError {
  return new ApiError(401, message, 'unauthorized');
}

describe('createSession', () => {
  describe('isConfigured', () => {
    it('is false when the store has nothing saved', async () => {
      const store = fakeStore({ read: jest.fn(async () => null) });
      const session = createSession({ api: fakeApiClient(), store });

      await expect(session.isConfigured()).resolves.toBe(false);
    });

    it('is true when the store has saved credentials', async () => {
      const store = fakeStore({ read: jest.fn(async () => CREDENTIALS) });
      const session = createSession({ api: fakeApiClient(), store });

      await expect(session.isConfigured()).resolves.toBe(true);
    });
  });

  describe('configure', () => {
    /**
     * The admin is typing the three fields right now, so a rejection is a
     * typo to correct on the screen in front of them -- not the "saved
     * credential went stale" case that `CredentialsRejectedError` names. It
     * has to arrive as whatever the client threw, and it has to leave the
     * keystore exactly as it was.
     */
    it('propagates a login failure unchanged and writes nothing to the store', async () => {
      const loginError = unauthorized();
      const api = fakeApiClient({
        login: jest.fn(async () => {
          throw loginError;
        }),
      });
      const store = fakeStore();
      const session = createSession({ api, store });

      await expect(session.configure(CREDENTIALS)).rejects.toBe(loginError);
      expect(store.write).not.toHaveBeenCalled();
      expect(api.setToken).not.toHaveBeenCalled();
      expect(session.congregation).toBeNull();
    });

    it('on success saves the credentials, sets the token, and exposes the congregation', async () => {
      const api = fakeApiClient({ login: jest.fn(async () => ADMIN_SESSION) });
      const store = fakeStore();
      const session = createSession({ api, store });

      const result = await session.configure(CREDENTIALS);

      expect(result).toEqual(CONGREGATION);
      expect(session.congregation).toEqual(CONGREGATION);
      expect(store.write).toHaveBeenCalledWith(CREDENTIALS);
      expect(api.setToken).toHaveBeenCalledWith(ADMIN_SESSION.accessToken);
    });
  });

  describe('run', () => {
    it('throws CredentialsRejectedError, without calling the API, when nothing is saved', async () => {
      const api = fakeApiClient();
      const store = fakeStore({ read: jest.fn(async () => null) });
      const session = createSession({ api, store });

      await expect(session.run(async () => 'x')).rejects.toBeInstanceOf(CredentialsRejectedError);
      expect(api.login).not.toHaveBeenCalled();
    });

    it('signs in from the stored credentials before running the action', async () => {
      const order: string[] = [];
      const api = fakeApiClient({
        login: jest.fn(async () => {
          order.push('login');
          return ADMIN_SESSION;
        }),
      });
      const store = fakeStore({ read: jest.fn(async () => CREDENTIALS) });
      const session = createSession({ api, store });

      const result = await session.run(async () => {
        order.push('action');
        return 'action result';
      });

      expect(result).toBe('action result');
      expect(order).toEqual(['login', 'action']);
      expect(api.login).toHaveBeenCalledWith(CREDENTIALS);
      expect(api.setToken).toHaveBeenCalledWith(ADMIN_SESSION.accessToken);
      expect(session.congregation).toEqual(CONGREGATION);
    });

    it('does not sign in again on a second run() once already authenticated', async () => {
      const api = fakeApiClient({ login: jest.fn(async () => ADMIN_SESSION) });
      const store = fakeStore({ read: jest.fn(async () => CREDENTIALS) });
      const session = createSession({ api, store });

      await session.run(async () => 'first');
      await session.run(async () => 'second');

      expect(api.login).toHaveBeenCalledTimes(1);
      expect(store.read).toHaveBeenCalledTimes(1);
    });

    it('does not sign in at all when configure() already authenticated the session', async () => {
      const api = fakeApiClient({ login: jest.fn(async () => ADMIN_SESSION) });
      const store = fakeStore();
      const session = createSession({ api, store });
      await session.configure(CREDENTIALS);

      const result = await session.run(async () => 'done');

      expect(result).toBe('done');
      expect(api.login).toHaveBeenCalledTimes(1); // only the one from configure
      expect(store.read).not.toHaveBeenCalled();
    });

    /**
     * The saved password no longer works -- someone changed it on the server.
     * Retrying forever would strand the admin on a screen that cannot
     * recover, so this is the one signal that sends them back to setup.
     */
    it('converts an unauthorized sign-in with saved credentials into CredentialsRejectedError', async () => {
      const api = fakeApiClient({
        login: jest.fn(async () => {
          throw unauthorized();
        }),
      });
      const store = fakeStore({ read: jest.fn(async () => CREDENTIALS) });
      const session = createSession({ api, store });

      const error = await session.run(async () => 'x').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CredentialsRejectedError);
      expect((error as Error).message.toLowerCase()).toMatch(/novamente|de novo/);
    });

    /**
     * No connection is not a wrong password. Blaming the credentials here
     * would send the admin to the setup screen to retype three fields that
     * were never the problem, and the retyped ones would fail too.
     */
    it('propagates a non-unauthorized sign-in failure unchanged', async () => {
      const networkError = new NetworkError('sem conexão');
      const api = fakeApiClient({
        login: jest.fn(async () => {
          throw networkError;
        }),
      });
      const store = fakeStore({ read: jest.fn(async () => CREDENTIALS) });
      const session = createSession({ api, store });

      await expect(session.run(async () => 'x')).rejects.toBe(networkError);
    });

    /**
     * The twelve-hour JWT dying mid-session -- the routine failure this whole
     * module exists for. The admin must never see it.
     */
    it('retries once after an unauthorized action error: signs in again and re-runs the action', async () => {
      const api = fakeApiClient({ login: jest.fn(async () => ADMIN_SESSION) });
      const store = fakeStore({ read: jest.fn(async () => CREDENTIALS) });
      const session = createSession({ api, store });
      await session.run(async () => 'warm up'); // becomes authenticated

      let attempt = 0;
      const result = await session.run(async () => {
        attempt += 1;
        if (attempt === 1) throw unauthorized('token expirado');
        return 'second attempt result';
      });

      expect(result).toBe('second attempt result');
      expect(attempt).toBe(2);
      expect(api.login).toHaveBeenCalledTimes(2); // warm-up sign-in + retry sign-in
    });

    /**
     * A 409 is the server refusing the operation on its merits (a publisher
     * with an open assignment, say). Re-running it would repeat the refusal,
     * and re-running a *write* that had in fact succeeded would be worse.
     */
    it.each([
      ['a conflict from the server', new ApiError(409, 'designação em aberto', 'conflict')],
      ['a dead connection', new NetworkError('sem conexão')],
    ])('propagates %s without retrying the action or signing in again', async (_label, failure) => {
      const api = fakeApiClient({ login: jest.fn(async () => ADMIN_SESSION) });
      const store = fakeStore({ read: jest.fn(async () => CREDENTIALS) });
      const session = createSession({ api, store });
      await session.run(async () => 'warm up');

      const action = jest.fn(async () => {
        throw failure;
      });

      await expect(session.run(action)).rejects.toBe(failure);
      expect(action).toHaveBeenCalledTimes(1);
      expect(api.login).toHaveBeenCalledTimes(1); // no retry sign-in
    });

    /**
     * The retry is one attempt, not a loop. Both of the next two tests exist
     * to keep it that way: a session that kept re-signing-in on every 401
     * would spin against a server that is never going to say yes, with the
     * screen stuck on a spinner and nobody told why.
     */
    it('throws CredentialsRejectedError when the retried sign-in is itself rejected', async () => {
      const api = fakeApiClient({
        login: jest
          .fn()
          .mockResolvedValueOnce(ADMIN_SESSION)
          .mockRejectedValueOnce(unauthorized()),
      });
      const store = fakeStore({ read: jest.fn(async () => CREDENTIALS) });
      const session = createSession({ api, store });
      await session.run(async () => 'warm up');

      await expect(
        session.run(async () => {
          throw unauthorized('token expirado');
        }),
      ).rejects.toBeInstanceOf(CredentialsRejectedError);
    });

    it('propagates the second unauthorized error instead of retrying forever', async () => {
      const api = fakeApiClient({ login: jest.fn(async () => ADMIN_SESSION) });
      const store = fakeStore({ read: jest.fn(async () => CREDENTIALS) });
      const session = createSession({ api, store });
      await session.run(async () => 'warm up');

      const secondFailure = unauthorized('token expirado de novo');
      let attempt = 0;
      const action = jest.fn(async () => {
        attempt += 1;
        throw attempt === 1 ? unauthorized('token expirado') : secondFailure;
      });

      await expect(session.run(action)).rejects.toBe(secondFailure);
      expect(action).toHaveBeenCalledTimes(2);
      expect(api.login).toHaveBeenCalledTimes(2); // warm-up + the single retry
    });
  });

  describe('signOut', () => {
    it('clears the store, the api token, and the remembered congregation', async () => {
      const api = fakeApiClient({ login: jest.fn(async () => ADMIN_SESSION) });
      const store = fakeStore({ read: jest.fn(async () => CREDENTIALS) });
      const session = createSession({ api, store });
      await session.configure(CREDENTIALS);

      await session.signOut();

      expect(store.clear).toHaveBeenCalledTimes(1);
      expect(api.setToken).toHaveBeenCalledWith(null);
      expect(session.congregation).toBeNull();
    });

    it('marks the session unauthenticated, so the next run() signs in again', async () => {
      const api = fakeApiClient({ login: jest.fn(async () => ADMIN_SESSION) });
      const store = fakeStore({ read: jest.fn(async () => CREDENTIALS) });
      const session = createSession({ api, store });
      await session.configure(CREDENTIALS);
      await session.signOut();

      await session.run(async () => 'after sign out');

      expect(store.read).toHaveBeenCalledTimes(1); // the automatic sign-in inside run()
      expect(api.login).toHaveBeenCalledTimes(2); // configure + the new sign-in
    });

    /**
     * "Signed out" has to be true, not merely displayed. A failure to clear
     * the keystore leaves the password on the phone, and telling the admin
     * otherwise is the one lie this screen must not tell.
     */
    it('propagates a store.clear() failure instead of swallowing it', async () => {
      const clearError = new Error('keystore indisponível');
      const store = fakeStore({
        clear: jest.fn(async () => {
          throw clearError;
        }),
      });
      const session = createSession({ api: fakeApiClient(), store });

      await expect(session.signOut()).rejects.toBe(clearError);
    });
  });
});

/**
 * The adapter that turns Task 05's three free functions into the object the
 * session consumes. Driven here against the globally mocked keychain (see
 * `jest.setup.js`) rather than a fake of itself, because what is worth
 * checking is that the three members really are wired to the keystore-backed
 * module -- a getter pointing at the wrong function is exactly the kind of
 * mistake a fake would hide.
 */
describe('credentialsStore', () => {
  beforeEach(() => {
    let stored: string | null = null;
    mockedSetGenericPassword.mockImplementation(async (_username, password) => {
      stored = password;
      return true as never;
    });
    mockedGetGenericPassword.mockImplementation(async () =>
      stored === null
        ? false
        : ({ username: 'territory-map-admin-credentials', password: stored } as never),
    );
    mockedResetGenericPassword.mockImplementation(async () => {
      stored = null;
      return true;
    });
  });

  it('round-trips credentials through the keystore-backed module, and clears them', async () => {
    await expect(credentialsStore.read()).resolves.toBeNull();

    await credentialsStore.write(CREDENTIALS);
    await expect(credentialsStore.read()).resolves.toEqual(CREDENTIALS);

    await credentialsStore.clear();
    await expect(credentialsStore.read()).resolves.toBeNull();
  });
});
