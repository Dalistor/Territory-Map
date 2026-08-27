import type { Assignment } from './models';
import {
  assignmentIsOpen,
  openAssignment,
  sortAssignments,
} from './assignment';

/** An assignment with only the fields these rules read spelled out per case. */
function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'assignment-1',
    territoryId: 'territory-1',
    publisher: { id: 'publisher-1', name: 'Irmão Silva' },
    startedAt: new Date('2026-08-01T09:00:00Z'),
    completedAt: null,
    ...overrides,
  };
}

describe('assignmentIsOpen', () => {
  it('is open while it carries no completion date', () => {
    expect(assignmentIsOpen(makeAssignment({ completedAt: null }))).toBe(true);
  });

  it('is closed once a completion date was written, whatever the date is', () => {
    const completed = makeAssignment({
      completedAt: new Date('2026-08-20T09:00:00Z'),
    });

    expect(assignmentIsOpen(completed)).toBe(false);
  });
});

describe('openAssignment', () => {
  it('picks the one still in force out of a card that also has history', () => {
    const open = makeAssignment({ id: 'open', completedAt: null });
    const history = [
      makeAssignment({
        id: 'older',
        startedAt: new Date('2025-01-10T09:00:00Z'),
        completedAt: new Date('2025-06-10T09:00:00Z'),
      }),
      open,
      makeAssignment({
        id: 'oldest',
        startedAt: new Date('2024-01-10T09:00:00Z'),
        completedAt: new Date('2024-06-10T09:00:00Z'),
      }),
    ];

    expect(openAssignment(history)).toBe(open);
  });

  it('has nobody in force on a card whose lines are all completed', () => {
    const history = [
      makeAssignment({
        id: 'older',
        completedAt: new Date('2025-06-10T09:00:00Z'),
      }),
      makeAssignment({
        id: 'oldest',
        completedAt: new Date('2024-06-10T09:00:00Z'),
      }),
    ];

    expect(openAssignment(history)).toBeNull();
  });

  it('has nobody in force on an empty card, and says so with null', () => {
    expect(openAssignment([])).toBeNull();
  });
});

describe('sortAssignments', () => {
  it('reads an empty card as an empty card', () => {
    expect(sortAssignments([])).toEqual([]);
  });

  it('puts the open assignment first, then the completed ones newest start first', () => {
    const open = makeAssignment({
      id: 'open',
      startedAt: new Date('2026-08-01T09:00:00Z'),
      completedAt: null,
    });
    const older = makeAssignment({
      id: 'older',
      startedAt: new Date('2025-01-10T09:00:00Z'),
      completedAt: new Date('2025-06-10T09:00:00Z'),
    });
    const newerHistory = makeAssignment({
      id: 'newer-history',
      startedAt: new Date('2026-02-10T09:00:00Z'),
      completedAt: new Date('2026-07-10T09:00:00Z'),
    });

    const sorted = sortAssignments([older, newerHistory, open]);

    expect(sorted.map(assignment => assignment.id)).toEqual([
      'open',
      'newer-history',
      'older',
    ]);
  });

  it('breaks a tie on the start date in favour of the open one', () => {
    const sameDay = new Date('2026-08-01T09:00:00Z');
    const completed = makeAssignment({
      id: 'completed',
      startedAt: sameDay,
      completedAt: new Date('2026-08-20T09:00:00Z'),
    });
    const open = makeAssignment({
      id: 'open',
      startedAt: sameDay,
      completedAt: null,
    });

    expect(sortAssignments([completed, open]).map(a => a.id)).toEqual([
      'open',
      'completed',
    ]);
  });

  it('returns a new list and leaves the one it was given untouched', () => {
    const original = [
      makeAssignment({
        id: 'older',
        startedAt: new Date('2025-01-10T09:00:00Z'),
        completedAt: new Date('2025-06-10T09:00:00Z'),
      }),
      makeAssignment({
        id: 'open',
        startedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    ];
    const before = [...original];

    const sorted = sortAssignments(original);

    expect(sorted).not.toBe(original);
    expect(original).toEqual(before);
    expect(original.map(assignment => assignment.id)).toEqual([
      'older',
      'open',
    ]);
  });
});
