// The last-known map, kept on the device so the app can still draw something
// while offline. `data/api-client.ts`'s `listTerritories` is the source of
// truth on every successful round trip; this module only remembers its last
// result. `getCachedTerritories` returning `null` for "no save has ever
// happened" is deliberate -- it is a different state from "saved, but the
// congregation currently has zero territories" (which round-trips as `[]`),
// and the caller (the map screen) needs to tell them apart to show an empty
// map with a warning instead of silently claiming there is nothing to see.
//
// `clearCache` exists for the root navigation (spec 0005, Task 26): a token
// found to be revoked or on a stale `token_version` wipes both the session
// (`session-store.ts`) and this cache together, so a device that switches
// congregations by redeeming a new access code never shows a stale map from
// the previous one.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Block, Territory } from '../domain/models';

/** Namespaced the same way `session-store.ts` namespaces its keychain entry. */
const CACHE_KEY = 'territory-map/territories-cache';

/** `Block` as it exists after a JSON round trip: `Date` degrades to `string`. */
type SerializedBlock = Omit<Block, 'lastWorkedAt'> & { lastWorkedAt?: string };
type SerializedTerritory = Omit<Territory, 'blocks'> & { blocks: SerializedBlock[] };

function reviveBlock(block: SerializedBlock): Block {
  return {
    ...block,
    lastWorkedAt: block.lastWorkedAt === undefined ? undefined : new Date(block.lastWorkedAt),
  };
}

export async function saveTerritories(territories: Territory[]): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(territories));
}

export async function getCachedTerritories(): Promise<Territory[] | null> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (raw === null) return null;

  const parsed = JSON.parse(raw) as SerializedTerritory[];
  return parsed.map((territory) => ({
    ...territory,
    blocks: territory.blocks.map(reviveBlock),
  }));
}

export async function clearCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
