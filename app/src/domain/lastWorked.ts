// The one sentence the publisher reads about a block: when it was last
// worked. Pure, so it is tested in milliseconds and reused by every place
// that shows a block -- the confirmation dialog and the read-only sheet.
//
// The date is formatted by hand rather than with `toLocaleDateString`:
// Hermes ships without full Intl data on Android, so the locale-aware call
// silently falls back to a US-style order on some devices. dd/mm/aaaa is
// what a Brazilian publisher expects, and building it here makes that a
// property of this function instead of of the phone.
import type { Block } from './models'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** `18/08/2026`, in the device's own timezone -- the same day the publisher sees on the calendar. */
export function formatDate(date: Date): string {
  return `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}/${date.getFullYear()}`
}

/**
 * Whole calendar days between the two dates, ignoring the time of day.
 *
 * Counting calendar days rather than 24-hour spans is what makes a visit at
 * 23:50 yesterday read as "ontem" instead of "hoje" -- the publisher thinks
 * in days on a calendar, not in elapsed hours.
 */
function calendarDaysBetween(from: Date, to: Date): number {
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((toMidnight - fromMidnight) / MS_PER_DAY)
}

/**
 * "Nunca trabalhada", "Última visita: hoje", "Última visita: ontem", or the
 * date plus how long ago it was ("Última visita: 06/08/2026 (há 12 dias)").
 *
 * The day count is spelled out next to the date because that is the number
 * the decision actually turns on -- AGENTS.md's "última vez trabalhada é a
 * informação mais útil do sistema no dia a dia".
 */
export function describeLastWorked(block: Block, now: Date): string {
  if (block.lastWorkedAt === undefined) return 'Nunca trabalhada'

  const days = calendarDaysBetween(block.lastWorkedAt, now)
  if (days <= 0) return 'Última visita: hoje'
  if (days === 1) return 'Última visita: ontem'
  return `Última visita: ${formatDate(block.lastWorkedAt)} (há ${days} dias)`
}
