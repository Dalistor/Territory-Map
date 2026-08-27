import type { Block, BlockStatusOverride } from './models';
import { DEFAULT_ROTATION_DAYS, blockColorCategory } from './blockColor';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Now" for every case here, so no test reads the real clock. */
const NOW = new Date('2026-08-23T12:00:00Z');

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function makeBlock(
  lastWorkedAt: Date | null,
  statusOverride: BlockStatusOverride | null = null,
): Block {
  return {
    id: 'block-1',
    territoryId: 'territory-1',
    number: 12,
    polygon: [],
    lastWorkedAt,
    statusOverride,
  };
}

describe('blockColorCategory, on the work records alone', () => {
  it('has never been worked when no visit was ever recorded', () => {
    expect(blockColorCategory(makeBlock(null), NOW)).toBe('never');
  });

  it('is recent ten days after a visit, well inside the default rotation', () => {
    expect(blockColorCategory(makeBlock(daysBefore(10)), NOW)).toBe('recent');
  });

  it('is overdue two hundred days after a visit, well past the default rotation', () => {
    expect(blockColorCategory(makeBlock(daysBefore(200)), NOW)).toBe('overdue');
  });
});

describe('blockColorCategory, at the edge of the rotation', () => {
  it('is still recent exactly at the threshold, not yet overdue', () => {
    expect(blockColorCategory(makeBlock(daysBefore(120)), NOW, 120)).toBe(
      'recent',
    );
  });

  it('turns overdue only strictly past the threshold, by a single millisecond', () => {
    const oneMsPast = new Date(NOW.getTime() - (120 * DAY_MS + 1));

    expect(blockColorCategory(makeBlock(oneMsPast), NOW, 120)).toBe('overdue');
  });
});

describe('blockColorCategory, with the rotation of the territory that owns the block', () => {
  it('honours a shorter rotation: sixty days is overdue in a thirty-day territory', () => {
    expect(blockColorCategory(makeBlock(daysBefore(60)), NOW, 30)).toBe(
      'overdue',
    );
  });

  it('honours a longer rotation: two hundred days is recent in a 365-day territory', () => {
    expect(blockColorCategory(makeBlock(daysBefore(200)), NOW, 365)).toBe(
      'recent',
    );
  });

  it('falls back to the default when the territory has no rotation of its own', () => {
    expect(blockColorCategory(makeBlock(daysBefore(200)), NOW, null)).toBe(
      'overdue',
    );
    expect(blockColorCategory(makeBlock(daysBefore(10)), NOW, null)).toBe(
      'recent',
    );
  });

  it('falls back to the default when no rotation is passed at all', () => {
    expect(blockColorCategory(makeBlock(daysBefore(200)), NOW)).toBe('overdue');
    expect(blockColorCategory(makeBlock(daysBefore(10)), NOW)).toBe('recent');
  });
});

describe('blockColorCategory, with a status the admin forced', () => {
  it('shows never worked on a block visited yesterday, because the admin said so', () => {
    expect(blockColorCategory(makeBlock(daysBefore(1), 'never'), NOW)).toBe(
      'never',
    );
  });

  it('shows overdue on a block visited yesterday, because the admin said so', () => {
    expect(blockColorCategory(makeBlock(daysBefore(1), 'overdue'), NOW)).toBe(
      'overdue',
    );
  });

  it('wins over the rotation too, not just over the date', () => {
    expect(
      blockColorCategory(makeBlock(daysBefore(1), 'overdue'), NOW, 365),
    ).toBe('overdue');
  });

  it('leaves the date rule in charge when nothing was forced', () => {
    expect(blockColorCategory(makeBlock(daysBefore(1), null), NOW)).toBe(
      'recent',
    );
  });
});

describe('DEFAULT_ROTATION_DAYS', () => {
  it('is the 120 days that was the only threshold before rotation was configurable', () => {
    expect(DEFAULT_ROTATION_DAYS).toBe(120);
  });
});
