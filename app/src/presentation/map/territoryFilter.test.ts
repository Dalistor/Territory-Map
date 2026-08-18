import type { Territory } from '../../domain/models'
import { defaultFilter, visibleTerritories } from './territoryFilter'

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
