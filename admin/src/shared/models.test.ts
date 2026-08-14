import { describe, expect, it } from 'vitest'
import {
  blockTimeSinceWorked,
  blockWasNeverWorked,
  publisherHasLiveCode,
  publisherIsPending,
  workLogWasSyncedLate,
  type Block,
  type Publisher,
  type PublisherBrief,
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
