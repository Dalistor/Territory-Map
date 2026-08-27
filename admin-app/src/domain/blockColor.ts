// The third deliberate copy of the block colour rule. The other two are
// `admin/src/renderer/map/blockColor.ts` and `app/src/domain/blockColor.ts`,
// and the three are kept identical in behaviour on purpose -- there is no
// shared package between these projects, so changing one without the other two
// makes the same territory show different colours on the admin's desk, on the
// admin's phone and on the publisher's phone.
//
// Identical in behaviour, not character by character: this app spells an
// absent value `null` (see the note at the top of `models.ts`), where the other
// two also accept `undefined`. What is ported exactly is what the rule decides:
// the same 120-day default, the same territory-level rotation, the same
// "strictly greater than" boundary, and the forced status read ahead of any
// date.
import type { Block } from './models';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The rotation a territory falls back to when it has no `rotationDays` of its
 * own -- 120 days, the fixed threshold that was the only one to exist before
 * the admin could configure the setting.
 */
export const DEFAULT_ROTATION_DAYS = 120;

export type BlockColorCategory = 'never' | 'overdue' | 'recent';

/**
 * A status the admin forced on the block wins outright: it is read before any
 * date is looked at, so a block pinned to `'overdue'` or `'never'` shows that
 * whatever its work logs say and whatever rotation the territory runs. `null`
 * means nothing was forced, and the rule below decides.
 *
 * Otherwise: `'never'` when the block has no work log yet; `'overdue'` once the
 * time since it was last worked is strictly greater than the rotation;
 * `'recent'` otherwise -- including exactly at the threshold, which is still a
 * territory in its cycle rather than one out of it.
 *
 * `rotationDays` is the rotation of the territory that owns the block. `null`
 * or absent means the territory never had one configured, and
 * `DEFAULT_ROTATION_DAYS` applies -- the behaviour of every territory before
 * the setting existed. It is nullable rather than merely optional because
 * `Territory.rotationDays` is `number | null`, so a caller can pass the field
 * straight through instead of translating it at every call site.
 */
export function blockColorCategory(
  block: Block,
  now: Date,
  rotationDays?: number | null,
): BlockColorCategory {
  if (block.statusOverride !== null) {
    return block.statusOverride;
  }

  if (block.lastWorkedAt === null) {
    return 'never';
  }

  const overdueAfterMs = (rotationDays ?? DEFAULT_ROTATION_DAYS) * DAY_MS;
  const timeSinceWorked = now.getTime() - block.lastWorkedAt.getTime();

  return timeSinceWorked > overdueAfterMs ? 'overdue' : 'recent';
}
