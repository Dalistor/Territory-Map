import type { Block, BlockStatusOverride } from './models';
import { blockStatusLabel } from './blockStatusLabel';

const DAY_MS = 24 * 60 * 60 * 1000;

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

describe('blockStatusLabel, on a status the system derived', () => {
  it('says a block with no visit has never been worked', () => {
    expect(blockStatusLabel(makeBlock(null), NOW)).toBe('Nunca trabalhada');
  });

  it('says a block past its rotation is overdue', () => {
    expect(blockStatusLabel(makeBlock(daysBefore(200)), NOW)).toBe('Vencida');
  });

  it('says a recently worked block is up to date', () => {
    expect(blockStatusLabel(makeBlock(daysBefore(10)), NOW)).toBe('Em dia');
  });

  it('reads the status through the rotation of the territory it was given', () => {
    expect(blockStatusLabel(makeBlock(daysBefore(60)), NOW, 30)).toBe(
      'Vencida',
    );
    expect(blockStatusLabel(makeBlock(daysBefore(200)), NOW, 365)).toBe(
      'Em dia',
    );
  });
});

describe('blockStatusLabel, on a status the admin forced', () => {
  it('marks a forced "never" as forced, so the row does not read as a broken calculation', () => {
    expect(blockStatusLabel(makeBlock(daysBefore(1), 'never'), NOW)).toBe(
      'Nunca trabalhada (forçado)',
    );
  });

  it('marks a forced "overdue" as forced too', () => {
    expect(blockStatusLabel(makeBlock(daysBefore(1), 'overdue'), NOW)).toBe(
      'Vencida (forçado)',
    );
  });

  it('adds no suffix when the status came from the records themselves', () => {
    expect(blockStatusLabel(makeBlock(daysBefore(200), null), NOW)).toBe(
      'Vencida',
    );
    expect(blockStatusLabel(makeBlock(null, null), NOW)).toBe(
      'Nunca trabalhada',
    );
  });
});
