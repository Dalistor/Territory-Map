// The calculations behind the assignments map. They are tested here, and not
// through the component, because the component wraps a native MapLibre view
// that Jest cannot render -- see the header of `territoryMap.ts`.
import type { Block, Territory } from './models';
import {
  ASSIGNED_TERRITORY_COLOR,
  BLOCK_CATEGORY_COLOR,
  NO_LEADER_LABEL,
  UNASSIGNED_TERRITORY_COLOR,
  averageCentroid,
  blockMapFeatures,
  territoriesBounds,
  territoryColor,
  territoryLeaderLabel,
  territoryMapFeatures,
} from './territoryMap';

const SQUARE = [
  { lat: -23.5, lng: -46.6 },
  { lat: -23.5, lng: -46.4 },
  { lat: -23.3, lng: -46.4 },
  { lat: -23.3, lng: -46.6 },
];

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 't1',
    name: 'Centro',
    boundary: SQUARE,
    assignedPublisher: null,
    rotationDays: null,
    blocks: [],
    ...overrides,
  };
}

describe('territoryColor', () => {
  it('paints an assigned territory blue', () => {
    const territory = makeTerritory({
      assignedPublisher: { id: 'u1', name: 'Ana' },
    });

    expect(territoryColor(territory)).toBe(ASSIGNED_TERRITORY_COLOR);
  });

  it('paints an unassigned territory grey', () => {
    expect(territoryColor(makeTerritory())).toBe(UNASSIGNED_TERRITORY_COLOR);
  });
});

describe('territoryLeaderLabel', () => {
  it('names the publisher in charge', () => {
    const territory = makeTerritory({
      assignedPublisher: { id: 'u1', name: 'Ana' },
    });

    expect(territoryLeaderLabel(territory)).toBe('Ana');
  });

  it('says nobody is in charge when there is no assignment', () => {
    expect(territoryLeaderLabel(makeTerritory())).toBe(NO_LEADER_LABEL);
  });
});

describe('averageCentroid', () => {
  it('averages the vertices', () => {
    expect(averageCentroid(SQUARE)).toEqual({ lat: -23.4, lng: -46.5 });
  });

  it('has no centre for an empty ring, instead of NaN', () => {
    expect(averageCentroid([])).toBeNull();
  });
});

describe('territoryMapFeatures', () => {
  it('closes the ring and keeps longitude first', () => {
    const [feature] = territoryMapFeatures([makeTerritory()]);

    expect(feature.ring).toHaveLength(SQUARE.length + 1);
    expect(feature.ring[0]).toEqual([-46.6, -23.5]);
    expect(feature.ring[feature.ring.length - 1]).toEqual(feature.ring[0]);
  });

  it('carries the colour and both label lines of each territory', () => {
    const features = territoryMapFeatures([
      makeTerritory({
        id: 't1',
        name: 'Centro',
        assignedPublisher: { id: 'u1', name: 'Ana' },
      }),
      makeTerritory({ id: 't2', name: 'Vila Nova' }),
    ]);

    expect(features.map(feature => feature.territory.name)).toEqual([
      'Centro',
      'Vila Nova',
    ]);
    expect(features[0]).toMatchObject({
      color: ASSIGNED_TERRITORY_COLOR,
      hasLeader: true,
      leaderLabel: 'Ana',
    });
    expect(features[1]).toMatchObject({
      color: UNASSIGNED_TERRITORY_COLOR,
      hasLeader: false,
      leaderLabel: NO_LEADER_LABEL,
    });
  });

  it('places the label on the centroid of the boundary', () => {
    const [feature] = territoryMapFeatures([makeTerritory()]);

    expect(feature.center).toEqual({ lat: -23.4, lng: -46.5 });
  });

  it('skips a territory whose boundary is not a polygon', () => {
    const features = territoryMapFeatures([
      makeTerritory({ id: 't1', boundary: [] }),
      makeTerritory({
        id: 't2',
        boundary: [
          { lat: -23.5, lng: -46.6 },
          { lat: -23.4, lng: -46.5 },
        ],
      }),
      makeTerritory({ id: 't3' }),
    ]);

    expect(features.map(feature => feature.territory.id)).toEqual(['t3']);
  });

  it('draws nothing when there are no territories', () => {
    expect(territoryMapFeatures([])).toEqual([]);
  });
});

const NOW = new Date('2026-08-23T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'b1',
    territoryId: 't1',
    number: 1,
    polygon: SQUARE,
    lastWorkedAt: null,
    statusOverride: null,
    ...overrides,
  };
}

