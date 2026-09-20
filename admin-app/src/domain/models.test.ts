// Two kinds of test live here, and they are checked by two different tools.
//
// The coordinate conversions have real behaviour, and Jest asserts it: the
// inversion between `[lng, lat]` and `{lat, lng}` is the classic bug of this
// project, and these functions are the only place in the app allowed to
// perform it.
//
// The entity blocks below are shape tests. Babel strips a type-only import
// without checking it, so Jest alone cannot fail on a missing or wrong field
// -- their real assertion is `npx tsc --noEmit`, which is what rejects a
// literal that does not satisfy the interface. The runtime `expect`s document
// what each field means (and keep the literals from being dead code); the
// type checker is what makes them bite. Same thing
// `app/src/domain/models.test.ts` does on its side of the monorepo.
import type {
  Assignment,
  AssignmentHistoryFilters,
  AssignmentHistoryPage,
  AssignmentWithTerritory,
  Block,
  BlockStatusOverride,
  Congregation,
  Publisher,
  Territory,
  WorkLog,
} from './models';
import { compareTerritoriesByNumber, territoryNumber, toGeoJsonRing, toLatLngList } from './models';

describe('toLatLngList', () => {
  it('reads a GeoJSON ring as latitude/longitude, without swapping the axes', () => {
    const ring = [
      [-46.6, -23.5],
      [-46.5, -23.4],
      [-46.4, -23.6],
    ];

    expect(toLatLngList(ring)).toEqual([
      { lat: -23.5, lng: -46.6 },
      { lat: -23.4, lng: -46.5 },
      { lat: -23.6, lng: -46.4 },
    ]);
  });

  it('reads an empty ring as an empty list', () => {
    expect(toLatLngList([])).toEqual([]);
  });
});

describe('toGeoJsonRing', () => {
  it('writes longitude first and closes the ring by repeating the first point', () => {
    const points = [
      { lat: -23.5, lng: -46.6 },
      { lat: -23.4, lng: -46.5 },
      { lat: -23.6, lng: -46.4 },
    ];

    expect(toGeoJsonRing(points)).toEqual([
      [-46.6, -23.5],
      [-46.5, -23.4],
      [-46.4, -23.6],
      [-46.6, -23.5],
    ]);
  });

  it('leaves a ring that already closes itself alone, instead of repeating the point twice', () => {
    const closed = [
      { lat: -23.5, lng: -46.6 },
      { lat: -23.4, lng: -46.5 },
      { lat: -23.6, lng: -46.4 },
      { lat: -23.5, lng: -46.6 },
    ];

    expect(toGeoJsonRing(closed)).toEqual([
      [-46.6, -23.5],
      [-46.5, -23.4],
      [-46.4, -23.6],
      [-46.6, -23.5],
    ]);
  });

  it('writes an empty list of points as an empty ring, with no first point to read', () => {
    expect(toGeoJsonRing([])).toEqual([]);
  });

  it('has nothing to close when given a single point', () => {
    expect(toGeoJsonRing([{ lat: -23.5, lng: -46.6 }])).toEqual([[-46.6, -23.5]]);
  });
});

describe('the round trip between the two orders', () => {
  it('preserves every value, adding only the closing point', () => {
    const points = [
      { lat: -23.5, lng: -46.6 },
      { lat: -23.4, lng: -46.5 },
      { lat: -23.6, lng: -46.4 },
    ];

    expect(toLatLngList(toGeoJsonRing(points))).toEqual([...points, points[0]]);
  });
});

describe('Congregation', () => {
  it('is the congregation the admin logged into, by name and city', () => {
    const congregation: Congregation = {
      id: 'congregation-1',
      name: 'Central',
      city: 'Cambé',
    };

    expect(congregation).toEqual({ id: 'congregation-1', name: 'Central', city: 'Cambé' });
  });
});

