// The Designations page (spec 0006, Task 03; panel of assignment history in
// spec 0007, Task 11). `window.api` is never the real IPC bridge here -- a
// fake stubbed with `vi.stubGlobal` stands in, per the convention every other
// screen test in this folder follows.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IpcApi } from '../../shared/ipc-contract'
import type { Assignment, Publisher, Territory } from '../../shared/models'
import { DesignationsScreen } from './DesignationsScreen'
import { answerConfirm } from '../components/ConfirmDialog.testing'

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
  return date.toLocaleDateString('pt-BR')
}

type DeepPartialIpcApi = {
  [K in keyof IpcApi]?: Partial<IpcApi[K]>
}

function makeApi(overrides: DeepPartialIpcApi = {}): IpcApi {
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
      rename: vi.fn(),
      setActive: vi.fn(),
      delete: vi.fn(),
      ...overrides.publishers
    },
    assignments: {
      listAll: vi.fn().mockResolvedValue([]),
      listFor: vi.fn().mockResolvedValue([]),
      designate: vi.fn().mockResolvedValue(makeAssignment()),
      complete: vi.fn().mockResolvedValue(makeAssignment()),
      delete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(makeAssignment()),
      ...overrides.assignments
    },
    exports: {
      assignments: vi.fn().mockResolvedValue(null),
      s13t: vi.fn().mockResolvedValue(null),
      s13tDocx: vi.fn().mockResolvedValue(null),
      ...overrides.exports
    },
    imports: {
      s13tSelectAndPreview: vi.fn().mockResolvedValue(null),
      s13tExecute: vi.fn().mockResolvedValue({
        importedAssignmentsCount: 0,
        importedPublishersCount: 0,
        errors: []
      }),
      ...overrides.imports
    },
    workLogs: {
      listFor: vi.fn(),
      delete: vi.fn(),
      markWorked: vi.fn(),
      ...overrides.workLogs
    },
    campaigns: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      designate: vi.fn(),
      setPublishers: vi.fn(),
      complete: vi.fn(),
      ...overrides.campaigns
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
  it('shows the assignment count in the summary and hands every territory to the map view', async () => {
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

    expect(await screen.findByText('1 de 2 territórios designados · 1 livre')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Visualização' })).getByRole('radio', {
        name: 'Mapa'
      })
    )
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

    expect(await screen.findByText('0 de 1 territórios designados · 1 livre')).toBeInTheDocument()
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

