// Ported from `admin/src/renderer/map/blockColor.ts`: the pure rule deciding
// whether a block shows as red (never worked), orange (overdue) or green
// (recently worked) on the map. Copied rather than shared — the app does not
// depend on the admin — but kept identical on purpose: same 120-day
// threshold, same "strictly greater than" boundary.
import type { Block } from './models'

/** 120 days, in milliseconds — the same threshold the admin uses. */
export const OVERDUE_AFTER_MS = 120 * 24 * 60 * 60 * 1000

export type BlockColorCategory = 'never' | 'overdue' | 'recent'

/**
 * `'never'` when the block has no work log yet; `'overdue'` once the time
 * since it was last worked is strictly greater than `OVERDUE_AFTER_MS`;
 * `'recent'` otherwise (including exactly at the threshold).
 */
export function blockColorCategory(block: Block, now: Date): BlockColorCategory {
  if (block.lastWorkedAt === undefined) {
    return 'never'
  }

  const timeSinceWorked = now.getTime() - block.lastWorkedAt.getTime()
  return timeSinceWorked > OVERDUE_AFTER_MS ? 'overdue' : 'recent'
}
