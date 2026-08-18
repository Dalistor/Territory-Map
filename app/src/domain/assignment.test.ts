import type { Territory } from './models'
import { isTerritoryAssignedToMe } from './assignment'

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'territory-1',
    name: 'Setor 3',
    boundary: [],
    blocks: [],
    ...overrides
  }
}

describe('isTerritoryAssignedToMe', () => {
  it('is true when the assigned user id matches the given user id', () => {
    const territory = makeTerritory({
      assignedUser: { id: 'user-1', name: 'Maria' }
    })

    expect(isTerritoryAssignedToMe(territory, 'user-1')).toBe(true)
  })

  it('is false when the territory has no assigned user', () => {
    const territory = makeTerritory({ assignedUser: undefined })

    expect(isTerritoryAssignedToMe(territory, 'user-1')).toBe(false)
  })

  it('is false when the assigned user is someone else', () => {
    const territory = makeTerritory({
      assignedUser: { id: 'user-2', name: 'João' }
    })

    expect(isTerritoryAssignedToMe(territory, 'user-1')).toBe(false)
  })
})
