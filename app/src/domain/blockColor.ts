// Ported from `admin/src/renderer/map/blockColor.ts`: the pure rule deciding
// whether a block shows as red (never worked), orange (overdue) or green
// (recently worked) on the map. Copied rather than shared — the app does not
// depend on the admin — but kept identical on purpose: same default rotation
// of 120 days, same territory-level `rotationDays` override, same "strictly
// greater than" boundary.
import type { Block } from './models'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The rotation a territory falls back to when it has no `rotationDays` of its
 * own — 120 days, the fixed threshold that was the only one to exist before
 * the admin could configure the setting.
 */
export const DEFAULT_ROTATION_DAYS = 120

/** `DEFAULT_ROTATION_DAYS` in milliseconds, the unit the comparison works in. */
export const OVERDUE_AFTER_MS = DEFAULT_ROTATION_DAYS * DAY_MS

export type BlockColorCategory = 'never' | 'overdue' | 'recent'

/**
 * `'never'` when the block has no work log yet; `'overdue'` once the time
 * since it was last worked is strictly greater than the rotation; `'recent'`
 * otherwise (including exactly at the threshold).
 *
 * `rotationDays` is the rotation of the territory that owns the block. Absent
 * or `undefined` means the territory never had one configured, and
 * `DEFAULT_ROTATION_DAYS` applies — the behaviour of every territory before
 * the setting existed.
 */
export function blockColorCategory(
  block: Block,
  now: Date,
  rotationDays?: number,
): BlockColorCategory {
  if (block.lastWorkedAt === undefined) {
    return 'never'
  }

  const overdueAfterMs = (rotationDays ?? DEFAULT_ROTATION_DAYS) * DAY_MS
  const timeSinceWorked = now.getTime() - block.lastWorkedAt.getTime()

  return timeSinceWorked > overdueAfterMs ? 'overdue' : 'recent'
}
