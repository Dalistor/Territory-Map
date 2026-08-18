// The Designations page (spec 0006, Task 03; panel of assignment history in
// spec 0007, Task 11). `window.api` is never the real IPC bridge here -- a
// fake stubbed with `vi.stubGlobal` stands in, per the convention every other
// screen test in this folder follows.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcApi } from '../../shared/ipc-contract'
import type { Assignment, Publisher, Territory } from '../../shared/models'
import { DesignationsScreen } from './DesignationsScreen'

// The real AssignmentsMap pulls in react-leaflet, which needs a real DOM
// layout jsdom does not provide. This screen's own job -- the summary, the
// load/error handling, the history panel -- only depends on the
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

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'assignment-1',
    publisher: { id: 'p1', name: 'Ana' },
    startedAt: new Date('2026-03-01T12:00:00Z'),
    ...overrides
  }
}

/** The same formatting the screen uses, so the expectation does not hard-code
 * a locale the test runner may not have. */
function asDate(date: Date): string {
  return date.toLocaleDateString()
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
    assignments: {
      listAll: vi.fn().mockResolvedValue([]),
      listFor: vi.fn().mockResolvedValue([]),
      designate: vi.fn().mockResolvedValue(makeAssignment()),
      complete: vi.fn().mockResolvedValue(makeAssignment()),
      delete: vi.fn().mockResolvedValue(undefined),
      ...overrides.assignments
    },
    exports: {
      assignments: vi.fn().mockResolvedValue(null),
      ...overrides.exports
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

let confirmSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  confirmSpy.mockRestore()
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
        delete: vi.fn()
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
        delete: vi.fn()
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
        delete: vi.fn()
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

describe('DesignationsScreen assignment history panel', () => {
  const territory = makeTerritory({ name: 'Centro', assignedUser: { id: 'p2', name: 'Bia' } })
  const open = makeAssignment({
    id: 'a-open',
    publisher: { id: 'p2', name: 'Bia' },
    startedAt: new Date('2026-05-10T12:00:00Z')
  })
  const closed = makeAssignment({
    id: 'a-closed',
    publisher: { id: 'p1', name: 'Ana' },
    startedAt: new Date('2026-01-05T12:00:00Z'),
    completedAt: new Date('2026-05-10T12:00:00Z')
  })

  function apiWithHistory(overrides: Partial<IpcApi> = {}): IpcApi {
    return makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        ...overrides.territories
      },
      publishers: {
        list: vi
          .fn()
          .mockResolvedValue([
            makePublisher({ id: 'p1', name: 'Ana' }),
            makePublisher({ id: 'p2', name: 'Bia' })
          ]),
        create: vi.fn(),
        regenerateCode: vi.fn(),
        setActive: vi.fn(),
        ...overrides.publishers
      },
      assignments: {
        listAll: vi.fn().mockResolvedValue([]),
        listFor: vi.fn().mockResolvedValue([open, closed]),
        designate: vi.fn().mockResolvedValue(open),
        complete: vi.fn().mockResolvedValue(closed),
        delete: vi.fn().mockResolvedValue(undefined),
        ...overrides.assignments
      }
    })
  }

  async function openPanel(): Promise<HTMLElement> {
    const user = userEvent.setup()
    render(<DesignationsScreen />)
    await user.click(await screen.findByRole('button', { name: 'Território Centro' }))
    return screen.findByRole('dialog', { name: 'Designações de Centro' })
  }

  it('shows the current leader with the start date and the completed assignments in the history', async () => {
    vi.stubGlobal('api', apiWithHistory())

    const panel = await openPanel()

    expect(
      await within(panel).findByText(`Bia — desde ${asDate(open.startedAt)}`)
    ).toBeInTheDocument()
    const history = within(panel).getByRole('list', { name: /histórico/i })
    expect(within(history).getByText(/Ana/)).toHaveTextContent(
      `Ana — ${asDate(closed.startedAt)} a ${asDate(closed.completedAt as Date)}`
    )
    // The open assignment belongs to "Designação atual", never to the history.
    expect(within(history).queryByText(/Bia/)).not.toBeInTheDocument()
  })

  it('designating an active publisher calls designate with both ids and reloads', async () => {
    const designate = vi.fn().mockResolvedValue(open)
    const listFor = vi.fn().mockResolvedValue([open, closed])
    const listWithBlocks = vi.fn().mockResolvedValue([territory])
    vi.stubGlobal(
      'api',
      apiWithHistory({
        territories: { listWithBlocks } as unknown as IpcApi['territories'],
        assignments: { listFor, designate } as unknown as IpcApi['assignments']
      })
    )
    const user = userEvent.setup()

    const panel = await openPanel()
    await user.click(await within(panel).findByRole('radio', { name: 'Ana' }))
    await user.click(within(panel).getByRole('button', { name: /^designar$/i }))

    await waitFor(() => expect(designate).toHaveBeenCalledWith('territory-1', 'p1'))
    // Both the history and the territory list are refreshed: the
    // `assignedUser` projection changed on the server.
    await waitFor(() => expect(listFor).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(listWithBlocks).toHaveBeenCalledTimes(2))
  })

  it('warns that the current assignment will be closed today before designating someone else', async () => {
    const designate = vi.fn().mockResolvedValue(open)
    vi.stubGlobal(
      'api',
      apiWithHistory({ assignments: { designate } as unknown as IpcApi['assignments'] })
    )
    const user = userEvent.setup()

    const panel = await openPanel()
    await user.click(await within(panel).findByRole('radio', { name: 'Ana' }))
    await user.click(within(panel).getByRole('button', { name: /^designar$/i }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy.mock.calls[0][0]).toMatch(/Bia/)
    expect(confirmSpy.mock.calls[0][0]).toMatch(/encerrada/i)
  })

  it('"Marcar como concluído" calls complete once confirmed, and nothing when refused', async () => {
    const complete = vi.fn().mockResolvedValue(closed)
    const listWithBlocks = vi.fn().mockResolvedValue([territory])
    vi.stubGlobal(
      'api',
      apiWithHistory({
        territories: { listWithBlocks } as unknown as IpcApi['territories'],
        assignments: { complete } as unknown as IpcApi['assignments']
      })
    )
    const user = userEvent.setup()

    const panel = await openPanel()
    confirmSpy.mockReturnValue(false)
    await user.click(await within(panel).findByRole('button', { name: /marcar como concluído/i }))
    expect(complete).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    await user.click(within(panel).getByRole('button', { name: /marcar como concluído/i }))

    await waitFor(() => expect(complete).toHaveBeenCalledWith('territory-1'))
    await waitFor(() => expect(listWithBlocks).toHaveBeenCalledTimes(2))
  })

  it('"Apagar" on a history line deletes that assignment once confirmed, and nothing when refused', async () => {
    const deleteAssignment = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal(
      'api',
      apiWithHistory({
        assignments: { delete: deleteAssignment } as unknown as IpcApi['assignments']
      })
    )
    const user = userEvent.setup()

    const panel = await openPanel()
    const deleteButton = await within(panel).findByRole('button', {
      name: /apagar designação de ana/i
    })

    confirmSpy.mockReturnValue(false)
    await user.click(deleteButton)
    expect(deleteAssignment).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    await user.click(deleteButton)

    await waitFor(() => expect(deleteAssignment).toHaveBeenCalledWith('territory-1', 'a-closed'))
    expect(confirmSpy.mock.calls.at(-1)?.[0]).toMatch(/histórico/i)
  })

  it('shows a visible error message when an action fails, without breaking the screen', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('Designação não encontrada.'))
    vi.stubGlobal(
      'api',
      apiWithHistory({ assignments: { complete } as unknown as IpcApi['assignments'] })
    )
    const user = userEvent.setup()

    const panel = await openPanel()
    await user.click(await within(panel).findByRole('button', { name: /marcar como concluído/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Designação não encontrada.')
    expect(screen.getByTestId('fake-assignments-map')).toBeInTheDocument()
  })

  it('a territory with no assignment shows "Sem dirigente", offers no completion, and still designates', async () => {
    const free = makeTerritory({ name: 'Centro' })
    const designate = vi.fn().mockResolvedValue(open)
    vi.stubGlobal(
      'api',
      apiWithHistory({
        territories: {
          listWithBlocks: vi.fn().mockResolvedValue([free])
        } as unknown as IpcApi['territories'],
        assignments: {
          listFor: vi.fn().mockResolvedValue([]),
          designate
        } as unknown as IpcApi['assignments']
      })
    )
    const user = userEvent.setup()

    const panel = await openPanel()

    expect(within(panel).getByText('Sem dirigente')).toBeInTheDocument()
    expect(
      within(panel).queryByRole('button', { name: /marcar como concluído/i })
    ).not.toBeInTheDocument()

    await user.click(await within(panel).findByRole('radio', { name: 'Ana' }))
    await user.click(within(panel).getByRole('button', { name: /^designar$/i }))

    await waitFor(() => expect(designate).toHaveBeenCalledWith('territory-1', 'p1'))
    // Nothing is being replaced, so there is nothing to warn about.
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('does not offer deactivated publishers in the panel', async () => {
    vi.stubGlobal(
      'api',
      apiWithHistory({
        publishers: {
          list: vi
            .fn()
            .mockResolvedValue([
              makePublisher({ id: 'p1', name: 'Ana', isActive: true }),
              makePublisher({ id: 'p3', name: 'Beto', isActive: false })
            ])
        } as unknown as IpcApi['publishers']
      })
    )

    const panel = await openPanel()

    expect(await within(panel).findByRole('radio', { name: 'Ana' })).toBeInTheDocument()
    expect(within(panel).queryByRole('radio', { name: 'Beto' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('radio', { name: 'Nenhum' })).not.toBeInTheDocument()
  })

  it('shows a visible error message when loading the publisher options fails', async () => {
    vi.stubGlobal(
      'api',
      apiWithHistory({
        publishers: {
          list: vi.fn().mockRejectedValue(new Error('Falha ao carregar publicadores.'))
        } as unknown as IpcApi['publishers']
      })
    )

    await openPanel()

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar publicadores.')
  })

  it('"Fechar" closes the panel without calling anything', async () => {
    const designate = vi.fn()
    vi.stubGlobal(
      'api',
      apiWithHistory({ assignments: { designate } as unknown as IpcApi['assignments'] })
    )
    const user = userEvent.setup()

    const panel = await openPanel()
    await user.click(within(panel).getByRole('button', { name: /^fechar$/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(designate).not.toHaveBeenCalled()
  })
})

describe('DesignationsScreen exporting to Excel', () => {
  function apiWithExport(assignmentsExport: IpcApi['exports']['assignments']): IpcApi {
    return makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([makeTerritory()]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      },
      exports: { assignments: assignmentsExport }
    })
  }

  it('shows where the spreadsheet was saved', async () => {
    const exportAssignments = vi.fn().mockResolvedValue('/Users/ana/designacoes-2026-08-18.xlsx')
    vi.stubGlobal('api', apiWithExport(exportAssignments))
    const user = userEvent.setup()

    render(<DesignationsScreen />)
    await user.click(await screen.findByRole('button', { name: /exportar para excel/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      '/Users/ana/designacoes-2026-08-18.xlsx'
    )
    expect(exportAssignments).toHaveBeenCalledTimes(1)
  })

  it('says nothing when the admin cancels the save dialog', async () => {
    const exportAssignments = vi.fn().mockResolvedValue(null)
    vi.stubGlobal('api', apiWithExport(exportAssignments))
    const user = userEvent.setup()

    render(<DesignationsScreen />)
    await user.click(await screen.findByRole('button', { name: /exportar para excel/i }))

    await waitFor(() => expect(exportAssignments).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the failure as an alert', async () => {
    const exportAssignments = vi.fn().mockRejectedValue(new Error('Não foi possível salvar.'))
    vi.stubGlobal('api', apiWithExport(exportAssignments))
    const user = userEvent.setup()

    render(<DesignationsScreen />)
    await user.click(await screen.findByRole('button', { name: /exportar para excel/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