describe('blockMapFeatures', () => {
  it('flattens the blocks of every territory, each carrying its own', () => {
    const features = blockMapFeatures(
      [
        makeTerritory({
          id: 't1',
          blocks: [
            makeBlock({ id: 'b1', number: 1 }),
            makeBlock({ id: 'b2', number: 2 }),
          ],
        }),
        makeTerritory({
          id: 't2',
          blocks: [
            makeBlock({ id: 'b3', number: 3 }),
            makeBlock({ id: 'b4', number: 4 }),
          ],
        }),
      ],
      NOW,
    );

    expect(features.map(feature => feature.block.id)).toEqual([
      'b1',
      'b2',
      'b3',
      'b4',
    ]);
    expect(features.map(feature => feature.territory.id)).toEqual([
      't1',
      't1',
      't2',
      't2',
    ]);
  });

  it('paints a never worked block red', () => {
    const [feature] = blockMapFeatures(
      [makeTerritory({ blocks: [makeBlock({ lastWorkedAt: null })] })],
      NOW,
    );

    expect(feature.color).toBe('#c62828');
    expect(feature.color).toBe(BLOCK_CATEGORY_COLOR.never);
  });

  it('paints a block past its rotation orange', () => {
    const [feature] = blockMapFeatures(
      [
        makeTerritory({
          rotationDays: 120,
          blocks: [makeBlock({ lastWorkedAt: daysAgo(200) })],
        }),
      ],
      NOW,
    );

    expect(feature.color).toBe('#ef6c00');
  });

  it('paints a block worked yesterday green', () => {
    const [feature] = blockMapFeatures(
      [makeTerritory({ blocks: [makeBlock({ lastWorkedAt: daysAgo(1) })] })],
      NOW,
    );

    expect(feature.color).toBe('#2e7d32');
  });

  it('uses the rotation of the territory that owns the block', () => {
    const block = makeBlock({ lastWorkedAt: daysAgo(150) });

    const [slow] = blockMapFeatures(
      [makeTerritory({ rotationDays: 365, blocks: [block] })],
      NOW,
    );
    const [fast] = blockMapFeatures(
      [makeTerritory({ rotationDays: 120, blocks: [block] })],
      NOW,
    );

    expect(slow.color).toBe('#2e7d32');
    expect(fast.color).toBe('#ef6c00');
  });

  it('lets a forced status win over the date', () => {
    const [feature] = blockMapFeatures(
      [
        makeTerritory({
          blocks: [
            makeBlock({ lastWorkedAt: daysAgo(1), statusOverride: 'never' }),
          ],
        }),
      ],
      NOW,
    );

    expect(feature.color).toBe('#c62828');
  });

  it('labels the block with its number', () => {
    const [feature] = blockMapFeatures(
      [makeTerritory({ blocks: [makeBlock({ number: 7 })] })],
      NOW,
    );

    expect(feature.label).toBe('7');
  });

  it('closes the ring, keeps longitude first and centres the label', () => {
    const [feature] = blockMapFeatures(
      [makeTerritory({ blocks: [makeBlock()] })],
      NOW,
    );

    expect(feature.ring).toHaveLength(SQUARE.length + 1);
    expect(feature.ring[0]).toEqual([-46.6, -23.5]);
    expect(feature.ring[feature.ring.length - 1]).toEqual(feature.ring[0]);
    expect(feature.center).toEqual({ lat: -23.4, lng: -46.5 });
  });

  it('skips a block whose polygon is not a polygon, keeping its siblings', () => {
    const features = blockMapFeatures(
      [
        makeTerritory({
          blocks: [
            makeBlock({ id: 'b1', polygon: [] }),
            makeBlock({
              id: 'b2',
              polygon: [
                { lat: -23.5, lng: -46.6 },
                { lat: -23.4, lng: -46.5 },
              ],
            }),
            makeBlock({ id: 'b3' }),
          ],
        }),
      ],
      NOW,
    );

    expect(features.map(feature => feature.block.id)).toEqual(['b3']);
  });

  it('draws nothing for a territory without blocks, nor for no territories', () => {
    expect(blockMapFeatures([makeTerritory({ blocks: [] })], NOW)).toEqual([]);
    expect(blockMapFeatures([], NOW)).toEqual([]);
  });
});

describe('territoriesBounds', () => {
  it('frames every boundary point as [west, south, east, north]', () => {
    const bounds = territoriesBounds([
      makeTerritory({ id: 't1' }),
      makeTerritory({
        id: 't2',
        boundary: [
          { lat: -23.9, lng: -46.9 },
          { lat: -23.9, lng: -46.8 },
          { lat: -23.8, lng: -46.8 },
        ],
      }),
    ]);

    expect(bounds).toEqual([-46.9, -23.9, -46.4, -23.3]);
  });

  it('has no bounds when there is nothing to frame', () => {
    expect(territoriesBounds([])).toBeNull();
    expect(territoriesBounds([makeTerritory({ boundary: [] })])).toBeNull();
  });
});
