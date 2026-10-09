import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcApi } from '../../shared/ipc-contract'
import type { AssignmentHistoryPage, AssignmentWithTerritory } from '../../shared/models'
import { HistoryScreen } from './HistoryScreen'

function makeEntry(overrides: Partial<AssignmentWithTerritory> = {}): AssignmentWithTerritory {
  return {
    id: 'assignment-1',
    publisher: { id: 'p1', name: 'Ana' },
    territory: { id: 't1', name: 'Centro - N1' },
    startedAt: new Date('2026-03-01T12:00:00Z'),
    completedAt: new Date('2026-04-01T12:00:00Z'),
    ...overrides
  }
}

function makePage(
  items: AssignmentWithTerritory[] = [],
  overrides: Partial<AssignmentHistoryPage> = {}
): AssignmentHistoryPage {
  return { items, total: items.length, page: 1, pageSize: 50, ...overrides }
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
    blocks: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), ...overrides.blocks },
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
      listAll: vi.fn().mockResolvedValue(makePage()),
      listFor: vi.fn().mockResolvedValue([]),
      designate: vi.fn(),
      complete: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn(),
      ...overrides.assignments
    },
    exports: { assignments: vi.fn(), s13t: vi.fn(), s13tDocx: vi.fn(), ...overrides.exports },
    imports: {
      s13tSelectAndPreview: vi.fn(),
      s13tExecute: vi
        .fn()
        .mockResolvedValue({ importedAssignmentsCount: 0, importedPublishersCount: 0, errors: [] }),
      ...overrides.imports
    },
    workLogs: { listFor: vi.fn(), delete: vi.fn(), markWorked: vi.fn(), ...overrides.workLogs },
    geo: { geocodeCity: vi.fn(), ...overrides.geo }
  }
}

function expectedLocalDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year!, month! - 1, date!).toISOString()
}

let confirmSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  vi.unstubAllGlobals()
  confirmSpy.mockRestore()
})

