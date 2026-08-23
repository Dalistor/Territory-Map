import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { ApiClient } from '../../data/api-client'
import type { Session, Territory, WorkedTerritory } from '../../domain/models'
import { DashboardScreen } from './DashboardScreen'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    token: 'app-token',
    user: { id: 'user-1', name: 'Ana' },
    congregation: { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' },
    ...overrides
  }
}

function makeWorkedTerritory(overrides: Partial<WorkedTerritory> = {}): WorkedTerritory {
  return {
    id: 'territory-1',
    name: 'Setor 3',
    lastWorkedAt: new Date('2026-08-10T12:00:00Z'),
    ...overrides
  }
}

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'territory-1',
    name: 'Setor 3',
    boundary: [],
    blocks: [],
    ...overrides
  }
}

/** A fake covering only the two `ApiClient` methods this screen calls. */
function makeApiClient(
  overrides: Partial<Pick<ApiClient, 'listWorkedTerritories' | 'listTerritories'>> = {}
): Pick<ApiClient, 'listWorkedTerritories' | 'listTerritories'> {
  return {
    listWorkedTerritories: jest.fn().mockResolvedValue([]),
    listTerritories: jest.fn().mockResolvedValue([]),
    ...overrides
  }
}

describe('DashboardScreen', () => {
  it('always offers "Abrir mapa", even with no assigned territory, and it opens the full map', async () => {
    const onOpenFullMap = jest.fn()

    render(
      <DashboardScreen
        session={makeSession()}
        apiClient={makeApiClient()}
        onOpenMap={jest.fn()}
        onOpenFullMap={onOpenFullMap}
      />
    )

    await waitFor(
      () => {
        expect(screen.getByText('Nenhuma quadra trabalhada ainda')).toBeTruthy()
      },
      { timeout: 3000 }
    )

    fireEvent.press(screen.getByText('Abrir mapa'))

    expect(onOpenFullMap).toHaveBeenCalled()
  })

  it('shows worked territories with their name and most recent date', async () => {
    const lastWorkedAt = new Date('2026-08-10T12:00:00Z')
    const apiClient = makeApiClient({
      listWorkedTerritories: jest
        .fn()
        .mockResolvedValue([makeWorkedTerritory({ name: 'Setor 3', lastWorkedAt })])
    })

    render(
      <DashboardScreen session={makeSession()} apiClient={apiClient} onOpenMap={jest.fn()} onOpenFullMap={jest.fn()} />
    )

    await waitFor(
      () => {
        expect(screen.getByText('Setor 3')).toBeTruthy()
      },
      { timeout: 3000 }
    )
    expect(screen.getByText(lastWorkedAt.toLocaleDateString())).toBeTruthy()
  })

  it('lists each territory assigned to the logged-in publisher, with a working "Ver no mapa" button', async () => {
    const session = makeSession({ user: { id: 'user-1', name: 'Ana' } })
    const assignedTerritory = makeTerritory({
      id: 'territory-assigned',
      name: 'Setor 7',
      assignedUser: { id: 'user-1', name: 'Ana' }
    })
    const someoneElsesTerritory = makeTerritory({
      id: 'territory-other',
      name: 'Setor 8',
      assignedUser: { id: 'user-2', name: 'João' }
    })
    const apiClient = makeApiClient({
      listTerritories: jest.fn().mockResolvedValue([assignedTerritory, someoneElsesTerritory])
    })
    const onOpenMap = jest.fn()

    render(
      <DashboardScreen
        session={session}
        apiClient={apiClient}
        onOpenMap={onOpenMap}
        onOpenFullMap={jest.fn()}
      />
    )

    await waitFor(
      () => {
        expect(screen.getByText('Setor 7')).toBeTruthy()
      },
      { timeout: 3000 }
    )
    expect(screen.queryByText('Setor 8')).toBeNull()

    fireEvent.press(screen.getByText('Ver no mapa'))

    expect(onOpenMap).toHaveBeenCalledWith(assignedTerritory)
  })

  it('explains there is no assigned territory instead of showing an empty list', async () => {
    const apiClient = makeApiClient({
      listTerritories: jest
        .fn()
        .mockResolvedValue([makeTerritory({ assignedUser: { id: 'user-2', name: 'João' } })])
    })

    render(
      <DashboardScreen session={makeSession()} apiClient={apiClient} onOpenMap={jest.fn()} onOpenFullMap={jest.fn()} />
    )

    await waitFor(
      () => {
        expect(
          screen.getByText(
            'Nenhum território designado no momento — fale com quem cuida dos territórios na congregação'
          )
        ).toBeTruthy()
      },
      { timeout: 3000 }
    )
  })

  it('shows "Nenhuma quadra trabalhada ainda" instead of an empty list when nothing was worked yet', async () => {
    render(
      <DashboardScreen session={makeSession()} apiClient={makeApiClient()} onOpenMap={jest.fn()} onOpenFullMap={jest.fn()} />
    )

    await waitFor(
      () => {
        expect(screen.getByText('Nenhuma quadra trabalhada ainda')).toBeTruthy()
      },
      { timeout: 3000 }
    )
  })

  it('displays publisher greeting and stats in the hero card', async () => {
    const session = makeSession({ user: { id: 'user-1', name: 'Ana' } })
    const assigned = makeTerritory({ assignedUser: { id: 'user-1', name: 'Ana' } })
    const apiClient = makeApiClient({
      listTerritories: jest.fn().mockResolvedValue([assigned]),
      listWorkedTerritories: jest.fn().mockResolvedValue([makeWorkedTerritory()]),
    })

    render(
      <DashboardScreen session={session} apiClient={apiClient} onOpenMap={jest.fn()} onOpenFullMap={jest.fn()} />
    )

    await waitFor(
      () => {
        expect(screen.getByText('Olá, Ana')).toBeTruthy()
      },
      { timeout: 3000 }
    )
  })

  it('switches to Histórico de Trabalho tab and displays detailed work history logs', async () => {
    const session = makeSession({ user: { id: 'user-1', name: 'Ana' } })
    const workedAt = new Date('2026-08-15T14:30:00Z')
    const workHistory = [
      {
        id: 'log-1',
        blockId: 'b-1',
        blockNumber: 5,
        territoryId: 't-1',
        territoryName: 'Setor 5',
        workedAt,
      },
    ]
    const apiClient = {
      ...makeApiClient(),
      listWorkHistory: jest.fn().mockResolvedValue(workHistory),
    }

    render(
      <DashboardScreen session={session} apiClient={apiClient} onOpenMap={jest.fn()} onOpenFullMap={jest.fn()} />
    )

    await waitFor(
      () => {
        expect(screen.getByText('Meus Territórios')).toBeTruthy()
      },
      { timeout: 3000 }
    )

    fireEvent.press(screen.getByText('Histórico de Trabalho'))

    await waitFor(
      () => {
        expect(screen.getByText('Q5')).toBeTruthy()
        expect(screen.getByText('Setor 5')).toBeTruthy()
        expect(screen.getByText('✓ Feito')).toBeTruthy()
      },
      { timeout: 3000 }
    )
  })
})