describe('Publisher', () => {
  it('carries a live access code with the moment it stops working', () => {
    const expiresAt = new Date('2026-08-24T10:00:00Z');
    const publisher: Publisher = {
      id: 'publisher-1',
      name: 'Irmão Silva',
      accessCode: 'K7QMX3RT',
      accessCodeExpiresAt: expiresAt,
      activatedAt: null,
      isActive: true,
    };

    expect(publisher.accessCode).toBe('K7QMX3RT');
    expect(publisher.accessCodeExpiresAt).toBe(expiresAt);
    expect(publisher.activatedAt).toBeNull();
  });

  it('has no code left once it has been redeemed, and knows when that happened', () => {
    const activatedAt = new Date('2026-08-22T09:00:00Z');
    const publisher: Publisher = {
      id: 'publisher-2',
      name: 'Irmã Souza',
      accessCode: null,
      accessCodeExpiresAt: null,
      activatedAt,
      isActive: true,
    };

    expect(publisher.accessCode).toBeNull();
    expect(publisher.activatedAt).toBe(activatedAt);
  });

  it('can be deactivated without losing the person', () => {
    const publisher: Publisher = {
      id: 'publisher-3',
      name: 'Irmão Costa',
      accessCode: null,
      accessCodeExpiresAt: null,
      activatedAt: new Date('2026-01-10T09:00:00Z'),
      isActive: false,
    };

    expect(publisher.isActive).toBe(false);
    expect(publisher.name).toBe('Irmão Costa');
  });
});

describe('Block', () => {
  it('knows which territory it belongs to, and derives its status from the work records', () => {
    const lastWorkedAt = new Date('2026-08-01T12:00:00Z');
    const block: Block = {
      id: 'block-1',
      territoryId: 'territory-1',
      number: 12,
      polygon: toLatLngList([
        [-46.6, -23.5],
        [-46.5, -23.4],
        [-46.4, -23.6],
      ]),
      lastWorkedAt,
      statusOverride: null,
    };

    expect(block.territoryId).toBe('territory-1');
    expect(block.number).toBe(12);
    expect(block.polygon).toHaveLength(3);
    expect(block.lastWorkedAt).toBe(lastWorkedAt);
    expect(block.statusOverride).toBeNull();
  });

  it('says "never worked" with a null last visit, not with a sentinel date', () => {
    const block: Block = {
      id: 'block-2',
      territoryId: 'territory-1',
      number: 13,
      polygon: [],
      lastWorkedAt: null,
      statusOverride: null,
    };

    expect(block.lastWorkedAt).toBeNull();
  });

  it('names both statuses the admin can force, and no third one for "recent"', () => {
    const forced: BlockStatusOverride[] = ['overdue', 'never'];

    expect(forced).toEqual(['overdue', 'never']);
  });
});

describe('Territory', () => {
  it('names the publisher currently responsible for it, and its own rotation', () => {
    const territory: Territory = {
      id: 'territory-1',
      name: 'Centro - N5',
      boundary: toLatLngList([
        [-46.6, -23.5],
        [-46.5, -23.4],
        [-46.4, -23.6],
      ]),
      assignedPublisher: { id: 'publisher-1', name: 'Irmão Silva' },
      rotationDays: 60,
      blocks: [],
    };

    expect(territory.assignedPublisher).toEqual({ id: 'publisher-1', name: 'Irmão Silva' });
    expect(territory.rotationDays).toBe(60);
    expect(territory.boundary).toHaveLength(3);
  });

  it('has a null publisher when nobody is responsible, and a null rotation on the default', () => {
    const territory: Territory = {
      id: 'territory-2',
      name: 'Santa Helena - N 7',
      boundary: [],
      assignedPublisher: null,
      rotationDays: null,
      blocks: [],
    };

    expect(territory.assignedPublisher).toBeNull();
    expect(territory.rotationDays).toBeNull();
  });

  it('carries its blocks, which the listing endpoint leaves empty', () => {
    const block: Block = {
      id: 'block-1',
      territoryId: 'territory-3',
      number: 1,
      polygon: [],
      lastWorkedAt: null,
      statusOverride: null,
    };
    const territory: Territory = {
      id: 'territory-3',
      name: 'Jardim - N2',
      boundary: [],
      assignedPublisher: null,
      rotationDays: null,
      blocks: [block],
    };

    expect(territory.blocks).toEqual([block]);
  });
});

