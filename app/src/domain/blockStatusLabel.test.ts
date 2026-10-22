import type { Block } from './models'
import { blockStatusLabel } from './blockStatusLabel'

const now = new Date('2026-08-17T12:00:00.000Z')

function makeBlock(overrides: Partial<Block> = {}): Block {
  return { id: 'block-1', number: 7, polygon: [], ...overrides }
}

describe('blockStatusLabel', () => {
  it('follows the dates when nothing was forced', () => {
    expect(blockStatusLabel(makeBlock(), now)).toBe('Nunca trabalhada')
    expect(blockStatusLabel(makeBlock({ lastWorkedAt: now }), now)).toBe('Em dia')
  })

  it('says a forced status is forced, even when the last visit is today', () => {
    const block = makeBlock({ lastWorkedAt: now, statusOverride: 'overdue' })

    expect(blockStatusLabel(block, now)).toBe('Vencida (forçado)')
  })
})
