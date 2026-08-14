// Mirrors `admin/lib/presentation/map/territory_map.dart` (`_blockColor`, from
// the removed Flutter admin): the pure rule deciding whether a block shows as
// red (never worked), orange (overdue) or green (recently worked) on the map.
import type { Block } from '../../shared/models'
import { blockTimeSinceWorked } from '../../shared/models'

/** 120 days, in milliseconds — the same threshold the Flutter admin used. */
export const OVERDUE_AFTER_MS = 120 * 24 * 60 * 60 * 1000

export type BlockColorCategory = 'never' | 'overdue' | 'recent'

/**
 * `'never'` when the block has no work log yet; `'overdue'` once the time
 * since it was last worked is strictly greater than `OVERDUE_AFTER_MS`;
 * `'recent'` otherwise (including exactly at the threshold).
 */
export function blockColorCategory(block: Block, now: Date): BlockColorCategory {
  const timeSinceWorked = blockTimeSinceWorked(block, now)

  if (timeSinceWorked === null) {
    return 'never'
  }

  return timeSinceWorked > OVERDUE_AFTER_MS ? 'overdue' : 'recent'
}
