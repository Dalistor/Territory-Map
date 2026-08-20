// The Historico page (spec 0008, Task 07). `window.api` is never the real IPC
// bridge here -- a fake stubbed with `vi.stubGlobal` stands in, per the
// convention every other screen test in this folder follows.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcApi } from '../../shared/ipc-contract'
import type { AssignmentWithTerritory } from '../../shared/models'
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
      delete: vi.fn(),
      ...overrides.publishers
    },
    assignments: {
      listAll: vi.fn().mockResolvedValue([]),
      listFor: vi.fn().mockResolvedValue([]),
      designate: vi.fn(),
      complete: vi.fn(),
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
      markWorked: vi.fn(),
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

describe('HistoryScreen grouped by leader', () => {
  it('groups the records by publisher, alphabetically, each line naming the territory and the two dates', async () => {
    const entries = [
      makeEntry({
        id: 'a1',
        publisher: { id: 'p2', name: 'Bia' },
        territory: { id: 't2', name: 'Bairro Sul - N2' },
        startedAt: new Date('2026-05-01T12:00:00Z'),
        completedAt: new Date('2026-06-01T12:00:00Z')
      }),
      makeEntry({ id: 'a2' })
    ]
    vi.stubGlobal(
      'api',
      makeApi({
        assignments: {
          listAll: vi.fn().mockResolvedValue(entries)
        } as unknown as IpcApi['assignments']
      })
    )

    render(<HistoryScreen />)

    const groups = await screen.findAllByRole('group')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['Ana', 'Bia'])

    expect(
      within(groups[0]).getByText(
        `Centro - N1 — ${asDate(new Date('2026-03-01T12:00:00Z'))} a ${asDate(new Date('2026-04-01T12:00:00Z'))}`
      )
    ).toBeInTheDocument()
    expect(
      within(groups[1]).getByText(
        `Bairro Sul - N2 — ${asDate(new Date('2026-05-01T12:00:00Z'))} a ${asDate(new Date('2026-06-01T12:00:00Z'))}`
      )
    ).toBeInTheDocument()
  })
})

describe('HistoryScreen grouped by territory', () => {
  it('regroups the same records by territory, in territory-number order, naming the publisher on each line', async () => {
    const user = userEvent.setup()
    const entries = [
      makeEntry({
        id: 'a1',
        publisher: { id: 'p1', name: 'Ana' },
        territory: { id: 't2', name: 'Bairro Sul - N10' }
      }),
      makeEntry({
        id: 'a2',
        publisher: { id: 'p2', name: 'Bia' },
        territory: { id: 't1', name: 'Centro - N2' }
      })
    ]
    vi.stubGlobal(
      'api',
      makeApi({
        assignments: {
          listAll: vi.fn().mockResolvedValue(entries)
        } as unknown as IpcApi['assignments']
      })
    )

    render(<HistoryScreen />)
    await screen.findAllByRole('group')

    await user.click(screen.getByRole('button', { name: 'Por território' }))

    const groups = screen.getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Centro - N2',
      'Bairro Sul - N10'
    ])
    expect(
      within(groups[0]).getByText(
        `Bia — ${asDate(new Date('2026-03-01T12:00:00Z'))} a ${asDate(new Date('2026-04-01T12:00:00Z'))}`
      )
    ).toBeInTheDocument()
    expect(within(groups[1]).getByText(/^Ana — /)).toBeInTheDocument()
  })

  it('marks the active view with aria-pressed, starting on "Por dirigente"', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('api', makeApi())

    render(<HistoryScreen />)

    const byLeader = await screen.findByRole('button', { name: 'Por dirigente' })
    const byTerritory = screen.getByRole('button', { name: 'Por território' })
    expect(byLeader).toHaveAttribute('aria-pressed', 'true')
    expect(byTerritory).toHaveAttribute('aria-pressed', 'false')

    await user.click(byTerritory)
    expect(byLeader).toHaveAttribute('aria-pressed', 'false')
    expect(byTerritory).toHaveAttribute('aria-pressed', 'true')

    await user.click(byLeader)
    expect(byLeader).toHaveAttribute('aria-pressed', 'true')
    expect(byTerritory).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps every assignment of one publisher in a single block, in the order the listing delivered them', async () => {
    const entries = [
      makeEntry({ id: 'recent', territory: { id: 't2', name: 'Bairro Sul - N2' } }),
      makeEntry({ id: 'older', territory: { id: 't1', name: 'Centro - N1' } })
    ]
    vi.stubGlobal(
      'api',
      makeApi({
        assignments: {
          listAll: vi.fn().mockResolvedValue(entries)
        } as unknown as IpcApi['assignments']
      })
    )

    render(<HistoryScreen />)

    const group = await screen.findByRole('group', { name: 'Ana' })
    const lines = within(group).getAllByRole('listitem')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveTextContent(/^Bairro Sul - N2 — /)
    expect(lines[1]).toHaveTextContent(/^Centro - N1 — /)
  })
})

