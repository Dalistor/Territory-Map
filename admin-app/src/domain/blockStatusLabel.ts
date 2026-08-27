// How a block's status reads in words on the block list. The category itself
// is never decided here -- it comes from `blockColorCategory`, so the list and
// the map can never disagree about the same block. This module only puts the
// category into Portuguese and says when it was forced by hand.
import type { Block } from './models';
import { blockColorCategory } from './blockColor';
import type { BlockColorCategory } from './blockColor';

/**
 * One label per category. `recent` reads "Em dia" rather than the desktop's
 * "Recente": on the phone the label stands alone in a row, without the colour
 * legend next to it, and "em dia" answers the question the admin is actually
 * asking in the field -- whether the block still needs a visit this cycle.
 */
const CATEGORY_LABEL: Record<BlockColorCategory, string> = {
  never: 'Nunca trabalhada',
  overdue: 'Vencida',
  recent: 'Em dia',
};

/**
 * Said out loud, a forced status is followed by "(forçado)". Without it the
 * row would silently contradict the last-visit date beside it, and the admin
 * would read his own choice as a broken calculation. There is no forced
 * "recent", so the suffix only ever lands on the two labels above it.
 *
 * `rotationDays` is the rotation of the territory that owns the block, passed
 * straight through to `blockColorCategory` -- `null` or absent means the
 * default rotation.
 */
export function blockStatusLabel(
  block: Block,
  now: Date,
  rotationDays?: number | null,
): string {
  const label = CATEGORY_LABEL[blockColorCategory(block, now, rotationDays)];

  return block.statusOverride === null ? label : `${label} (forçado)`;
}
