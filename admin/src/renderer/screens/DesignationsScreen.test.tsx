// The Designations page (spec 0006, Task 03). `window.api` is never the real
// IPC bridge here -- a fake stubbed with `vi.stubGlobal` stands in, per the
// convention every other screen test in this folder follows.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IpcApi } from '../../shared/ipc-contract'
import type { Publisher, Territory } from '../../shared/models'
import { DesignationsScreen } from './DesignationsScreen'

// The real AssignmentsMap pulls in react-leaflet, which needs a real DOM
// layout jsdom does not provide. This screen's own job -- the summary, the
// load/error handling, the assign dialog -- only depends on the
// `onTerritoryTap` callback the map receives, so the stub renders one button
// per territory to let a test simulate a tap without a Leaflet layout.
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
          {`Território ${territory.name}`}
        </button>
      ))}
    </div>
  )
}))

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'territory-1',
    name: 'Centro',
    boundary: [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 }
    ],
    blocks: [],
    ...overrides
  }
}

function makePublisher(overrides: Partial<Publisher> = {}): Publisher {
  return {
    id: 'publisher-1',
    name: 'Ana',
    isActive: true,
    ...overrides
  }
}

function makeApi(overrides: Partial<IpcApi> = {}): IpcApi {
  return {
    session: {
      isConfigured: vi.fn(),
      configure: vi.fn(),
      signOut: vi.fn(),
      getCongregation: vi.fn(),
      ...overrides.session
    },
    territories: {
      listWithBlocks: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      assign: vi.fn(),
      ...overrides.territories
    },
    blocks: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      ...overrides.blocks
    },
    publishers: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      regenerateCode: vi.fn(),
      setActive: vi.fn(),
      ...overrides.publishers
    },
    workLogs: {
      listFor: vi.fn(),
      delete: vi.fn(),
      ...overrides.workLogs
    },
    geo: {
      geocodeCity: vi.fn(),
      ...overrides.geo
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DesignationsScreen loading and summary', () => {
  it('shows the assignment count in the summary and hands every territory to the map', async () => {
    const assigned = makeTerritory({
      id: 't1',
      name: 'Centro',
      assignedUser: { id: 'p1', name: 'Ana' }
    })
    const unassigned = makeTerritory({ id: 't2', name: 'Bairro Sul' })
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([assigned, unassigned]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<DesignationsScreen />)

    expect(await screen.findByText('1 de 2 territórios designados')).toBeInTheDocument()
    const map = screen.getByTestId('fake-assignments-map')
    expect(within(map).getByRole('button', { name: 'Território Centro' })).toBeInTheDocument()
    expect(within(map).getByRole('button', { name: 'Território Bairro Sul' })).toBeInTheDocument()
  })

  it('shows the load failure as an alert, and "Recarregar" retries the fetch', async () => {
    const territory = makeTerritory({ name: 'Centro' })
    const listWithBlocks = vi
      .fn()
      .mockRejectedValueOnce(new Error('Falha de rede.'))
      .mockResolvedValueOnce([territory])
    const api = makeApi({
      territories: {
        listWithBlocks,
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<DesignationsScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de rede.')

    await user.click(screen.getByRole('button', { name: /recarregar/i }))

    expect(await screen.findByText('0 de 1 territórios designados')).toBeInTheDocument()
    expect(listWithBlocks).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a visible error message when a reload fails', async () => {
    const listWithBlocks = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Falha ao recarregar.'))
    const api = makeApi({
      territories: {
        listWithBlocks,
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<DesignationsScreen />)
    await waitFor(() => expect(listWithBlocks).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: /recarregar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao recarregar.')
  })
})

describe('DesignationsScreen assigning a territory to a publisher', () => {
  it('tapping a territory opens the dialog pre-selected on the current leader; confirming assigns and reloads', async () => {
    const territory = makeTerritory({
      name: 'Centro',
      assignedUser: { id: 'p1', name: 'Ana' }
    })
    const reassigned = { ...territory, assignedUser: { id: 'p2', name: 'Bia' } }
    const listWithBlocks = vi
      .fn()
      .mockResolvedValueOnce([territory])
      .mockResolvedValueOnce([reassigned])
    const assign = vi.fn().mockResolvedValue(reassigned)
    const ana = makePublisher({ id: 'p1', name: 'Ana' })
    const bia = makePublisher({ id: 'p2', name: 'Bia' })
    const api = makeApi({
      territories: {
        listWithBlocks,
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign
      },
      publishers: {
        list: vi.fn().mockResolvedValue([ana, bia]),
        create: vi.fn(),
        regenerateCode: vi.fn(),
        setActive: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<DesignationsScreen />)
    await user.click(await screen.findByRole('button', { name: 'Território Centro' }))

    const dialog = await screen.findByRole('dialog', { name: /atribuir publicador a centro/i })
    expect(within(dialog).getByRole('radio', { name: 'Nenhum' })).not.toBeChecked()
    expect(await within(dialog).findByRole('radio', { name: 'Ana' })).toBeChecked()

    await user.click(within(dialog).getByRole('radio', { name: 'Bia' }))
    await user.click(within(dialog).getByRole('button', { name: /^atribuir$/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('territory-1', 'p2'))
    await waitFor(() => expect(listWithBlocks).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('1 de 1 territórios designados')).toBeInTheDocument()
  })

  it('choosing "Nenhum" confirms the removal: calls assign with null', async () => {
    const territory = makeTerritory({
      name: 'Centro',
      assignedUser: { id: 'p1', name: 'Ana' }
    })
    const unassigned = { ...territory, assignedUser: undefined }
    const listWithBlocks = vi
      .fn()
      .mockResolvedValueOnce([territory])
      .mockResolvedValueOnce([unassigned])
    const assign = vi.fn().mockResolvedValue(unassigned)
    const api = makeApi({
      territories: {
        listWithBlocks,
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign
      },
      publishers: {
        list: vi.fn().mockResolvedValue([makePublisher({ id: 'p1', name: 'Ana' })]),
        create: vi.fn(),
        regenerateCode: vi.fn(),
        setActive: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<DesignationsScreen />)
    await user.click(await screen.findByRole('button', { name: 'Território Centro' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: 'Nenhum' }))
    await user.click(within(dialog).getByRole('button', { name: /^atribuir$/i }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('territory-1', null))
    expect(await screen.findByText('0 de 1 territórios designados')).toBeInTheDocument()
  })

  it('shows a visible error message when assigning fails, without breaking the screen', async () => {
    const territory = makeTerritory({ name: 'Centro' })
    const listWithBlocks = vi.fn().mockResolvedValue([territory])
    const assign = vi.fn().mockRejectedValue(new Error('Publicador não encontrado.'))
    const api = makeApi({
      territories: {
        listWithBlocks,
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign
      },
      publishers: {
        list: vi.fn().mockResolvedValue([makePublisher({ id: 'p1', name: 'Ana' })]),
        create: vi.fn(),
        regenerateCode: vi.fn(),
        setActive: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<DesignationsScreen />)
    await user.click(await screen.findByRole('button', { name: 'Território Centro' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('radio', { name: 'Ana' }))
    await user.click(within(dialog).getByRole('button', { name: /^atribuir$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Publicador não encontrado.')
    // The screen survives: summary and map are still there, and the failed
    // assignment did not trigger a reload.
    expect(screen.getByText('0 de 1 territórios designados')).toBeInTheDocument()
    expect(screen.getByTestId('fake-assignments-map')).toBeInTheDocument()
    expect(listWithBlocks).toHaveBeenCalledTimes(1)
  })

  it('does not offer deactivated publishers in the dialog', async () => {
    const territory = makeTerritory({ name: 'Centro' })
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign: vi.fn()
      },
      publishers: {
        list: vi
          .fn()
          .mockResolvedValue([
            makePublisher({ id: 'p1', name: 'Ana', isActive: true }),
            makePublisher({ id: 'p2', name: 'Beto', isActive: false })
          ]),
        create: vi.fn(),
        regenerateCode: vi.fn(),
        setActive: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<DesignationsScreen />)
    await user.click(await screen.findByRole('button', { name: 'Território Centro' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('radio', { name: 'Ana' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('radio', { name: 'Beto' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Nenhum' })).toBeChecked()
  })

  it('"Cancelar" closes the dialog without calling assign', async () => {
    const territory = makeTerritory({ name: 'Centro' })
    const assign = vi.fn()
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign
      },
      publishers: {
        list: vi.fn().mockResolvedValue([makePublisher({ id: 'p1', name: 'Ana' })]),
        create: vi.fn(),
        regenerateCode: vi.fn(),
        setActive: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<DesignationsScreen />)
    await user.click(await screen.findByRole('button', { name: 'Território Centro' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('radio', { name: 'Ana' }))
    await user.click(within(dialog).getByRole('button', { name: /^cancelar$/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('shows a visible error message when loading the publisher options fails', async () => {
    const territory = makeTerritory({ name: 'Centro' })
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign: vi.fn()
      },
      publishers: {
        list: vi.fn().mockRejectedValue(new Error('Falha ao carregar publicadores.')),
        create: vi.fn(),
        regenerateCode: vi.fn(),
        setActive: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<DesignationsScreen />)
    await user.click(await screen.findByRole('button', { name: 'Território Centro' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar publicadores.')
  })
})