describe('HistoryScreen open assignments', () => {
  it('reads an open assignment as "em andamento" instead of a completion date', async () => {
    vi.stubGlobal(
      'api',
      makeApi({
        assignments: {
          listAll: vi.fn().mockResolvedValue([makeEntry({ completedAt: undefined })])
        } as unknown as IpcApi['assignments']
      })
    )

    render(<HistoryScreen />)

    expect(
      await screen.findByText(
        `Centro - N1 — ${asDate(new Date('2026-03-01T12:00:00Z'))} a em andamento`
      )
    ).toBeInTheDocument()
  })
})

describe('HistoryScreen search', () => {
  const entries = [
    makeEntry({
      id: 'a1',
      publisher: { id: 'p1', name: 'João' },
      territory: { id: 't1', name: 'Centro - N1' }
    }),
    makeEntry({
      id: 'a2',
      publisher: { id: 'p2', name: 'Bia' },
      territory: { id: 't2', name: 'Jardim Aurora - N2' }
    })
  ]

  function renderWithEntries(): void {
    vi.stubGlobal(
      'api',
      makeApi({
        assignments: {
          listAll: vi.fn().mockResolvedValue(entries)
        } as unknown as IpcApi['assignments']
      })
    )
    render(<HistoryScreen />)
  }

  it('filters by publisher name in the leader view, ignoring case and accents', async () => {
    const user = userEvent.setup()
    renderWithEntries()
    await screen.findAllByRole('group')

    await user.type(screen.getByLabelText('Buscar no histórico'), 'joao')

    const groups = screen.getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['João'])
  })

  it('filters by territory name once the territory view is on', async () => {
    const user = userEvent.setup()
    renderWithEntries()
    await screen.findAllByRole('group')

    await user.click(screen.getByRole('button', { name: 'Por território' }))
    await user.type(screen.getByLabelText('Buscar no histórico'), 'JARDIM')

    const groups = screen.getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['Jardim Aurora - N2'])
  })

  it('tells an empty search apart from an empty history', async () => {
    const user = userEvent.setup()
    renderWithEntries()
    await screen.findAllByRole('group')

    await user.type(screen.getByLabelText('Buscar no histórico'), 'zzz')

    expect(screen.getByText('Nenhum resultado para a busca.')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma designação registrada ainda.')).not.toBeInTheDocument()
  })

  it('says nothing was ever recorded when the history itself is empty', async () => {
    vi.stubGlobal('api', makeApi())

    render(<HistoryScreen />)

    expect(await screen.findByText('Nenhuma designação registrada ainda.')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum resultado para a busca.')).not.toBeInTheDocument()
  })
})

describe('HistoryScreen deleting a record', () => {
  it('deletes the record with its own territory/assignment pair once confirmed, and reloads', async () => {
    const user = userEvent.setup()
    const deleteAssignment = vi.fn().mockResolvedValue(undefined)
    const listAll = vi.fn().mockResolvedValue([makeEntry({ id: 'a9' })])
    vi.stubGlobal(
      'api',
      makeApi({
        assignments: { listAll, delete: deleteAssignment } as unknown as IpcApi['assignments']
      })
    )

    render(<HistoryScreen />)
    const button = await screen.findByRole('button', {
      name: 'Apagar designação de Ana em Centro - N1'
    })

    confirmSpy.mockReturnValue(false)
    await user.click(button)
    expect(deleteAssignment).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    await user.click(button)

    await waitFor(() => expect(deleteAssignment).toHaveBeenCalledWith('t1', 'a9'))
    expect(confirmSpy.mock.calls.at(-1)?.[0]).toContain(
      'O registro sai do histórico como se não tivesse existido'
    )
    await waitFor(() => expect(listAll).toHaveBeenCalledTimes(2))
  })

  it('surfaces a failed delete as an alert', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'api',
      makeApi({
        assignments: {
          listAll: vi.fn().mockResolvedValue([makeEntry()]),
          delete: vi.fn().mockRejectedValue(new Error('sem rede'))
        } as unknown as IpcApi['assignments']
      })
    )

    render(<HistoryScreen />)
    await user.click(
      await screen.findByRole('button', { name: 'Apagar designação de Ana em Centro - N1' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('sem rede')
  })
})

describe('HistoryScreen load failure', () => {
  it('shows the error and lets "Recarregar" try again', async () => {
    const user = userEvent.setup()
    const listAll = vi
      .fn()
      .mockRejectedValueOnce(new Error('servidor fora do ar'))
      .mockResolvedValue([makeEntry()])
    vi.stubGlobal('api', makeApi({ assignments: { listAll } as unknown as IpcApi['assignments'] }))

    render(<HistoryScreen />)
    expect(await screen.findByRole('alert')).toHaveTextContent('servidor fora do ar')

    await user.click(screen.getByRole('button', { name: 'Recarregar' }))

    expect(await screen.findByRole('group', { name: 'Ana' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps showing an alert when "Recarregar" fails too', async () => {
    const user = userEvent.setup()
    const listAll = vi.fn().mockRejectedValue(new Error('servidor fora do ar'))
    vi.stubGlobal('api', makeApi({ assignments: { listAll } as unknown as IpcApi['assignments'] }))

    render(<HistoryScreen />)
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Recarregar' }))

    await waitFor(() => expect(listAll).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('alert')).toHaveTextContent('servidor fora do ar')
  })
})
