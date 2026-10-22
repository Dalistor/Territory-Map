// How a block's status reads in words, next to the colour on the map. The
// category itself is never decided here -- it comes from `blockColorCategory`,
// so the dialog and the map can never disagree about the same block (spec
// 0018: before this, a block the admin forced to "overdue" showed orange
// while the dialog only said "Última visita: hoje"). Same labels as
// `admin-app/src/domain/blockStatusLabel.ts`.
import type { Block } from './models'
import { blockColorCategory, type BlockColorCategory } from './blockColor'

const CATEGORY_LABEL: Record<BlockColorCategory, string> = {
  never: 'Nunca trabalhada',
  overdue: 'Vencida',
  recent: 'Em dia',
}

/** The label of one category -- also what the map legend says. */
export function blockCategoryLabel(category: BlockColorCategory): string {
  return CATEGORY_LABEL[category]
}

/**
 * "Nunca trabalhada", "Vencida" or "Em dia", followed by " (forçado)" when
 * the admin forced the status -- otherwise the label would silently
 * contradict the last-visit date beside it.
 */
export function blockStatusLabel(block: Block, now: Date, rotationDays?: number): string {
  const label = CATEGORY_LABEL[blockColorCategory(block, now, rotationDays)]
  const forced = block.statusOverride !== undefined && block.statusOverride !== null
  return forced ? `${label} (forçado)` : label
}
