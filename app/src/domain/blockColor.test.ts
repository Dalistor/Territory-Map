// Mirrors `admin/src/renderer/map/blockColor.test.ts`: the pure rule deciding
// whether a block shows as red (never worked), orange (overdue) or green
// (recently worked) on the map — same threshold, ported to the app.
import type { Block } from './models'
import { blockColorCategory, DEFAULT_ROTATION_DAYS, OVERDUE_AFTER_MS } from './blockColor'

const DAY_MS = 24 * 60 * 60 * 1000

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
    const now = new Date('2026-08-17T12:00:00.000Z')
    const block = makeBlock({ lastWorkedAt: undefined })

    expect(blockColorCategory(block, now)).toBe('never')
  })

  it('is "overdue" when the time since worked is strictly greater than OVERDUE_AFTER_MS', () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const block = makeBlock({
      lastWorkedAt: new Date(now.getTime() - OVERDUE_AFTER_MS - 1)
    })

    expect(blockColorCategory(block, now)).toBe('overdue')
  })

  it('is "recent" when the time since worked is exactly OVERDUE_AFTER_MS', () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const block = makeBlock({
      lastWorkedAt: new Date(now.getTime() - OVERDUE_AFTER_MS)
    })

    expect(blockColorCategory(block, now)).toBe('recent')
  })

  it('is "recent" when the time since worked is less than OVERDUE_AFTER_MS', () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const block = makeBlock({
      lastWorkedAt: new Date(now.getTime() - OVERDUE_AFTER_MS + 1)
    })

    expect(blockColorCategory(block, now)).toBe('recent')
  })

  it('is "overdue" past a shorter rotation the default would still call recent', () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const block = makeBlock({ lastWorkedAt: new Date(now.getTime() - 45 * DAY_MS) })

    expect(blockColorCategory(block, now, 30)).toBe('overdue')
  })

  it('is "recent" within a shorter rotation', () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const block = makeBlock({ lastWorkedAt: new Date(now.getTime() - 10 * DAY_MS) })

    expect(blockColorCategory(block, now, 30)).toBe('recent')
  })

  it('is "recent" inside a longer rotation the default would already call overdue', () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const block = makeBlock({ lastWorkedAt: new Date(now.getTime() - 200 * DAY_MS) })

    expect(blockColorCategory(block, now, 365)).toBe('recent')
  })

  it('is "recent" exactly at the territory rotation, the same inclusive boundary as the default', () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const block = makeBlock({ lastWorkedAt: new Date(now.getTime() - 30 * DAY_MS) })

    expect(blockColorCategory(block, now, 30)).toBe('recent')
  })

  it('is "never" for a block never worked, whatever the rotation', () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const block = makeBlock({ lastWorkedAt: undefined })

    expect(blockColorCategory(block, now, 30)).toBe('never')
    expect(blockColorCategory(block, now, 365)).toBe('never')
  })

  it('falls back to the 120-day default when no rotation is given', () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const block = makeBlock({ lastWorkedAt: new Date(now.getTime() - 121 * DAY_MS) })

    expect(DEFAULT_ROTATION_DAYS).toBe(120)
    expect(blockColorCategory(block, now)).toBe('overdue')
    expect(blockColorCategory(block, now, undefined)).toBe('overdue')
  })
})

describe('blockColorCategory with a status the admin forced', () => {
  const now = new Date('2026-08-17T12:00:00.000Z')
  const yesterday = new Date(now.getTime() - DAY_MS)

  it('is "overdue" for a block worked yesterday when the admin forced "overdue"', () => {
    const block = makeBlock({ lastWorkedAt: yesterday, statusOverride: 'overdue' })

    expect(blockColorCategory(block, now)).toBe('overdue')
  })

  it('is "never" for a block worked yesterday when the admin forced "never"', () => {
    const block = makeBlock({ lastWorkedAt: yesterday, statusOverride: 'never' })

    expect(blockColorCategory(block, now)).toBe('never')
  })

  it('is "overdue" for a never-worked block the admin marked as due to be worked', () => {
    const block = makeBlock({ lastWorkedAt: undefined, statusOverride: 'overdue' })

    expect(blockColorCategory(block, now)).toBe('overdue')
  })

  it('beats any rotation the territory configured', () => {
    const block = makeBlock({ lastWorkedAt: yesterday, statusOverride: 'overdue' })

    expect(blockColorCategory(block, now, 1)).toBe('overdue')
    expect(blockColorCategory(block, now, 3650)).toBe('overdue')
  })

  it('keeps "never" over a rotation short enough to call the block overdue', () => {
    const block = makeBlock({
      lastWorkedAt: new Date(now.getTime() - 45 * DAY_MS),
      statusOverride: 'never'
    })

    expect(blockColorCategory(block, now, 30)).toBe('never')
  })

  it('treats an explicit undefined override the same as an absent one', () => {
    const worked = makeBlock({ lastWorkedAt: yesterday })
    const neverWorked = makeBlock({ lastWorkedAt: undefined })

    expect(blockColorCategory({ ...worked, statusOverride: undefined }, now)).toBe(
      blockColorCategory(worked, now)
    )
    expect(blockColorCategory({ ...neverWorked, statusOverride: undefined }, now, 30)).toBe(
      blockColorCategory(neverWorked, now, 30)
    )
  })
})