describe('Assignment', () => {
  it('is still open while it has no completion date -- the one in force', () => {
    const startedAt = new Date('2026-08-01T09:00:00Z');
    const assignment: Assignment = {
      id: 'assignment-1',
      territoryId: 'territory-1',
      publisher: { id: 'publisher-1', name: 'Irmão Silva' },
      startedAt,
      completedAt: null,
    };

    expect(assignment.startedAt).toBe(startedAt);
    expect(assignment.completedAt).toBeNull();
    expect(assignment.territoryId).toBe('territory-1');
  });

  it('becomes history once it carries both dates', () => {
    const assignment: Assignment = {
      id: 'assignment-2',
      territoryId: 'territory-1',
      publisher: { id: 'publisher-2', name: 'Irmã Souza' },
      startedAt: new Date('2026-01-10T09:00:00Z'),
      completedAt: new Date('2026-05-20T09:00:00Z'),
    };

    expect(assignment.completedAt).toEqual(new Date('2026-05-20T09:00:00Z'));
  });

  it('keeps the name of whoever led it, even after the person is deleted', () => {
    const assignment: Assignment = {
      id: 'assignment-3',
      territoryId: 'territory-2',
      publisher: { id: 'publisher-gone', name: 'Irmão Costa' },
      startedAt: new Date('2025-03-01T09:00:00Z'),
      completedAt: new Date('2025-09-01T09:00:00Z'),
    };

    expect(assignment.publisher.name).toBe('Irmão Costa');
  });
});

describe('AssignmentWithTerritory', () => {
  it('keeps the copied publisher name and territory in a congregation-wide history page', () => {
    const assignment: AssignmentWithTerritory = {
      id: 'assignment-4',
      territoryId: 'territory-3',
      territory: { id: 'territory-3', name: 'Centro - N3' },
      publisher: { id: 'publisher-gone', name: 'Irmão Costa' },
      startedAt: new Date('2025-03-01T09:00:00Z'),
      completedAt: null,
    };
    const page: AssignmentHistoryPage = {
      items: [assignment],
      total: 1,
      page: 1,
      pageSize: 50,
    };
    const filters: AssignmentHistoryFilters = { publisherId: 'publisher-gone', page: 2 };

    expect(page.items[0].publisher.name).toBe('Irmão Costa');
    expect(page.items[0].territory.name).toBe('Centro - N3');
    expect(filters.page).toBe(2);
  });
});

describe('WorkLog', () => {
  it('records who worked which block, and when', () => {
    const workedAt = new Date('2026-08-20T14:30:00Z');
    const log: WorkLog = {
      id: 'log-1',
      blockId: 'block-1',
      publisher: { id: 'publisher-1', name: 'Irmão Silva' },
      workedAt,
    };

    expect(log.blockId).toBe('block-1');
    expect(log.publisher).toEqual({ id: 'publisher-1', name: 'Irmão Silva' });
    expect(log.workedAt).toBe(workedAt);
  });
});

describe('territoryNumber', () => {
  it('reads the number after the dash', () => {
    expect(territoryNumber('Centro - N5')).toBe(5);
  });

  it('tolerates a space between the N and the digits', () => {
    expect(territoryNumber('Santa Helena - N 7')).toBe(7);
  });

  it('reads the last run of digits, not the first, when the area name has its own', () => {
    expect(territoryNumber('Cambé 3 - N1')).toBe(1);
  });

  it('is null for a name with no number at all', () => {
    expect(territoryNumber('Centro')).toBeNull();
  });
});

describe('compareTerritoriesByNumber', () => {
  /** Sorts names the way the territory list has to render them. */
  function sorted(names: string[]): string[] {
    return [...names].sort(compareTerritoriesByNumber);
  }

  it('orders by the territory number, not by the area name', () => {
    // The screenshot that prompted this: "Casarotto -N28" reads before
    // "Centro - N5" alphabetically, but the congregation reads it after.
    expect(sorted(['Santa Helena - N 7', 'Próximo ao centro - N12', 'Centro - N6'])).toEqual([
      'Centro - N6',
      'Santa Helena - N 7',
      'Próximo ao centro - N12',
    ]);
  });

  it('puts 10 after 9 instead of after 1', () => {
    expect(sorted(['Santa Helena - N 10', 'Cambé 3 - N1', 'Santa Helena - N 9'])).toEqual([
      'Cambé 3 - N1',
      'Santa Helena - N 9',
      'Santa Helena - N 10',
    ]);
  });

  it('sends the numberless names to the end, alphabetically among themselves', () => {
    expect(sorted(['Zona sem número', 'Centro - N5', 'Alfa sem número'])).toEqual([
      'Centro - N5',
      'Alfa sem número',
      'Zona sem número',
    ]);
  });

  it('falls back to the name when two territories share a number', () => {
    expect(sorted(['Vila B - N3', 'Vila A - N3'])).toEqual(['Vila A - N3', 'Vila B - N3']);
  });
});
