/**
 * `api-client.ts` reads `Config.APP_KEY`/`Config.API_BASE_URL` at module load
 * time (see `api-client.test.ts`) -- this file only imports it for the
 * exception classes and the `ApiClient` type, but the import still runs that
 * module top-level code, so it needs the same mock.
 */
jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    API_BASE_URL: 'https://territory.example.test',
    APP_KEY: 'the-app-key',
  },
}));

import { ApiErrorException, NetworkException, type ApiClient } from './api-client';
import { createWorkLogQueue, WorkLogDrainError } from './work-log-queue';

/**
 * `uuid@14` ships ESM-only (`dist-node/index.js` still uses `export`), which
 * the project's `transformIgnorePatterns` doesn't cover -- same class of
 * problem as `@react-native-async-storage/async-storage` below. Production
 * code still imports the real package (Metro, not Jest, bundles the app);
 * this fake only stands in for it inside the test process, and hands out a
 * distinct id per call so uniqueness is still meaningfully exercised.
 */
jest.mock('uuid', () => {
  let counter = 0;
  return { v4: jest.fn(() => `fake-uuid-${(counter += 1)}`) };
});

/**
 * Same fix as `session-store.test.ts`'s `installFakeKeychain` and
 * `territory-cache.test.ts`: the real `@react-native-async-storage/async-storage`
 * module talks to native platform storage that does not exist in a Jest
 * process, and its published "jest" mock entry point ships as ESM the
 * project's `transformIgnorePatterns` doesn't cover. Mock the module and back
 * it with a small in-memory store, so what is under test stays this module's
 * own read/write logic, not a third party's.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => (key in store ? store[key] : null)),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN = 'app-token-abc123';
const BLOCK_ID = 'block-1';
const WORKED_AT = new Date('2026-08-17T12:00:00.000Z');

/** A `markBlockWorked` fake that always resolves -- simulates a server that accepted the visit. */
function fakeApiClient(
  markBlockWorked: ApiClient['markBlockWorked'] = jest.fn(async () => undefined),
): Pick<ApiClient, 'markBlockWorked'> {
  return { markBlockWorked };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('work-log-queue', () => {
  describe('pending', () => {
    it('resolves to an empty array when nothing has been enqueued', async () => {
      const queue = createWorkLogQueue({ apiClient: fakeApiClient() });

      await expect(queue.pending()).resolves.toEqual([]);
    });
  });

  describe('enqueue', () => {
    it('adds an item that pending() then returns, with a generated logId', async () => {
      const queue = createWorkLogQueue({ apiClient: fakeApiClient() });

      await queue.enqueue(BLOCK_ID, WORKED_AT);

      const pending = await queue.pending();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toEqual({
        logId: expect.any(String),
        blockId: BLOCK_ID,
        workedAt: WORKED_AT,
      });
    });

    it('marking the same block twice before syncing queues two entries with different logIds', async () => {
      const queue = createWorkLogQueue({ apiClient: fakeApiClient() });

      await queue.enqueue(BLOCK_ID, WORKED_AT);
      await queue.enqueue(BLOCK_ID, new Date('2026-08-17T13:00:00.000Z'));

      const pending = await queue.pending();
      expect(pending).toHaveLength(2);
      expect(pending[0].logId).not.toEqual(pending[1].logId);
    });
  });

  describe('drain', () => {
    it('happy path: a successfully synced item (server answers 201) is removed from the queue', async () => {
      const markBlockWorked = jest.fn<ReturnType<ApiClient['markBlockWorked']>, Parameters<ApiClient['markBlockWorked']>>(
        async () => undefined,
      );
      const queue = createWorkLogQueue({ apiClient: fakeApiClient(markBlockWorked) });
      await queue.enqueue(BLOCK_ID, WORKED_AT);

      await queue.drain(TOKEN);

      await expect(queue.pending()).resolves.toEqual([]);
    });

    it('an item the server answers 201 or 200 for both drain the same way: removed from the queue', async () => {
      // `markBlockWorked` (api-client.ts) already collapses 200 ("resend of a
      // known logId") and 201 ("newly created") into the same resolved
      // promise -- from this queue's perspective there is nothing to branch
      // on, so a resend simulation behaves identically to the happy path.
      const markBlockWorked = jest.fn<ReturnType<ApiClient['markBlockWorked']>, Parameters<ApiClient['markBlockWorked']>>(
        async () => undefined,
      );
      const queue = createWorkLogQueue({ apiClient: fakeApiClient(markBlockWorked) });
      await queue.enqueue(BLOCK_ID, WORKED_AT);

      await queue.drain(TOKEN);

      await expect(queue.pending()).resolves.toEqual([]);
      expect(markBlockWorked).toHaveBeenCalledTimes(1);
    });

    it('a NetworkException failure keeps the item queued for the next attempt, and does not reject', async () => {
      const markBlockWorked = jest.fn(async () => {
        throw new NetworkException('sem conexão');
      });
      const queue = createWorkLogQueue({ apiClient: fakeApiClient(markBlockWorked) });
      await queue.enqueue(BLOCK_ID, WORKED_AT);

      await expect(queue.drain(TOKEN)).resolves.toBeUndefined();

      const pending = await queue.pending();
      expect(pending).toHaveLength(1);
      expect(pending[0].blockId).toBe(BLOCK_ID);
    });

    it('an ApiErrorException failure removes the item from the queue and reports it as a definitive failure', async () => {
      const apiError = new ApiErrorException(422, 'block_not_assigned', 'Território não designado.');
      const markBlockWorked = jest.fn(async () => {
        throw apiError;
      });
      const queue = createWorkLogQueue({ apiClient: fakeApiClient(markBlockWorked) });
      await queue.enqueue(BLOCK_ID, WORKED_AT);

      const drainError = await queue.drain(TOKEN).catch((error) => error);

      expect(drainError).toBeInstanceOf(WorkLogDrainError);
      expect((drainError as WorkLogDrainError).failures).toEqual([
        { log: expect.objectContaining({ blockId: BLOCK_ID }), error: apiError },
      ]);
      await expect(queue.pending()).resolves.toEqual([]);
    });

    it('an unexpected error (neither NetworkException nor ApiErrorException) propagates instead of being swallowed', async () => {
      const unexpected = new Error('bug em algum outro lugar');
      const markBlockWorked = jest.fn(async () => {
        throw unexpected;
      });
      const queue = createWorkLogQueue({ apiClient: fakeApiClient(markBlockWorked) });
      await queue.enqueue(BLOCK_ID, WORKED_AT);

      await expect(queue.drain(TOKEN)).rejects.toBe(unexpected);
    });
  });
});
