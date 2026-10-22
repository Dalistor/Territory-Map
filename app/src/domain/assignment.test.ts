import type { Campaign, Territory } from './models'
import { canMarkBlocksOf, isTerritoryAssignedToMe } from './assignment'

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

describe('canMarkBlocksOf', () => {
  const celebration: Campaign = {
    id: 'campaign-1',
    name: 'Campanha de Celebração',
    startedAt: new Date('2026-10-01T12:00:00Z'),
    territoryIds: ['territory-3', 'territory-5']
  }

  it('is true for a territory designated to the publisher individually, with no campaign at all', () => {
    const territory = makeTerritory({ assignedUser: { id: 'user-1', name: 'Maria' } })

    expect(canMarkBlocksOf(territory, 'user-1', [])).toBe(true)
  })

  it('is true for a territory of one of the publisher\'s active campaigns, which has no dirigente', () => {
    // While a campaign holds a territory the server sends `assigned_user: null`:
    // the campaign list is the only thing that can open it.
    const territory = makeTerritory({
      id: 'territory-5',
      assignedUser: undefined,
      campaign: { id: 'campaign-1', name: 'Campanha de Celebração' }
    })

    expect(canMarkBlocksOf(territory, 'user-1', [celebration])).toBe(true)
  })

  it('is false for a territory held by a campaign the publisher is not designated to', () => {
    // `GET /app/campaigns` only lists the publisher's own campaigns, so a
    // territory naming some other campaign must stay read-only -- the server
    // answers 403 there.
    const territory = makeTerritory({
      id: 'territory-8',
      campaign: { id: 'campaign-2', name: 'Outra campanha' }
    })

    expect(canMarkBlocksOf(territory, 'user-1', [celebration])).toBe(false)
  })

  it('is false for a territory designated to someone else and outside every campaign of the publisher', () => {
    const territory = makeTerritory({
      id: 'territory-9',
      assignedUser: { id: 'user-2', name: 'João' }
    })

    expect(canMarkBlocksOf(territory, 'user-1', [celebration])).toBe(false)
  })
})
