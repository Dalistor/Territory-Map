// Ported from `admin/src/renderer/map/blockColor.ts`: the pure rule deciding
// whether a block shows as red (never worked), orange (overdue) or green
// (recently worked) on the map. Copied rather than shared — the app does not
// depend on the admin — but kept identical on purpose: same default rotation
// of 120 days, same territory-level `rotationDays` override, same "strictly
// greater than" boundary, and the same status the admin forced on the block
// read ahead of any date, and the same designation reset: once a territory is
// designated, every block not worked since the day it went out shows red.
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
 * A status the admin forced on the block wins outright: it is read before any
 * date is looked at, so a block pinned to `'overdue'` or `'never'` shows that
 * whatever its work logs and whatever rotation the territory runs. Absent or
 * `undefined` means nothing was forced, and the rule below decides.
 *
 * Otherwise: `'never'` when the block has no work log yet; `'overdue'` once
 * the time since it was last worked is strictly greater than the rotation;
 * `'recent'` otherwise (including exactly at the threshold).
 *
 * `rotationDays` is the rotation of the territory that owns the block. Absent
 * or `undefined` means the territory never had one configured, and
 * `DEFAULT_ROTATION_DAYS` applies — the behaviour of every territory before
 * the setting existed.
 *
 * `assignedSince` is when the territory's designation in force began (a
 * dirigente's or a campaign's). While there is one, the cycle restarts there:
 * a block not worked since that day is `'never'` (red, still to be worked by
 * whoever holds it now) and one worked since is `'recent'` until the
 * designation is completed — the rotation does not turn it orange meanwhile.
 * The comparison is by calendar day, because the admin records work by date
 * (midnight) and a block worked on the very day of the designation must not
 * stay red. Absent means nobody holds the territory, and the date rule above
 * decides.
 */
export function blockColorCategory(
  block: Block,
  now: Date,
  rotationDays?: number,
  assignedSince?: Date,
): BlockColorCategory {
  if (block.statusOverride !== undefined && block.statusOverride !== null) {
    return block.statusOverride
  }

  if (block.lastWorkedAt === undefined) {
    return 'never'
  }

  if (assignedSince !== undefined) {
    return block.lastWorkedAt.getTime() >= startOfDay(assignedSince).getTime() ? 'recent' : 'never'
  }

  const overdueAfterMs = (rotationDays ?? DEFAULT_ROTATION_DAYS) * DAY_MS
  const timeSinceWorked = now.getTime() - block.lastWorkedAt.getTime()

  return timeSinceWorked > overdueAfterMs ? 'overdue' : 'recent'
}

/** Local midnight of the day `date` falls on. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
