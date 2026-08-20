// `models.ts` is types plus the shapes the API parser fills in, so what there
// is to assert here is that a value of each shape can carry the fields the
// rest of the app reads off it -- the same thing
// `admin/src/shared/models.test.ts` asserts on its side of the monorepo.
import type { Territory } from './models';

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
