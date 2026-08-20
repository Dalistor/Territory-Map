import type { Block } from './models'
import { describeLastWorked } from './lastWorked'

function makeBlock(lastWorkedAt?: Date): Block {
  return { id: 'block-1', number: 7, polygon: [], lastWorkedAt }
}

describe('describeLastWorked', () => {
  const now = new Date('2026-08-18T15:00:00Z')

  it('says so plainly when the block has never been worked', () => {
    expect(describeLastWorked(makeBlock(), now)).toBe('Nunca trabalhada')
  })

  it('says "hoje" for a visit earlier the same day', () => {
    expect(describeLastWorked(makeBlock(new Date('2026-08-18T08:00:00Z')), now)).toBe(
      'Última visita: hoje'
    )
  })

  it('says "ontem" for a visit the day before', () => {
    expect(describeLastWorked(makeBlock(new Date('2026-08-17T23:00:00Z')), now)).toBe(
      'Última visita: ontem'
    )
  })

  it('gives the date and the number of days for anything older', () => {
    expect(describeLastWorked(makeBlock(new Date('2026-08-06T10:00:00Z')), now)).toBe(
      'Última visita: 06/08/2026 (há 12 dias)'
    )
  })

  it('pads day and month to two digits', () => {
    expect(describeLastWorked(makeBlock(new Date('2026-01-05T10:00:00Z')), now)).toBe(
      'Última visita: 05/01/2026 (há 225 dias)'
    )
  })

  it('counts calendar days, not 24-hour blocks', () => {
    // 23:50 yesterday to 15:00 today is 15 hours -- one calendar day, not zero.
    expect(describeLastWorked(makeBlock(new Date('2026-08-17T23:50:00Z')), now)).toBe(
      'Última visita: ontem'
    )
  })
})