describe('DesignationsScreen territory workspace', () => {
  it('orders the territory table by its number and opens the selected territory in a modal', async () => {
    const later = makeTerritory({ id: 'later', name: 'Jardim - N12' })
    const first = makeTerritory({ id: 'first', name: 'Centro - N2' })
    vi.stubGlobal(
      'api',
      makeApi({
        territories: {
          listWithBlocks: vi.fn().mockResolvedValue([later, first]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        },
        publishers: {
          list: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          regenerateCode: vi.fn(),
          rename: vi.fn(),
          setActive: vi.fn(),
          delete: vi.fn()
        }
      })
    )
    const user = userEvent.setup()

    render(<DesignationsScreen />)

    const table = await screen.findByRole('table', { name: /territórios/i })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Centro - N2')
    expect(rows[1]).toHaveTextContent('Jardim - N12')

    await user.click(rows[0])

    expect(await screen.findByRole('dialog', { name: /^centro - n2$/i })).toBeVisible()
  })

  it('keeps the search when changing between list and map, and opens a territory from the map', async () => {
    const territory = makeTerritory({ id: 'territory-12', name: 'Jardim - N12' })
    vi.stubGlobal(
      'api',
      makeApi({
        territories: {
          listWithBlocks: vi.fn().mockResolvedValue([territory]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        }
      })
    )
    const user = userEvent.setup()

    render(<DesignationsScreen />)

    await user.type(await screen.findByRole('searchbox', { name: /buscar territórios/i }), 'N12')
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Visualização' })).getByRole('radio', {
        name: 'Mapa'
      })
    )
    await user.click(screen.getByRole('button', { name: 'Território Jardim - N12' }))
    expect(await screen.findByRole('dialog', { name: /^jardim - n12$/i })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /fechar detalhes/i }))

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Visualização' })).getByRole('radio', {
        name: 'Lista'
      })
    )
    expect(screen.getByRole('searchbox', { name: /buscar territórios/i })).toHaveValue('N12')
    expect(screen.getByRole('row', { name: /jardim - n12/i })).toBeInTheDocument()
  })

  it('opens a row by keyboard and Escape closes the detail returning focus to that row', async () => {
    const territory = makeTerritory({ id: 'keyboard', name: 'Centro - N3' })
    vi.stubGlobal(
      'api',
      makeApi({
        territories: {
          listWithBlocks: vi.fn().mockResolvedValue([territory]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        },
        publishers: {
          list: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          regenerateCode: vi.fn(),
          rename: vi.fn(),
          setActive: vi.fn(),
          delete: vi.fn()
        }
      })
    )
    const user = userEvent.setup()

    render(<DesignationsScreen />)

    const row = await screen.findByRole('row', { name: /centro - n3/i })
    row.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: /^centro - n3$/i })).toBeVisible()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /^centro - n3$/i })).not.toBeInTheDocument()
    expect(row).toHaveFocus()
  })

  it('closes a stale detail when refresh no longer returns its selected territory', async () => {
    const territory = makeTerritory({ id: 'removed', name: 'Centro - N4' })
    const listWithBlocks = vi.fn().mockResolvedValueOnce([territory]).mockResolvedValueOnce([])
    vi.stubGlobal(
      'api',
      makeApi({
        territories: {
          listWithBlocks,
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        },
        publishers: {
          list: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          regenerateCode: vi.fn(),
          rename: vi.fn(),
          setActive: vi.fn(),
          delete: vi.fn()
        }
      })
    )
    const user = userEvent.setup()

    render(<DesignationsScreen />)

    await user.click(await screen.findByRole('row', { name: /centro - n4/i }))
    expect(await screen.findByRole('dialog', { name: /^centro - n4$/i })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /recarregar/i }))
    await waitFor(() => expect(listWithBlocks).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog', { name: /^centro - n4$/i })).not.toBeInTheDocument()
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
        rename: vi.fn(),
        setActive: vi.fn(),
        delete: vi.fn(),
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
    await user.click(await screen.findByRole('row', { name: /centro/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Centro' })
    await user.click(within(dialog).getByRole('tab', { name: 'Designações' }))
    return dialog
  }

  it('shows the current leader with the start date and the completed assignments in the history', async () => {
    vi.stubGlobal('api', apiWithHistory())

    const panel = await openPanel()

    const summary = within(panel).getByRole('region', { name: /resumo do território/i })
    expect(await within(summary).findByText(asDate(open.startedAt))).toBeInTheDocument()
    expect(within(summary).getByText('Bia')).toBeInTheDocument()

    const history = within(panel).getByRole('table', { name: /histórico de designações/i })
    const [, current, past] = within(history).getAllByRole('row')
    // The one in force reads "Em andamento" in place of a return date, on top.
    expect(current).toHaveTextContent(`Bia${asDate(open.startedAt)}Em andamento`)
    expect(past).toHaveTextContent(
      `Ana${asDate(closed.startedAt)}${asDate(closed.completedAt as Date)}`
    )
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
    await user.selectOptions(
      await within(panel).findByRole('combobox', { name: 'Publicador' }),
      await within(panel).findByRole('option', { name: 'Ana' })
    )
    await user.click(within(panel).getByRole('button', { name: /^designar publicador$/i }))
    await answerConfirm(user, true)

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
    await user.selectOptions(
      await within(panel).findByRole('combobox', { name: 'Publicador' }),
      await within(panel).findByRole('option', { name: 'Ana' })
    )
    await user.click(within(panel).getByRole('button', { name: /^designar publicador$/i }))

    const message = await answerConfirm(user, true)
    expect(message).toMatch(/Bia/)
    expect(message).toMatch(/encerrada/i)
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
    await user.click(await within(panel).findByRole('button', { name: /marcar como concluído/i }))
    await answerConfirm(user, false)
    expect(complete).not.toHaveBeenCalled()

    await user.click(within(panel).getByRole('button', { name: /marcar como concluído/i }))
    await answerConfirm(user, true)

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

    await user.click(deleteButton)
    await answerConfirm(user, false)
    expect(deleteAssignment).not.toHaveBeenCalled()

    await user.click(deleteButton)
    const message = await answerConfirm(user, true)

    await waitFor(() => expect(deleteAssignment).toHaveBeenCalledWith('territory-1', 'a-closed'))
    expect(message).toMatch(/histórico/i)
  })

  it('allows editing current and past assignments via modal', async () => {
    const updateAssignment = vi.fn().mockResolvedValue(open)
    vi.stubGlobal(
      'api',
      apiWithHistory({
        assignments: { update: updateAssignment } as unknown as IpcApi['assignments']
      })
    )
    const user = userEvent.setup()
    const panel = await openPanel()

    // The current assignment is editable straight from the summary strip.
    const summary = within(panel).getByRole('region', { name: /resumo do território/i })
    const editCurrentBtn = await within(summary).findByRole('button', {
      name: /editar designação de bia/i
    })
    await user.click(editCurrentBtn)

    const modal = await screen.findByRole('dialog', { name: /editar designação atual/i })
    expect(modal).toBeVisible()

    const saveBtn = within(modal).getByRole('button', { name: /salvar alterações/i })
    await user.click(saveBtn)

    await waitFor(() =>
      expect(updateAssignment).toHaveBeenCalledWith(
        'territory-1',
        'a-open',
        expect.objectContaining({ publisherId: 'p2' })
      )
    )
  })

  it('Escape in the edit modal closes only that modal, keeping the territory open', async () => {
    vi.stubGlobal('api', apiWithHistory())
    const user = userEvent.setup()
    const panel = await openPanel()

    await user.click(
      await within(panel).findByRole('button', { name: /editar designação de ana/i })
    )
    expect(await screen.findByRole('dialog', { name: /editar designação passada/i })).toBeVisible()

    await user.keyboard('{Escape}')

    expect(
      screen.queryByRole('dialog', { name: /editar designação passada/i })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Centro' })).toBeVisible()
  })

  it('refuses a withdrawal date in the future before calling the server', async () => {
    const updateAssignment = vi.fn()
    vi.stubGlobal(
      'api',
      apiWithHistory({
        assignments: { update: updateAssignment } as unknown as IpcApi['assignments']
      })
    )
    const user = userEvent.setup()
    const panel = await openPanel()
    const summary = within(panel).getByRole('region', { name: /resumo do território/i })
    await user.click(await within(summary).findByRole('button', { name: /editar designação/i }))
    const modal = await screen.findByRole('dialog', { name: /editar designação atual/i })

    const started = within(modal).getByLabelText('Data de retirada')
    await user.clear(started)
    await user.type(started, '2999-01-01')
    await user.click(within(modal).getByRole('button', { name: /salvar alterações/i }))

    expect(within(modal).getByText(/não pode estar no futuro/i)).toBeInTheDocument()
    expect(updateAssignment).not.toHaveBeenCalled()
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
    await answerConfirm(user, true)

    expect(await screen.findByRole('alert')).toHaveTextContent('Designação não encontrada.')
    expect(screen.getByRole('table', { name: 'Territórios' })).toBeInTheDocument()
  })

  it('a territory in an active campaign names the campaign and offers no action on its line', async () => {
    const inCampaign = makeTerritory({
      name: 'Centro',
      campaign: { id: 'c1', name: 'Celebração' },
      assignedSince: new Date('2026-06-01T12:00:00Z')
    })
    const campaignLine: Assignment = {
      id: 'a-campaign',
      campaign: { id: 'c1', name: 'Celebração' },
      startedAt: new Date('2026-06-01T12:00:00Z')
    }
    vi.stubGlobal(
      'api',
      apiWithHistory({
        territories: {
          listWithBlocks: vi.fn().mockResolvedValue([inCampaign])
        } as unknown as IpcApi['territories'],
        assignments: {
          listFor: vi.fn().mockResolvedValue([campaignLine, closed])
        } as unknown as IpcApi['assignments']
      })
    )

    const panel = await openPanel()

    const history = within(panel).getByRole('table', { name: /histórico de designações/i })
    const [, current, past] = await within(history).findAllByRole('row')
    expect(current).toHaveTextContent('Campanha: Celebração')
    expect(within(current).queryByRole('button')).toBeNull()
    expect(within(past).getByRole('button', { name: 'Apagar designação de Ana' })).toBeEnabled()
    expect(
      within(panel).queryByRole('button', { name: /marcar como concluído/i })
    ).not.toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Designar publicador' })).toBeDisabled()
    expect(within(panel).getByText(/conclua a campanha ou tire o território dela/)).toBeVisible()
    expect(
      within(screen.getByRole('table', { name: 'Territórios' })).getByText('Campanha: Celebração')
    ).toBeInTheDocument()
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

    expect(await within(panel).findByText('Sem dirigente')).toBeInTheDocument()
    expect(
      within(panel).queryByRole('button', { name: /marcar como concluído/i })
    ).not.toBeInTheDocument()

    await user.selectOptions(
      await within(panel).findByRole('combobox', { name: 'Publicador' }),
      await within(panel).findByRole('option', { name: 'Ana' })
    )
    await user.click(within(panel).getByRole('button', { name: /^designar publicador$/i }))

    await waitFor(() => expect(designate).toHaveBeenCalledWith('territory-1', 'p1'))
    // Nothing is being replaced, so there is nothing to warn about.
    expect(document.querySelector('.confirm-dialog')).toBeNull()
  })

  it('does not offer deactivated publishers, nor the current leader, to designate', async () => {
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

    expect(await within(panel).findByRole('option', { name: 'Ana' })).toBeInTheDocument()
    expect(within(panel).queryByRole('option', { name: 'Beto' })).not.toBeInTheDocument()
    // The current leader is not offered to replace themselves.
    expect(within(panel).queryByRole('option', { name: 'Bia' })).not.toBeInTheDocument()
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

  it('"Fechar" closes the modal without calling anything', async () => {
    const designate = vi.fn()
    vi.stubGlobal(
      'api',
      apiWithHistory({ assignments: { designate } as unknown as IpcApi['assignments'] })
    )
    const user = userEvent.setup()

    const panel = await openPanel()
    await user.click(within(panel).getByRole('button', { name: /fechar detalhes/i }))

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
      exports: {
        assignments: assignmentsExport,
        s13t: vi.fn().mockResolvedValue(null),
        s13tDocx: vi.fn().mockResolvedValue(null)
      }
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

  it('opens S-13-T modal and exports with selected format and service year', async () => {
    const s13tMock = vi.fn().mockResolvedValue('/Users/ana/S-13_T-2026.docx')
    vi.stubGlobal(
      'api',
      makeApi({ exports: { assignments: vi.fn(), s13t: s13tMock, s13tDocx: vi.fn() } })
    )
    const user = userEvent.setup()

    render(<DesignationsScreen />)
    await user.click(await screen.findByRole('button', { name: /exportar s-13-t/i }))

    expect(
      screen.getByRole('dialog', { name: /exportar registro de designação \(s-13-t\)/i })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /gerar s-13-t \(docx\)/i }))

    expect(s13tMock).toHaveBeenCalledWith(expect.objectContaining({ format: 'docx' }))
    expect(await screen.findByRole('status')).toHaveTextContent('/Users/ana/S-13_T-2026.docx')
  })

  it('handles S-13-T import preview and confirmation', async () => {
    const preview = {
      fileName: 'S-13_T-2026.docx',
      serviceYear: 2026,
      totalTerritoriesFound: 1,
      matchedTerritoriesCount: 1,
      totalAssignmentsCount: 1,
      territories: [
        {
          territoryNumberOrName: 'Centro',
          matchedTerritoryId: 'territory-1',
          assignments: [{ publisherName: 'Ana', startedAt: '10/01/2026', completedAt: null }]
        }
      ]
    }
    const selectMock = vi.fn().mockResolvedValue(preview)
    const executeMock = vi.fn().mockResolvedValue({
      importedAssignmentsCount: 1,
      importedPublishersCount: 0,
      errors: []
    })

    vi.stubGlobal(
      'api',
      makeApi({
        imports: {
          s13tSelectAndPreview: selectMock,
          s13tExecute: executeMock
        }
      })
    )
    const user = userEvent.setup()

    render(<DesignationsScreen />)
    await user.click(await screen.findByRole('button', { name: /importar s-13-t/i }))

    expect(selectMock).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByRole('dialog', { name: /importar registros s-13-t/i })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /confirmar e importar/i }))

    expect(executeMock).toHaveBeenCalledWith(preview)
    expect(await screen.findByRole('status')).toHaveTextContent(
      /importação concluída: 1 designações processadas/i
    )
  })
})

describe('DesignationsScreen territory table', () => {
  const now = new Date(2026, 9, 17, 10)
  const longest = makeTerritory({
    id: 'longest',
    name: 'Centro - N5',
    assignedUser: { id: 'p1', name: 'Ana' },
    assignedSince: new Date(2026, 6, 1, 12)
  })
  const recent = makeTerritory({
    id: 'recent',
    name: 'Cambé - N1',
    assignedUser: { id: 'p2', name: 'Bia' },
    assignedSince: new Date(2026, 9, 12, 12)
  })
  const free = makeTerritory({ id: 'free', name: 'Vila - N9' })

  function stubTerritories(): void {
    vi.stubGlobal(
      'api',
      makeApi({
        territories: {
          listWithBlocks: vi.fn().mockResolvedValue([free, longest, recent]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        }
      })
    )
  }

  function bodyRows(): HTMLElement[] {
    return within(screen.getByRole('table', { name: 'Territórios' }))
      .getAllByRole('row')
      .slice(1)
  }

  it('shows since when every assigned territory is out, without opening it', async () => {
    stubTerritories()

    render(<DesignationsScreen now={now} />)

    const row = await screen.findByRole('row', { name: /centro - n5/i })
    expect(row).toHaveTextContent(asDate(longest.assignedSince as Date))
    expect(row).toHaveTextContent('há 108 dias')
    expect(screen.getByRole('row', { name: /cambé - n1/i })).toHaveTextContent(
      asDate(recent.assignedSince as Date)
    )
    expect(screen.getByRole('row', { name: /vila - n9/i })).toHaveTextContent('—')
  })

  it('sorts by "Retirada" with the territory out the longest first, free ones last', async () => {
    stubTerritories()
    const user = userEvent.setup()

    render(<DesignationsScreen now={now} />)
    await screen.findByRole('row', { name: /centro - n5/i })
    expect(bodyRows().map((row) => (row as HTMLTableRowElement).cells[0].textContent)).toEqual([
      'Cambé - N1',
      'Centro - N5',
      'Vila - N9'
    ])

    await user.click(screen.getByRole('button', { name: 'Ordenar por Retirada' }))
    expect(bodyRows().map((row) => (row as HTMLTableRowElement).cells[0].textContent)).toEqual([
      'Centro - N5',
      'Cambé - N1',
      'Vila - N9'
    ])

    await user.click(screen.getByRole('button', { name: 'Ordenar por Retirada' }))
    expect(bodyRows().map((row) => (row as HTMLTableRowElement).cells[0].textContent)).toEqual([
      'Cambé - N1',
      'Centro - N5',
      'Vila - N9'
    ])
  })

  it('filters by situation and finds a territory by its leader name', async () => {
    stubTerritories()
    const user = userEvent.setup()

    render(<DesignationsScreen now={now} />)
    await screen.findByRole('row', { name: /centro - n5/i })

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Situação' })).getByRole('radio', {
        name: 'Livres'
      })
    )
    expect(bodyRows().map((row) => (row as HTMLTableRowElement).cells[0].textContent)).toEqual([
      'Vila - N9'
    ])

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Situação' })).getByRole('radio', {
        name: 'Todos'
      })
    )
    await user.type(screen.getByRole('searchbox', { name: /buscar territórios/i }), 'bia')
    expect(bodyRows().map((row) => (row as HTMLTableRowElement).cells[0].textContent)).toEqual([
      'Cambé - N1'
    ])
  })
})
