import {
  getGenericPassword,
  resetGenericPassword,
  setGenericPassword,
} from 'react-native-keychain';

import { clearCredentials, readCredentials, saveCredentials } from './credentials-store';
import type { Credentials } from './credentials-store';

/**
 * `react-native-keychain` is mocked globally in `jest.setup.js` (there is no
 * OS keystore in a test process), the same way
 * `app/src/data/session-store.test.ts` and
 * `admin/src/main/credentials-store.test.ts` mock their own storage. What is
 * under test is this module's own logic -- round-tripping `Credentials`
 * through the three keychain calls -- never the native keystore.
 */
const mockedSetGenericPassword = jest.mocked(setGenericPassword);
const mockedGetGenericPassword = jest.mocked(getGenericPassword);
const mockedResetGenericPassword = jest.mocked(resetGenericPassword);

/** Spelled out here rather than imported, so a change to the production
 * constant has to be a deliberate change to this expectation too. */
const SERVICE = 'territory-map-admin/credentials';

const CREDENTIALS: Credentials = {
  name: 'Congregação Central',
  city: 'São Paulo',
  password: 'senha-da-congregacao',
};

/**
 * Installs a fresh in-memory fake behind the three mocked keychain functions,
 * so each test starts from "nothing stored" regardless of what a previous one
 * saved. The returned `storeRaw` is the back door the corruption tests use to
 * plant a payload this module would never have written itself.
 */
function installFakeKeychain(): { storeRaw: (password: string) => void } {
  let stored: { username: string; password: string } | null = null;

  mockedSetGenericPassword.mockImplementation(async (username, password) => {
    stored = { username, password };
    return { service: SERVICE, storage: 'KeystoreAESGCM' } as never;
  });
  mockedGetGenericPassword.mockImplementation(async () => {
    if (!stored) return false;
    return {
      service: SERVICE,
      storage: 'KeystoreAESGCM',
      username: stored.username,
      password: stored.password,
    } as never;
  });
  mockedResetGenericPassword.mockImplementation(async () => {
    stored = null;
    return true;
  });

  return {
    storeRaw(password: string) {
      stored = { username: 'planted-by-a-test', password };
    },
  };
}

let keychain: ReturnType<typeof installFakeKeychain>;

beforeEach(() => {
  jest.clearAllMocks();
  keychain = installFakeKeychain();
});

describe('credentials-store', () => {
  describe('readCredentials', () => {
    it('returns null when nothing has been saved, without throwing', async () => {
      await expect(readCredentials()).resolves.toBeNull();
    });

    it('returns null when the stored entry is not valid JSON, instead of throwing', async () => {
      keychain.storeRaw('not-json-at-all{');

      await expect(readCredentials()).resolves.toBeNull();
    });

    /**
     * All-or-nothing, same reasoning as the missing entry: a record without
     * the password is not something the session could log in with, so
     * reporting it as configured would strand the admin on a screen that
     * cannot recover.
     */
    it('returns null when the stored JSON is missing one of the three fields', async () => {
      keychain.storeRaw(JSON.stringify({ name: 'Congregação Central', city: 'São Paulo' }));

      await expect(readCredentials()).resolves.toBeNull();
    });

    /** 'null' and '42' are valid JSON but not records; reading a field off
     * them is what would actually throw. */
    it('returns null when the stored JSON parses to something that is not an object', async () => {
      keychain.storeRaw('null');

      await expect(readCredentials()).resolves.toBeNull();
    });
  });

  describe('saveCredentials + readCredentials', () => {
    it('readCredentials returns exactly the three fields that were saved', async () => {
      await saveCredentials(CREDENTIALS);

      await expect(readCredentials()).resolves.toEqual(CREDENTIALS);
    });
  });

  describe('keychain scoping', () => {
    /**
     * `app/` stores the publisher's session under 'territory-map/session'.
     * Both APKs can be installed on the same phone, so writing under that
     * name would have this app read (or overwrite) the publisher's entry.
     */
    it("reads and writes under this app's own service, not the publisher app's", async () => {
      await saveCredentials(CREDENTIALS);
      await readCredentials();
      await clearCredentials();

      expect(mockedSetGenericPassword).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ service: SERVICE }),
      );
      expect(mockedGetGenericPassword).toHaveBeenCalledWith(
        expect.objectContaining({ service: SERVICE }),
      );
      expect(mockedResetGenericPassword).toHaveBeenCalledWith(
        expect.objectContaining({ service: SERVICE }),
      );
    });
  });

  /**
   * The desktop store carries the same rule in a comment ("Nothing here is
   * ever logged, not even in an error message"); on Android a console call
   * lands in logcat, readable by anything with USB debugging on. The
   * corrupted-entry path is included on purpose: dumping the payload it
   * failed to parse is exactly the debug line someone would add later.
   */
  describe('logging', () => {
    it('never writes the password to any console method, on any path', async () => {
      const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
      const spies = methods.map(method => jest.spyOn(console, method).mockImplementation(() => {}));

      try {
        await saveCredentials(CREDENTIALS);
        await readCredentials();
        keychain.storeRaw('not-json-at-all{');
        await readCredentials();
        await clearCredentials();

        const everythingLogged = spies
          .flatMap(spy => spy.mock.calls)
          .flat()
          .map(argument => String(argument))
          .join('\n');

        expect(everythingLogged).not.toContain(CREDENTIALS.password);
      } finally {
        spies.forEach(spy => spy.mockRestore());
      }
    });
  });

  describe('clearCredentials', () => {
    it('readCredentials returns null after saved credentials are cleared', async () => {
      await saveCredentials(CREDENTIALS);

      await clearCredentials();

      await expect(readCredentials()).resolves.toBeNull();
    });
  });
});
