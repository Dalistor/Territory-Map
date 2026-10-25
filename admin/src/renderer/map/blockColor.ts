// Mirrors `admin/lib/presentation/map/territory_map.dart` (`_blockColor`, from
// the removed Flutter admin): the pure rule deciding whether a block shows as
// red (never worked), orange (overdue) or green (recently worked) on the map.
import type { Block } from '../../shared/models'
import { blockTimeSinceWorked } from '../../shared/models'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The rotation a territory falls back to when it has no `rotationDays` of its
 * own — 120 days, the fixed threshold the Flutter admin used and the only one
 * that existed before the setting.
 */
export const DEFAULT_ROTATION_DAYS = 120

/** `DEFAULT_ROTATION_DAYS` in milliseconds, the unit the comparison works in. */
export const DEFAULT_OVERDUE_AFTER_MS = DEFAULT_ROTATION_DAYS * DAY_MS

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
 * `rotationDays` is the territory's own rotation. Absent or `undefined` means
 * the territory never had one configured, and the default of
 * `DEFAULT_ROTATION_DAYS` applies — the behaviour of every territory before
 * the setting existed.
 *
 * `assignedSince` is when the territory's designation in force began (a
 * dirigente's or a campaign's). While there is one, the cycle restarts there:
 * a block not worked since that day is `'never'` (red, still to be worked by
 * whoever holds it now) and one worked since is `'recent'` until the
 * designation is completed — the rotation does not turn it orange meanwhile.
 * The comparison is by calendar day, because work is recorded here by date
 * (midnight) and a block worked on the very day of the designation must not
 * stay red. Absent means nobody holds the territory, and the date rule above
 * decides. Same rule as `app/` and `admin-app/`.
 */
export function blockColorCategory(
  block: Block,
  now: Date,
  rotationDays?: number,
  assignedSince?: Date
): BlockColorCategory {
  if (block.statusOverride !== undefined && block.statusOverride !== null) {
    return block.statusOverride
  }

  const timeSinceWorked = blockTimeSinceWorked(block, now)

  if (timeSinceWorked === null) {
    return 'never'
  }

  if (assignedSince !== undefined && assignedSince !== null) {
    const lastWorkedAt = now.getTime() - timeSinceWorked
    return lastWorkedAt >= startOfDay(assignedSince).getTime() ? 'recent' : 'never'
  }

  const overdueAfterMs = (rotationDays ?? DEFAULT_ROTATION_DAYS) * DAY_MS

  return timeSinceWorked > overdueAfterMs ? 'overdue' : 'recent'
}

/** Local midnight of the day `date` falls on. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * The colour each category is drawn in on the map. Lives here rather than in
 * `TerritoryMap.tsx` so the component file exports only its component (what
 * Fast Refresh needs) and so a test can name the category instead of a hex.
 */
export const CATEGORY_COLOR: Record<BlockColorCategory, string> = {
  never: '#c62828', // red -- never worked, or not since the designation began
  overdue: '#ef6c00', // orange -- past the territory's rotation
  recent: '#2e7d32' // green -- worked recently
}
