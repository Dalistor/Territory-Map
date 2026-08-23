import type { Territory } from '../../domain/models'
import { defaultFilter, searchTerritories, visibleTerritories } from './territoryFilter'

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'territory-1',
    name: 'Setor 3',
    boundary: [],
    blocks: [],
    ...overrides
  }
}

describe('visibleTerritories', () => {
  it("in 'assigned' mode, returns only the territories assigned to the given user", () => {
    const mine = makeTerritory({ id: 'territory-1', assignedUser: { id: 'user-1', name: 'Maria' } })
    const someoneElses = makeTerritory({
      id: 'territory-2',
      assignedUser: { id: 'user-2', name: 'João' }
    })
    const unassigned = makeTerritory({ id: 'territory-3', assignedUser: undefined })

    const result = visibleTerritories(
      [mine, someoneElses, unassigned],
      { mode: 'assigned' },
      'user-1'
    )

    expect(result).toEqual([mine])
  })

  it("in 'all' mode, returns every territory unfiltered", () => {
    const territories = [
      makeTerritory({ id: 'territory-1', assignedUser: { id: 'user-1', name: 'Maria' } }),
      makeTerritory({ id: 'territory-2' })
    ]

    const result = visibleTerritories(territories, { mode: 'all' }, 'user-1')

    expect(result).toEqual(territories)
  })

  it("in 'specific' mode, returns only the territory whose id matches territoryId", () => {
    const target = makeTerritory({ id: 'territory-2' })
    const territories = [makeTerritory({ id: 'territory-1' }), target]

    const result = visibleTerritories(
      territories,
      { mode: 'specific', territoryId: 'territory-2' },
      'user-1'
    )

    expect(result).toEqual([target])
  })

  it("in 'specific' mode, returns an empty list when territoryId matches nothing", () => {
    const territories = [makeTerritory({ id: 'territory-1' }), makeTerritory({ id: 'territory-2' })]

    const result = visibleTerritories(
      territories,
      { mode: 'specific', territoryId: 'territory-unknown' },
      'user-1'
    )

    expect(result).toEqual([])
  })
})

describe('defaultFilter', () => {
  it("is {mode: 'assigned'} when at least one territory is assigned to the publisher", () => {
    const territories = [
      makeTerritory({ id: 'territory-1', assignedUser: { id: 'user-1', name: 'Maria' } }),
      makeTerritory({ id: 'territory-2' })
    ]

    expect(defaultFilter(territories, 'user-1')).toEqual({ mode: 'assigned' })
  })

  it("is {mode: 'all'} when no territory is assigned to the publisher", () => {
    const territories = [
      makeTerritory({ id: 'territory-1' }),
      makeTerritory({ id: 'territory-2', assignedUser: { id: 'user-2', name: 'João' } })
    ]

    expect(defaultFilter(territories, 'user-1')).toEqual({ mode: 'all' })
  })

  it("is {mode: 'all'} for an empty territory list", () => {
    expect(defaultFilter([], 'user-1')).toEqual({ mode: 'all' })
  })
})

describe('searchTerritories', () => {
  const santaHelena7 = makeTerritory({ id: 'territory-1', name: 'Santa Helena - N 7' })
  const vilaGuarani = makeTerritory({ id: 'territory-2', name: 'Vila Guarani - N14' })
  const centro = makeTerritory({ id: 'territory-3', name: 'Próximo ao centro - N12' })
  const all = [santaHelena7, vilaGuarani, centro]

  it('returns every territory for an empty or blank query', () => {
    expect(searchTerritories(all, '')).toEqual(all)
    expect(searchTerritories(all, '   ')).toEqual(all)
  })

  it('matches any part of the name, not just its start', () => {
    expect(searchTerritories(all, 'helena')).toEqual([santaHelena7])
    expect(searchTerritories(all, 'N14')).toEqual([vilaGuarani])
  })

  it('ignores case', () => {
    expect(searchTerritories(all, 'SANTA')).toEqual([santaHelena7])
  })

  it('ignores accents, in both the query and the name', () => {
    // The publisher types on a phone keyboard, in the field, often in a
    // hurry -- "proximo" has to find "Próximo".
    expect(searchTerritories(all, 'proximo')).toEqual([centro])
    expect(searchTerritories(all, 'PRÓXIMO')).toEqual([centro])
  })

  it('ignores surrounding whitespace in the query', () => {
    expect(searchTerritories(all, '  guarani  ')).toEqual([vilaGuarani])
  })

  it('returns an empty list when nothing matches', () => {
    expect(searchTerritories(all, 'jardim')).toEqual([])
  })

  it('ignores spaces and punctuation, so "n7" finds "N 7"', () => {
    // The publisher reads "Santa Helena - N 7" off a paper card and types
    // what they see without the spacing.
    expect(searchTerritories(all, 'n7')).toEqual([santaHelena7])
    expect(searchTerritories(all, 'santahelena')).toEqual([santaHelena7])
  })

  it('matches letters typed in order even with gaps', () => {
    // "sthelena" is "Santa Helena" typed in a hurry; nothing else in the
    // list has those letters in that order.
    expect(searchTerritories(all, 'sthelena')).toEqual([santaHelena7])
  })

  it('puts the closer match first instead of dropping the looser ones', () => {
    const santaHelena8 = makeTerritory({ id: 'territory-4', name: 'Santa Helena - N 8' })
    const sitioAntigo = makeTerritory({ id: 'territory-5', name: 'Sitio Antigo' })

    // "sant" is contained in "Santa Helena" and only scattered through
    // "Sitio Antigo" -- both are offered, the literal one first.
    const result = searchTerritories([sitioAntigo, santaHelena8], 'sant')

    expect(result).toEqual([santaHelena8, sitioAntigo])
  })

  it('keeps the original order between equally good matches', () => {
    const santaHelena8 = makeTerritory({ id: 'territory-4', name: 'Santa Helena - N 8' });

    expect(searchTerritories([santaHelena7, santaHelena8], 'santa helena')).toEqual([
      santaHelena7,
      santaHelena8,
    ]);
  });

  it('finds territories containing a queried block number', () => {
    const withBlock4 = makeTerritory({
      id: 'territory-block4',
      name: 'Vila Nova',
      blocks: [{ id: 'b-4', number: 4, polygon: [] }],
    });
    const withBlock10 = makeTerritory({
      id: 'territory-block10',
      name: 'Jardim Primavera',
      blocks: [{ id: 'b-10', number: 10, polygon: [] }],
    });

    expect(searchTerritories([withBlock4, withBlock10], '4')).toEqual([withBlock4]);
    expect(searchTerritories([withBlock4, withBlock10], 'quadra 4')).toEqual([withBlock4]);
    expect(searchTerritories([withBlock4, withBlock10], 'q10')).toEqual([withBlock10]);
  });
});
