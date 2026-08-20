import { describe, expect, it } from 'vitest'
import type { Block } from '../../shared/models'

const DAY_MS = 24 * 60 * 60 * 1000
import { blockColorCategory, DEFAULT_OVERDUE_AFTER_MS } from './blockColor'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    number: 12,
    polygon: [],
    ...overrides
  }
}

describe('blockColorCategory', () => {
  it('is "never" when the block was never worked', () => {
    const now = new Date('2026-08-08T12:00:00.000Z')
    const block = makeBlock({ lastWorkedAt: undefined })

    expect(blockColorCategory(block, now)).toBe('never')
  })

  it('is "overdue" when the time since worked is strictly greater than DEFAULT_OVERDUE_AFTER_MS', () => {
    const now = new Date('2026-08-08T12:00:00.000Z')
    const block = makeBlock({
      lastWorkedAt: new Date(now.getTime() - DEFAULT_OVERDUE_AFTER_MS - 1)
    })

    expect(blockColorCategory(block, now)).toBe('overdue')
  })

  it('is "recent" when the time since worked is exactly DEFAULT_OVERDUE_AFTER_MS', () => {
    const now = new Date('2026-08-08T12:00:00.000Z')
    const block = makeBlock({
      lastWorkedAt: new Date(now.getTime() - DEFAULT_OVERDUE_AFTER_MS)
    })

    expect(blockColorCategory(block, now)).toBe('recent')
  })

  it('is "recent" when the time since worked is less than DEFAULT_OVERDUE_AFTER_MS', () => {
    const now = new Date('2026-08-08T12:00:00.000Z')
    const block = makeBlock({
      lastWorkedAt: new Date(now.getTime() - DEFAULT_OVERDUE_AFTER_MS + 1)
    })

    expect(blockColorCategory(block, now)).toBe('recent')
  })
})

describe('blockColorCategory with a configured rotation', () => {
  const now = new Date('2026-08-08T12:00:00.000Z')

  function workedDaysAgo(days: number): Block {
    return makeBlock({ lastWorkedAt: new Date(now.getTime() - days * DAY_MS) })
  }

  it('is "overdue" when the block is past the territory\'s shorter rotation', () => {
    expect(blockColorCategory(workedDaysAgo(45), now, 30)).toBe('overdue')
  })

  it('is "recent" when the block is inside the territory\'s shorter rotation', () => {
    expect(blockColorCategory(workedDaysAgo(10), now, 30)).toBe('recent')
  })

  it('is "recent" under a longer rotation where the default would call it overdue', () => {
    expect(blockColorCategory(workedDaysAgo(200), now)).toBe('overdue')
    expect(blockColorCategory(workedDaysAgo(200), now, 365)).toBe('recent')
  })

  it('is "recent" exactly at the configured rotation, not overdue', () => {
    expect(blockColorCategory(workedDaysAgo(30), now, 30)).toBe('recent')
  })

  it('is "never" whatever the rotation, when the block was never worked', () => {
    const block = makeBlock({ lastWorkedAt: undefined })

    expect(blockColorCategory(block, now, 30)).toBe('never')
    expect(blockColorCategory(block, now, 365)).toBe('never')
  })

  it('treats an explicit undefined rotation the same as an absent one', () => {
    const block = workedDaysAgo(200)

    expect(blockColorCategory(block, now, undefined)).toBe(blockColorCategory(block, now))
  })
})
