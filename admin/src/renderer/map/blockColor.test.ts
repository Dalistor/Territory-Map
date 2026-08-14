import { describe, expect, it } from 'vitest'
import type { Block } from '../../shared/models'
import { blockColorCategory, OVERDUE_AFTER_MS } from './blockColor'

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

  it('is "overdue" when the time since worked is strictly greater than OVERDUE_AFTER_MS', () => {
    const now = new Date('2026-08-08T12:00:00.000Z')
    const block = makeBlock({
      lastWorkedAt: new Date(now.getTime() - OVERDUE_AFTER_MS - 1)
    })

    expect(blockColorCategory(block, now)).toBe('overdue')
  })

  it('is "recent" when the time since worked is exactly OVERDUE_AFTER_MS', () => {
    const now = new Date('2026-08-08T12:00:00.000Z')
    const block = makeBlock({
      lastWorkedAt: new Date(now.getTime() - OVERDUE_AFTER_MS)
    })

    expect(blockColorCategory(block, now)).toBe('recent')
  })

  it('is "recent" when the time since worked is less than OVERDUE_AFTER_MS', () => {
    const now = new Date('2026-08-08T12:00:00.000Z')
    const block = makeBlock({
      lastWorkedAt: new Date(now.getTime() - OVERDUE_AFTER_MS + 1)
    })

    expect(blockColorCategory(block, now)).toBe('recent')
  })
})
