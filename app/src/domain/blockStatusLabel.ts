// How a block's status reads in words, next to the colour on the map. The
// category itself is never decided here -- it comes from `blockColorCategory`,
// so the dialog and the map can never disagree about the same block (spec
// 0018: before this, a block the admin forced to "overdue" showed orange
// while the dialog only said "Última visita: hoje"). Same labels as
// `admin-app/src/domain/blockStatusLabel.ts`.
import type { Block } from './models'
import { blockColorCategory, type BlockColorCategory } from './blockColor'

const CATEGORY_LABEL: Record<BlockColorCategory, string> = {
  // Red is "never worked" or "not worked since the designation began" -- the
  // legend has to cover both, so it says what red asks for.
  never: 'A trabalhar',
  overdue: 'Vencida',
  recent: 'Em dia',
}

/** The label of one category -- also what the map legend says. */
export function blockCategoryLabel(category: BlockColorCategory): string {
  return CATEGORY_LABEL[category]
}

/**
 * "A trabalhar", "Vencida" or "Em dia", followed by " (forçado)" when the
 * admin forced the status -- otherwise the label would silently contradict
 * the last-visit date beside it. A red block nobody ever visited, or one the
 * admin forced red, still reads "Nunca trabalhada".
 */
export function blockStatusLabel(
  block: Block,
  now: Date,
  rotationDays?: number,
  assignedSince?: Date,
): string {
  const category = blockColorCategory(block, now, rotationDays, assignedSince)
  const forced = block.statusOverride !== undefined && block.statusOverride !== null
  // A forced red is the admin's "Nunca trabalhada", the option they picked.
  const label =
    category === 'never' && (forced || block.lastWorkedAt === undefined)
      ? 'Nunca trabalhada'
      : CATEGORY_LABEL[category]
  return forced ? `${label} (forçado)` : label
}
