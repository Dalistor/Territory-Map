import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { ApiClient } from '../../data/api-client'
import type { Campaign, Session, Territory, WorkedTerritory } from '../../domain/models'
import { formatDate } from '../../domain/lastWorked'
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
        onOpenCampaign={jest.fn()}
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
      <DashboardScreen session={makeSession()} apiClient={apiClient} onOpenMap={jest.fn()} onOpenCampaign={jest.fn()} onOpenFullMap={jest.fn()} />
    )

    await waitFor(
      () => {
        expect(screen.getByText('Setor 3')).toBeTruthy()
      },
      { timeout: 3000 }
    )
    expect(screen.getByText(formatDate(lastWorkedAt))).toBeTruthy()
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
        onOpenCampaign={jest.fn()}
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
      <DashboardScreen session={makeSession()} apiClient={apiClient} onOpenMap={jest.fn()} onOpenCampaign={jest.fn()} onOpenFullMap={jest.fn()} />
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
      <DashboardScreen session={makeSession()} apiClient={makeApiClient()} onOpenMap={jest.fn()} onOpenCampaign={jest.fn()} onOpenFullMap={jest.fn()} />
    )

    await waitFor(
      () => {
        expect(screen.getByText('Nenhuma quadra trabalhada ainda')).toBeTruthy()
      },
      { timeout: 3000 }
    )
  })

  it('names the publisher and congregation, and counts each section in words', async () => {
    const session = makeSession({ user: { id: 'user-1', name: 'Ana' } })
    const assigned = makeTerritory({ assignedUser: { id: 'user-1', name: 'Ana' } })
    const apiClient = makeApiClient({
      listTerritories: jest.fn().mockResolvedValue([assigned]),
      listWorkedTerritories: jest.fn().mockResolvedValue([makeWorkedTerritory()]),
    })

    render(
      <DashboardScreen session={session} apiClient={apiClient} onOpenMap={jest.fn()} onOpenCampaign={jest.fn()} onOpenFullMap={jest.fn()} />
    )

    await waitFor(
      () => {
        expect(screen.getByText('Ana · Congregação Central, São Paulo')).toBeTruthy()
        expect(screen.getAllByText('1 território')).toHaveLength(2)
      },
      { timeout: 3000 }
    )
  })

  it('switches to the Histórico tab and displays detailed work history logs', async () => {
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
      <DashboardScreen session={session} apiClient={apiClient} onOpenMap={jest.fn()} onOpenCampaign={jest.fn()} onOpenFullMap={jest.fn()} />
    )

    await waitFor(
      () => {
        expect(screen.getByText('Início')).toBeTruthy()
      },
      { timeout: 3000 }
    )

    fireEvent.press(screen.getByText('Histórico'))

    await waitFor(
      () => {
        expect(screen.getByText('Q5')).toBeTruthy()
        expect(screen.getByText('Setor 5')).toBeTruthy()
      },
      { timeout: 3000 }
    )
  })

  describe('Campanhas tab', () => {
    const celebration: Campaign = {
      id: 'campaign-1',
      name: 'Campanha de Celebração',
      startedAt: new Date(2026, 9, 1, 9, 0),
      territoryIds: ['territory-3', 'territory-5', 'territory-8']
    }

    async function renderWithCampaigns(campaigns: Campaign[], onOpenCampaign = jest.fn()) {
      const apiClient = {
        ...makeApiClient({
          listTerritories: jest
            .fn()
            .mockResolvedValue([
              makeTerritory({ id: 'territory-3', name: 'Centro - N3' }),
              makeTerritory({ id: 'territory-5', name: 'Vila Nova - N5' }),
              makeTerritory({ id: 'territory-8', name: 'Jardim - N8' })
            ])
        }),
        listCampaigns: jest.fn().mockResolvedValue(campaigns)
      }
      await render(
        <DashboardScreen
          session={makeSession()}
          apiClient={apiClient}
          onOpenMap={jest.fn()}
          onOpenCampaign={onOpenCampaign}
          onOpenFullMap={jest.fn()}
        />
      )
      await fireEvent.press(screen.getByText('Campanhas'))
    }

    it('lists each active campaign with its territory count, territory names and start date', async () => {
      await renderWithCampaigns([celebration])

      expect(await screen.findByText('Campanha de Celebração')).toBeTruthy()
      expect(screen.getByText('3 territórios · desde 01/10/2026')).toBeTruthy()
      expect(screen.getByText('Centro - N3, Vila Nova - N5, Jardim - N8')).toBeTruthy()
    })

    it('explains what a campaign is when the publisher is in none', async () => {
      await renderWithCampaigns([])

      expect(await screen.findByText('Você não está em nenhuma campanha agora')).toBeTruthy()
      expect(screen.getByText(/designa um grupo de territórios a vários publicadores/)).toBeTruthy()
    })

    it('opens the campaign on the map', async () => {
      const onOpenCampaign = jest.fn()
      await renderWithCampaigns([celebration], onOpenCampaign)

      await fireEvent.press(await screen.findByLabelText('Ver Campanha de Celebração no mapa'))

      expect(onOpenCampaign).toHaveBeenCalledWith(celebration)
    })
  })
})
