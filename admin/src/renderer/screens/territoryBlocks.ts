// Pure helpers behind the block table of the territory dialog: how a block's
// status reads in words, how long ago it was worked, and the two orders the
// admin can read the table in. Kept apart from the component so the rules are
// tested without rendering anything.
import type { Block } from '../../shared/models'
import type { BlockColorCategory } from '../map/blockColor'

const DAY_MS = 24 * 60 * 60 * 1000

/** The map's three colours, said out loud -- the table never relies on colour alone. */
export const BLOCK_STATUS_LABEL: Record<BlockColorCategory, string> = {
  never: 'Nunca trabalhada',
  overdue: 'Vencida',
  recent: 'Em dia'
}

export type BlockSortOrder = 'number' | 'longest-unworked'

/** Whole calendar days between `date` and `now`, in the admin's own timezone. */
export function daysSince(date: Date, now: Date): number {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS))
}

/** "hoje", "ontem" or "há N dias" -- how long ago, the way the admin says it. */
export function formatDaysAgo(days: number): string {
  if (days === 0) return 'hoje'
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}

/**
 * The blocks in the order the admin asked for, never mutating the input.
 *
 * `'longest-unworked'` answers "where do we go today": blocks never worked come
 * first, then the oldest visit, and the block number breaks every tie so the
 * order is stable between reloads.
 */
export function sortBlocks(blocks: readonly Block[], order: BlockSortOrder): Block[] {
  const byNumber = (left: Block, right: Block): number => left.number - right.number
  if (order === 'number') return [...blocks].sort(byNumber)
  return [...blocks].sort((left, right) => {
    const leftTime = left.lastWorkedAt?.getTime()
    const rightTime = right.lastWorkedAt?.getTime()
    if (leftTime === undefined && rightTime === undefined) return byNumber(left, right)
    if (leftTime === undefined) return -1
    if (rightTime === undefined) return 1
    return leftTime - rightTime || byNumber(left, right)
  })
}

/**
 * A `Date` as `<input type="date">` wants it: `YYYY-MM-DD` in local time.
 * `toISOString()` would answer in UTC -- the previous day, west of Greenwich.
 */
export function toDateInputValue(date: Date): string {
  const two = (value: number): string => value.toString().padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
}

/** Local midnight of the picked day; `new Date(value)` would read the string as UTC. */
export function fromDateInputValue(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}