describe('HistoryScreen', () => {
  it('shows a semantic table with territory, publisher, dates and an open status', async () => {
    vi.stubGlobal(
      'api',
      makeApi({
        assignments: {
          listAll: vi.fn().mockResolvedValue(makePage([makeEntry({ completedAt: undefined })]))
        } as unknown as IpcApi['assignments']
      })
    )
    render(<HistoryScreen />)
    const table = await screen.findByRole('table', { name: 'Histórico completo' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
    ).toEqual(['Território', 'Publicador', 'Retirada', 'Devolução', 'Situação', 'Ações'])
    expect(within(table).getByText('Centro - N1')).toBeInTheDocument()
    expect(within(table).getByText('Ana')).toBeInTheDocument()
    expect(within(table).getByText('Em andamento')).toBeInTheDocument()
  })

  it('turns selected local days into a half-open ISO interval', async () => {
    const user = userEvent.setup()
    const listAll = vi.fn().mockResolvedValue(makePage())
    vi.stubGlobal('api', makeApi({ assignments: { listAll } as unknown as IpcApi['assignments'] }))
    render(<HistoryScreen />)
    await screen.findByText('Nenhuma designação registrada ainda.')
    await user.type(screen.getByLabelText('De'), '2026-03-01')
    await user.type(screen.getByLabelText('Até'), '2026-03-03')
    await waitFor(() =>
      expect(listAll).toHaveBeenLastCalledWith({
        fromInstant: new Date(expectedLocalDay('2026-03-01')),
        toInstant: new Date(expectedLocalDay('2026-03-04')),
        page: 1
      })
    )
  })

  it('returns to page one when dates change or are cleared', async () => {
    const user = userEvent.setup()
    const listAll = vi
      .fn()
      .mockResolvedValueOnce(makePage([makeEntry()], { total: 51, page: 1 }))
      .mockResolvedValueOnce(makePage([makeEntry({ id: 'second' })], { total: 51, page: 2 }))
      .mockResolvedValue(makePage([makeEntry()], { total: 51, page: 1 }))
    vi.stubGlobal('api', makeApi({ assignments: { listAll } as unknown as IpcApi['assignments'] }))
    render(<HistoryScreen />)
    await screen.findByText('1–1 de 51')
    await user.click(screen.getByRole('button', { name: 'Próxima página' }))
    await screen.findByText('51–51 de 51')
    await user.type(screen.getByLabelText('De'), '2026-03-01')
    await waitFor(() =>
      expect(listAll).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
    )
    await user.click(screen.getByRole('button', { name: 'Limpar período' }))
    await waitFor(() => expect(listAll).toHaveBeenLastCalledWith({ page: 1 }))
  })

  it('does not let an older response overwrite a newer date filter', async () => {
    const user = userEvent.setup()
    let resolveFirst!: (page: AssignmentHistoryPage) => void
    let resolveSecond!: (page: AssignmentHistoryPage) => void
    const first = new Promise<AssignmentHistoryPage>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<AssignmentHistoryPage>((resolve) => {
      resolveSecond = resolve
    })
    const listAll = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    vi.stubGlobal('api', makeApi({ assignments: { listAll } as unknown as IpcApi['assignments'] }))
    render(<HistoryScreen />)
    await user.type(screen.getByLabelText('De'), '2026-03-01')
    resolveSecond(makePage([makeEntry({ territory: { id: 'new', name: 'Novo - N2' } })]))
    expect(await screen.findByText('Novo - N2')).toBeInTheDocument()
    resolveFirst(makePage([makeEntry({ territory: { id: 'old', name: 'Antigo - N1' } })]))
    await waitFor(() => expect(screen.queryByText('Antigo - N1')).not.toBeInTheDocument())
  })

  it('keeps table headers while loading and distinguishes no-results from an empty history', async () => {
    const listAll = vi
      .fn()
      .mockResolvedValueOnce(makePage())
      .mockResolvedValue(makePage([], { page: 1 }))
    vi.stubGlobal('api', makeApi({ assignments: { listAll } as unknown as IpcApi['assignments'] }))
    render(<HistoryScreen />)
    expect(screen.getByRole('columnheader', { name: 'Território' })).toBeInTheDocument()
    expect(await screen.findByText('Nenhuma designação registrada ainda.')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('De'), '2026-03-01')
    expect(screen.getByRole('columnheader', { name: 'Território' })).toBeInTheDocument()
    expect(
      await screen.findByText('Nenhum resultado para o período selecionado.')
    ).toBeInTheDocument()
  })

  it('preserves the date filter after an error and retries it', async () => {
    const user = userEvent.setup()
    const listAll = vi
      .fn()
      .mockResolvedValueOnce(makePage())
      .mockRejectedValueOnce(new Error('sem rede'))
      .mockResolvedValueOnce(makePage([makeEntry()]))
    vi.stubGlobal('api', makeApi({ assignments: { listAll } as unknown as IpcApi['assignments'] }))
    render(<HistoryScreen />)
    await screen.findByText('Nenhuma designação registrada ainda.')
    await user.type(screen.getByLabelText('De'), '2026-03-01')
    expect(await screen.findByRole('alert')).toHaveTextContent('sem rede')
    expect(screen.getByLabelText('De')).toHaveValue('2026-03-01')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Centro - N1')).toBeInTheDocument()
    expect(listAll).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
  })

  it('confirms deletion and recalibrates the page to one', async () => {
    const user = userEvent.setup()
    const remove = vi.fn().mockResolvedValue(undefined)
    const listAll = vi
      .fn()
      .mockResolvedValueOnce(makePage([makeEntry()], { total: 51, page: 2 }))
      .mockResolvedValueOnce(makePage([makeEntry()], { total: 50, page: 1 }))
    vi.stubGlobal(
      'api',
      makeApi({ assignments: { listAll, delete: remove } as unknown as IpcApi['assignments'] })
    )
    render(<HistoryScreen />)
    await user.click(await screen.findByRole('button', { name: /Apagar designação/ }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('t1', 'assignment-1'))
    await waitFor(() => expect(listAll).toHaveBeenLastCalledWith({ page: 1 }))
  })
})
