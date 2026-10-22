// The Campanhas page (spec 0017, Task 06). `window.api` is a fake stubbed
// with `vi.stubGlobal`, the convention every screen test in this folder
// follows, and the Leaflet map is replaced by buttons -- jsdom has no layout
// for it, and the screen only depends on what it hands the map.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IpcApi } from '../../shared/ipc-contract'
import type { Campaign, Publisher, Territory } from '../../shared/models'
import { CampaignsScreen } from './CampaignsScreen'

vi.mock('../map/AssignmentsMap', () => ({
  AssignmentsMap: ({
    territories,
    onTerritoryTap
  }: {
    territories: Territory[]
    onTerritoryTap?: (territory: Territory) => void
  }) => (
    <div data-testid="fake-assignments-map">
      {territories.map((territory) => (
        <button key={territory.id} onClick={() => onTerritoryTap?.(territory)}>
          {`Mapa ${territory.name}`}
        </button>
      ))}
    </div>
  )
}))

const RING = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 1 },
  { lat: 1, lng: 1 }
]

const N3: Territory = {
  id: 't3',
  name: 'Centro - N3',
  boundary: RING,
  blocks: [],
  assignedUser: { id: 'carlos', name: 'Carlos' },
  assignedSince: new Date('2026-08-01T12:00:00Z')
}
const N5: Territory = { id: 't5', name: 'Vila - N5', boundary: RING, blocks: [] }
const N8: Territory = {
  id: 't8',
  name: 'Lago - N8',
  boundary: RING,
  blocks: [],
  campaign: { id: 'visitas', name: 'Visitas' }
}

const PUBLISHERS: Publisher[] = [
  { id: 'ana', name: 'Ana', isActive: true },
  { id: 'bruno', name: 'Bruno', isActive: true }
]

const CELEBRATION: Campaign = {
  id: 'celebracao',
  name: 'Celebração',
  createdAt: new Date('2026-10-01T12:00:00Z'),
  territories: [
    { id: 't3', name: 'Centro - N3' },
    { id: 't5', name: 'Vila - N5' }
  ],
  designations: []
}

const VISITS_PERIOD = {
  id: 'period-1',
  startedAt: new Date('2026-10-05T12:00:00Z'),
  publishers: [{ id: 'bruno', name: 'Bruno' }]
}
const VISITS: Campaign = {
  id: 'visitas',
  name: 'Visitas',
  createdAt: new Date('2026-10-02T12:00:00Z'),
  territories: [{ id: 't8', name: 'Lago - N8' }],
  currentDesignation: VISITS_PERIOD,
  designations: [VISITS_PERIOD]
}

/** Only the namespaces this screen calls; the rest of `IpcApi` is never reached. */
function makeApi(campaigns: Partial<IpcApi['campaigns']> = {}): IpcApi {
  return {
    territories: { listWithBlocks: vi.fn().mockResolvedValue([N3, N5, N8]) },
    publishers: { list: vi.fn().mockResolvedValue(PUBLISHERS) },
    campaigns: {
      list: vi.fn().mockResolvedValue([CELEBRATION, VISITS]),
      create: vi.fn().mockResolvedValue(CELEBRATION),
      update: vi.fn().mockResolvedValue(CELEBRATION),
      delete: vi.fn().mockResolvedValue(undefined),
      designate: vi.fn().mockResolvedValue(CELEBRATION),
      setPublishers: vi.fn().mockResolvedValue(VISITS),
      complete: vi.fn().mockResolvedValue(VISITS),
      ...campaigns
    }
  } as unknown as IpcApi
}

/** A serialized IPC error, the shape `main/ipc-handlers.ts` throws across the bridge. */
function ipcError(code: string, statusCode: number, message: string): Error {
  return new Error(JSON.stringify({ name: 'ApiErrorException', message, code, statusCode }))
}

async function openCampaign(name: string): Promise<HTMLElement> {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: new RegExp(name) }))
  return screen.getByRole('region', { name: `Campanha ${name}` })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CampaignsScreen', () => {
  it('creates a campaign from the searchable list, with a territory of another active campaign disabled', async () => {
    const api = makeApi()
    vi.stubGlobal('api', api)
    const user = userEvent.setup()
    render(<CampaignsScreen />)

    await user.click(await screen.findByRole('button', { name: 'Nova campanha' }))
    const dialog = screen.getByRole('dialog', { name: 'Nova campanha' })
    await user.type(within(dialog).getByLabelText('Nome da campanha'), 'Pregação especial')

    const taken = within(dialog).getByRole('checkbox', { name: /Lago - N8/ })
    expect(taken).toBeDisabled()
    expect(within(dialog).getByText('Na campanha "Visitas"')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Buscar territórios'), 'vila')
    expect(within(dialog).queryByRole('checkbox', { name: /Centro - N3/ })).toBeNull()
    await user.click(within(dialog).getByRole('checkbox', { name: /Vila - N5/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Criar campanha' }))

    expect(api.campaigns.create).toHaveBeenCalledWith({
      name: 'Pregação especial',
      territoryIds: ['t5']
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('designating warns, before confirming, which dirigente each territory loses', async () => {
    const api = makeApi()
    vi.stubGlobal('api', api)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<CampaignsScreen />)

    const detail = await openCampaign('Celebração')
    await user.click(within(detail).getByRole('button', { name: 'Designar…' }))
    const dialog = screen.getByRole('dialog', { name: 'Designar "Celebração"' })
    const submit = within(dialog).getByRole('button', { name: 'Designar' })
    expect(submit).toBeDisabled()

    await user.click(within(dialog).getByRole('checkbox', { name: 'Ana' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Bruno' }))
    await user.click(submit)

    const message = confirm.mock.calls[0]?.[0] as string
    expect(message).toContain('• Centro - N3 — Carlos')
    expect(message).not.toContain('Vila - N5')
    expect(api.campaigns.designate).toHaveBeenCalledWith('celebracao', ['ana', 'bruno'])
  })

  it('completing says the territories lose their dirigente and the publishers lose marking', async () => {
    const api = makeApi()
    vi.stubGlobal('api', api)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true)
    const user = userEvent.setup()
    render(<CampaignsScreen />)

    const detail = await openCampaign('Visitas')
    const completeButton = within(detail).getByRole('button', { name: 'Marcar como concluída' })

    await user.click(completeButton)
    expect(api.campaigns.complete).not.toHaveBeenCalled()

    await user.click(completeButton)
    const message = confirm.mock.calls[0]?.[0] as string
    expect(message).toContain('fica sem dirigente')
    expect(message).toContain('Bruno perde na hora o acesso para marcar quadras')
    expect(api.campaigns.complete).toHaveBeenCalledWith('visitas')
  })

  it('deleting an active campaign shows the refusal the server sends', async () => {
    const api = makeApi({
      delete: vi
        .fn()
        .mockRejectedValue(
          ipcError('campaign_active', 409, 'Conclua a campanha "Visitas" antes de apagá-la.')
        )
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()
    render(<CampaignsScreen />)

    const detail = await openCampaign('Visitas')
    await user.click(within(detail).getByRole('button', { name: 'Apagar' }))

    expect(await within(detail).findByRole('alert')).toHaveTextContent(
      'Conclua a campanha "Visitas" antes de apagá-la.'
    )
    expect(screen.getByRole('region', { name: 'Campanha Visitas' })).toBeInTheDocument()
  })
})
