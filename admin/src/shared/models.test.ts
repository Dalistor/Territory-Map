import { describe, expect, it } from 'vitest'
import {
  assignmentIsOpen,
  blockTimeSinceWorked,
  blockWasNeverWorked,
  compareTerritoriesByNumber,
  publisherHasLiveCode,
  publisherIsPending,
  territoryNumber,
  workLogWasSyncedLate,
  type Assignment,
  type Block,
  type BlockStatusOverride,
  type Publisher,
  type PublisherBrief,
  type Territory,
  type WorkLog
} from './models'

function makePublisher(overrides: Partial<Publisher> = {}): Publisher {
  return {
    id: 'pub-1',
    name: 'João',
    isActive: true,
    ...overrides
  }
}

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    number: 12,
    polygon: [],
    ...overrides
  }
}

function makePublisherBrief(overrides: Partial<PublisherBrief> = {}): PublisherBrief {
  return {
    id: 'pub-1',
    name: 'João',
    ...overrides
  }
}

function makeWorkLog(overrides: Partial<WorkLog> = {}): WorkLog {
  return {
    id: 'log-1',
    blockId: 'block-1',
    publisher: makePublisherBrief(),
    workedAt: new Date('2026-08-08T10:00:00.000Z'),
    createdAt: new Date('2026-08-08T10:00:00.000Z'),
    ...overrides
  }
}

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'assignment-1',
    publisher: makePublisherBrief(),
    startedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides
  }
}

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'territory-1',
    name: 'Centro - N5',
    boundary: [],
    blocks: [],
    ...overrides
  }
}

describe('Block status override', () => {
  it('carries the status the admin forced for the block', () => {
    const block = makeBlock({ statusOverride: 'overdue' })

    expect(block.statusOverride).toBe('overdue')
  })

  it('leaves statusOverride undefined when the status derives from the work records', () => {
    const block = makeBlock()

    expect(block.statusOverride).toBeUndefined()
  })

  it('names both forced statuses, and no third one for "recent"', () => {
    const forced: BlockStatusOverride[] = ['overdue', 'never']

    expect(forced.map((status) => makeBlock({ statusOverride: status }).statusOverride)).toEqual([
      'overdue',
      'never'
    ])
  })
})

describe('Territory rotation', () => {
  it('carries the rotation the admin configured, in days', () => {
    const territory = makeTerritory({ rotationDays: 60 })

    expect(territory.rotationDays).toBe(60)
  })

  it('leaves rotationDays undefined when the territory uses the default rotation', () => {
    const territory = makeTerritory()

    expect(territory.rotationDays).toBeUndefined()
  })
})

describe('publisherIsPending', () => {
  it('is pending when activatedAt is undefined', () => {
    const publisher = makePublisher({ activatedAt: undefined })

    expect(publisherIsPending(publisher)).toBe(true)
  })

  it('is not pending once activatedAt is set', () => {
    const publisher = makePublisher({ activatedAt: new Date('2026-01-01T00:00:00Z') })

    expect(publisherIsPending(publisher)).toBe(false)
  })
})

describe('blockWasNeverWorked', () => {
  it('was never worked when lastWorkedAt is undefined', () => {
    const block = makeBlock({ lastWorkedAt: undefined })

    expect(blockWasNeverWorked(block)).toBe(true)
  })

  it('was worked once lastWorkedAt is set', () => {
    const block = makeBlock({ lastWorkedAt: new Date('2026-01-01T00:00:00Z') })

    expect(blockWasNeverWorked(block)).toBe(false)
  })
})

describe('assignmentIsOpen', () => {
  it('is open while completedAt is absent', () => {
    const assignment = makeAssignment({ completedAt: undefined })

    expect(assignmentIsOpen(assignment)).toBe(true)
  })

  it('is closed once completedAt is set', () => {
    const assignment = makeAssignment({ completedAt: new Date('2026-08-15T00:00:00.000Z') })

    expect(assignmentIsOpen(assignment)).toBe(false)
  })
})

