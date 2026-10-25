import { describe, expect, it } from 'vitest'
import type { Block } from '../../shared/models'
import {
  blockStatusLabel,
  daysSince,
  formatDaysAgo,
  fromDateInputValue,
  sortBlocks,
  toDateInputValue
} from './territoryBlocks'

function block(number: number, lastWorkedAt?: Date): Block {
  return { id: `b${number}`, number, polygon: [], lastWorkedAt }
}

describe('blockStatusLabel', () => {
  const base: Block = { id: 'b', number: 1, polygon: [] }

  it('says a red block worked before is still to be worked', () => {
    expect(blockStatusLabel({ ...base, lastWorkedAt: new Date(2026, 0, 1) }, 'never')).toBe(
      'A trabalhar'
    )
  })

  it('keeps "Nunca trabalhada" for a block nobody visited, or one forced red', () => {
    expect(blockStatusLabel(base, 'never')).toBe('Nunca trabalhada')
    expect(
      blockStatusLabel(
        { ...base, lastWorkedAt: new Date(2026, 0, 1), statusOverride: 'never' },
        'never'
      )
    ).toBe('Nunca trabalhada')
  })

  it('names the other two colours', () => {
    expect(blockStatusLabel(base, 'overdue')).toBe('Vencida')
    expect(blockStatusLabel(base, 'recent')).toBe('Em dia')
  })
})

describe('sortBlocks', () => {
  const blocks = [
    block(3, new Date(2026, 8, 10)),
    block(1, new Date(2026, 9, 1)),
    block(4),
    block(2, new Date(2026, 8, 10)),
    block(5)
  ]

  it('orders by number without touching the input', () => {
    expect(sortBlocks(blocks, 'number').map((b) => b.number)).toEqual([1, 2, 3, 4, 5])
    expect(blocks.map((b) => b.number)).toEqual([3, 1, 4, 2, 5])
  })

  it('puts never-worked blocks first, then the oldest visit, ties broken by number', () => {
    expect(sortBlocks(blocks, 'longest-unworked').map((b) => b.number)).toEqual([4, 5, 2, 3, 1])
  })
})

describe('daysSince and formatDaysAgo', () => {
  const now = new Date(2026, 9, 17, 9, 30)

  it('counts calendar days, not 24-hour spans', () => {
    expect(daysSince(new Date(2026, 9, 16, 23, 59), now)).toBe(1)
    expect(daysSince(new Date(2026, 9, 17, 0, 1), now)).toBe(0)
    expect(daysSince(new Date(2026, 8, 17), now)).toBe(30)
  })

  it('never answers a negative number for a date in the future', () => {
    expect(daysSince(new Date(2026, 9, 20), now)).toBe(0)
  })

  it('reads the way the admin says it', () => {
    expect(formatDaysAgo(0)).toBe('hoje')
    expect(formatDaysAgo(1)).toBe('ontem')
    expect(formatDaysAgo(12)).toBe('há 12 dias')
  })
})

describe('date input conversion', () => {
  it('round-trips a local day', () => {
    const value = toDateInputValue(new Date(2026, 0, 5, 22, 0))
    expect(value).toBe('2026-01-05')
    expect(fromDateInputValue(value)).toEqual(new Date(2026, 0, 5))
  })
})
