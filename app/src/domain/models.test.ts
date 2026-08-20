// `models.ts` is types plus the shapes the API parser fills in, so what there
// is to assert here is that a value of each shape can carry the fields the
// rest of the app reads off it -- the same thing
// `admin/src/shared/models.test.ts` asserts on its side of the monorepo.
import type { Block, BlockStatusOverride, Territory } from './models';

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    number: 12,
    polygon: [],
    ...overrides,
  };
}

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'territory-1',
    name: 'Centro - N5',
    boundary: [],
    blocks: [],
    ...overrides,
  };
}

describe('Territory rotation', () => {
  it('carries the rotation the admin configured, in days', () => {
    const territory = makeTerritory({ rotationDays: 60 });

    expect(territory.rotationDays).toBe(60);
  });

  it('leaves rotationDays undefined when the territory uses the default rotation', () => {
    const territory = makeTerritory();

    expect(territory.rotationDays).toBeUndefined();
  });
});

describe('Block status override', () => {
  it('carries the status the admin forced for the block', () => {
    const block = makeBlock({ statusOverride: 'overdue' });

    expect(block.statusOverride).toBe('overdue');
  });

  it('leaves statusOverride undefined when the status derives from the work records', () => {
    const block = makeBlock();

    expect(block.statusOverride).toBeUndefined();
  });

  it('names both forced statuses, and no third one for "recent"', () => {
    const forced: BlockStatusOverride[] = ['overdue', 'never'];

    expect(
      forced.map((status) => makeBlock({ statusOverride: status }).statusOverride),
    ).toEqual(['overdue', 'never']);
  });
});