describe('publisherHasLiveCode', () => {
  it('has a live code when accessCode exists and expires after now', () => {
    const now = new Date('2026-08-08T12:00:00Z')
    const publisher = makePublisher({
      accessCode: 'ABCD1234',
      accessCodeExpiresAt: new Date('2026-08-08T13:00:00Z')
    })

    expect(publisherHasLiveCode(publisher, now)).toBe(true)
  })

  it('has no live code when accessCode is absent, even with a future expiry', () => {
    const now = new Date('2026-08-08T12:00:00Z')
    const publisher = makePublisher({
      accessCode: undefined,
      accessCodeExpiresAt: new Date('2026-08-08T13:00:00Z')
    })

    expect(publisherHasLiveCode(publisher, now)).toBe(false)
  })

  it('has no live code when accessCodeExpiresAt is absent', () => {
    const now = new Date('2026-08-08T12:00:00Z')
    const publisher = makePublisher({
      accessCode: 'ABCD1234',
      accessCodeExpiresAt: undefined
    })

    expect(publisherHasLiveCode(publisher, now)).toBe(false)
  })

  it('treats now exactly equal to accessCodeExpiresAt as expired, not live', () => {
    const expiresAt = new Date('2026-08-08T13:00:00Z')
    const publisher = makePublisher({
      accessCode: 'ABCD1234',
      accessCodeExpiresAt: expiresAt
    })

    expect(publisherHasLiveCode(publisher, new Date(expiresAt.getTime()))).toBe(false)
  })

  it('has no live code once now is after accessCodeExpiresAt', () => {
    const now = new Date('2026-08-08T14:00:00Z')
    const publisher = makePublisher({
      accessCode: 'ABCD1234',
      accessCodeExpiresAt: new Date('2026-08-08T13:00:00Z')
    })

    expect(publisherHasLiveCode(publisher, now)).toBe(false)
  })
})

describe('blockTimeSinceWorked', () => {
  it('is null when the block was never worked', () => {
    const now = new Date('2026-08-08T12:00:00Z')
    const block = makeBlock({ lastWorkedAt: undefined })

    expect(blockTimeSinceWorked(block, now)).toBeNull()
  })

  it('is the millisecond difference between now and lastWorkedAt', () => {
    const now = new Date('2026-08-08T12:00:00.000Z')
    const block = makeBlock({ lastWorkedAt: new Date('2026-08-08T10:00:00.000Z') })

    expect(blockTimeSinceWorked(block, now)).toBe(2 * 60 * 60 * 1000)
  })
})

describe('workLogWasSyncedLate', () => {
  it('was synced late when createdAt is more than 5 minutes after workedAt', () => {
    const log = makeWorkLog({
      workedAt: new Date('2026-08-08T10:00:00.000Z'),
      createdAt: new Date('2026-08-08T10:05:00.001Z')
    })

    expect(workLogWasSyncedLate(log)).toBe(true)
  })

  it('was not synced late at exactly 5 minutes', () => {
    const log = makeWorkLog({
      workedAt: new Date('2026-08-08T10:00:00.000Z'),
      createdAt: new Date('2026-08-08T10:05:00.000Z')
    })

    expect(workLogWasSyncedLate(log)).toBe(false)
  })

  it('was not synced late when createdAt is less than 5 minutes after workedAt', () => {
    const log = makeWorkLog({
      workedAt: new Date('2026-08-08T10:00:00.000Z'),
      createdAt: new Date('2026-08-08T10:02:00.000Z')
    })

    expect(workLogWasSyncedLate(log)).toBe(false)
  })

  it('was not synced late when createdAt equals workedAt', () => {
    const log = makeWorkLog({
      workedAt: new Date('2026-08-08T10:00:00.000Z'),
      createdAt: new Date('2026-08-08T10:00:00.000Z')
    })

    expect(workLogWasSyncedLate(log)).toBe(false)
  })
})

describe('territoryNumber', () => {
  it('reads the number that follows the "N" marker', () => {
    expect(territoryNumber('Centro - N5')).toBe(5)
  })

  it('reads it with a space after the N, the way some names are typed', () => {
    expect(territoryNumber('Santa Helena - N 7')).toBe(7)
  })

  it('ignores a number that is part of the area name, taking the territory number', () => {
    expect(territoryNumber('Cambé 3 - N1')).toBe(1)
  })

  it('is null when the name carries no number at all', () => {
    expect(territoryNumber('Centro')).toBeNull()
  })
})

describe('compareTerritoriesByNumber', () => {
  /** Sorts names the way the admin's territory list has to render them. */
  function sorted(names: string[]): string[] {
    return [...names].sort(compareTerritoriesByNumber)
  }

  it('orders by the territory number, not by the area name', () => {
    expect(sorted(['Santa Helena - N 7', 'Próximo ao centro - N12', 'Centro - N6'])).toEqual([
      'Centro - N6',
      'Santa Helena - N 7',
      'Próximo ao centro - N12'
    ])
  })

  it('puts 10 after 9 instead of after 1', () => {
    expect(sorted(['Santa Helena - N 10', 'Cambé 3 - N1', 'Santa Helena - N 9'])).toEqual([
      'Cambé 3 - N1',
      'Santa Helena - N 9',
      'Santa Helena - N 10'
    ])
  })

  it('sends the numberless names to the end, alphabetically among themselves', () => {
    expect(sorted(['Zona sem número', 'Centro - N5', 'Alfa sem número'])).toEqual([
      'Centro - N5',
      'Alfa sem número',
      'Zona sem número'
    ])
  })

  it('falls back to the name when two territories share a number', () => {
    expect(sorted(['Vila B - N3', 'Vila A - N3'])).toEqual(['Vila A - N3', 'Vila B - N3'])
  })
})
