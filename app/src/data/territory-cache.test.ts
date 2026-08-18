import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Territory } from '../domain/models';
import { clearCache, getCachedTerritories, saveTerritories } from './territory-cache';

/**
 * The real `@react-native-async-storage/async-storage` module talks to native
 * platform storage that does not exist in a Jest process, and its published
 * "jest" mock entry point ships as ESM the project's `transformIgnorePatterns`
 * doesn't cover. Same fix as `session-store.test.ts`'s `installFakeKeychain`:
 * mock the module and back it with a small in-memory store, so what is under
 * test stays this module's own get/set/remove logic, not a third party's.
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

const TERRITORIES: Territory[] = [
  {
    id: 'territory-1',
    name: 'Território 1',
    boundary: [
      { lat: -23.55, lng: -46.63 },
      { lat: -23.56, lng: -46.64 },
      { lat: -23.57, lng: -46.62 },
    ],
    blocks: [
      {
        id: 'block-1',
        number: 1,
        polygon: [
          { lat: -23.551, lng: -46.631 },
          { lat: -23.552, lng: -46.632 },
          { lat: -23.553, lng: -46.633 },
        ],
        // Round-tripping a `Date` through JSON turns it into a string unless
        // the cache revives it — this case exists to catch exactly that.
        lastWorkedAt: new Date('2026-08-01T12:00:00.000Z'),
      },
      {
        id: 'block-2',
        number: 2,
        polygon: [
          { lat: -23.561, lng: -46.641 },
          { lat: -23.562, lng: -46.642 },
          { lat: -23.563, lng: -46.643 },
        ],
        // Never worked. Must stay `undefined`, not become `null` or a string.
      },
    ],
    assignedUser: { id: 'user-1', name: 'João' },
  },
  {
    id: 'territory-2',
    name: 'Território 2',
    boundary: [
      { lat: -23.6, lng: -46.7 },
      { lat: -23.61, lng: -46.71 },
      { lat: -23.62, lng: -46.69 },
    ],
    blocks: [],
    // Nobody assigned.
  },
];

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('territory-cache', () => {
  describe('getCachedTerritories', () => {
    it('returns null when no save has happened yet', async () => {
      await expect(getCachedTerritories()).resolves.toBeNull();
    });
  });

  describe('saveTerritories + getCachedTerritories', () => {
    it('getCachedTerritories returns exactly the list that was saved', async () => {
      await saveTerritories(TERRITORIES);

      await expect(getCachedTerritories()).resolves.toEqual(TERRITORIES);
    });
  });

  describe('clearCache', () => {
    it('getCachedTerritories returns null after a cache that had been saved is cleared', async () => {
      await saveTerritories(TERRITORIES);

      await clearCache();

      await expect(getCachedTerritories()).resolves.toBeNull();
    });
  });
});
