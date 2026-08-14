import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BlockHistorySheet } from './BlockHistorySheet'
import type { Block, Territory, WorkLog } from '../../shared/models'
import type { IpcApi } from '../../shared/ipc-contract'

// Mirrors the component's own formatting so assertions do not hardcode a
// timezone-dependent string literal -- both sides derive the same text from
// the same `Date`, using local time (matching how a desktop app should show
// a moment: in whatever timezone the machine is set to).
function expectedDateTime(moment: Date): string {
  const two = (value: number): string => value.toString().padStart(2, '0')
  return `${two(moment.getDate())}/${two(moment.getMonth() + 1)}/${moment.getFullYear()} ${two(moment.getHours())}:${two(moment.getMinutes())}`
}

const TERRITORY: Territory = {
  id: 'territory-1',
  name: 'Setor Norte',
  boundary: [],
  blocks: []
}

const BLOCK: Block = {
  id: 'block-1',
  number: 12,
  polygon: []
}

function makeLog(overrides: Partial<WorkLog> = {}): WorkLog {
  return {
    id: 'log-1',
    blockId: BLOCK.id,
    publisher: { id: 'pub-1', name: 'Maria Souza' },
    workedAt: new Date('2026-08-01T13:05:00'),
    createdAt: new Date('2026-08-01T13:05:00'),
    ...overrides
  }
}

/** A fake covering every member of `IpcApi.workLogs` -- the only namespace this screen calls. */
function fakeWorkLogsApi(overrides: Partial<IpcApi['workLogs']> = {}): IpcApi['workLogs'] {
  return {
    listFor: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    ...overrides
  }
}

beforeEach(() => {
  window.api = { workLogs: fakeWorkLogsApi() } as unknown as IpcApi
})

describe('BlockHistorySheet', () => {
  it('shows a loading state while the work logs load', async () => {
    let resolveList: (logs: WorkLog[]) => void = () => {}
    const listFor = vi.fn(
      () =>
        new Promise<WorkLog[]>((resolve) => {
          resolveList = resolve
        })
    )
    window.api = { workLogs: fakeWorkLogsApi({ listFor }) } as unknown as IpcApi

    render(<BlockHistorySheet territory={TERRITORY} block={BLOCK} />)

    expect(screen.getByText(/carregando/i)).toBeInTheDocument()

    resolveList([])
    expect(await screen.findByText('Esta quadra nunca foi trabalhada.')).toBeInTheDocument()
  })

  it('shows the empty state message when the block was never worked', async () => {
    window.api = {
      workLogs: fakeWorkLogsApi({ listFor: vi.fn(async () => []) })
    } as unknown as IpcApi

    render(<BlockHistorySheet territory={TERRITORY} block={BLOCK} />)

    expect(await screen.findByText('Esta quadra nunca foi trabalhada.')).toBeInTheDocument()
  })

  it('shows the publisher name and the worked-at date for each log', async () => {
    const log = makeLog({ publisher: { id: 'pub-1', name: 'Maria Souza' } })
    window.api = {
      workLogs: fakeWorkLogsApi({ listFor: vi.fn(async () => [log]) })
    } as unknown as IpcApi

    render(<BlockHistorySheet territory={TERRITORY} block={BLOCK} />)

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument()
    expect(screen.getByText(expectedDateTime(log.workedAt))).toBeInTheDocument()
  })

  it('shows a "synced late" note when the record reached the server well after it was worked', async () => {
    const log = makeLog({
      workedAt: new Date('2026-08-01T13:00:00'),
      createdAt: new Date('2026-08-01T13:30:00') // 30 minutes later -- past the 5-minute threshold
    })
    window.api = {
      workLogs: fakeWorkLogsApi({ listFor: vi.fn(async () => [log]) })
    } as unknown as IpcApi

    render(<BlockHistorySheet territory={TERRITORY} block={BLOCK} />)

    expect(
      await screen.findByText(new RegExp(`sincronizado em ${expectedDateTime(log.createdAt)}`))
    ).toBeInTheDocument()
  })

  it('does not show a "synced late" note when the record reached the server on time', async () => {
    const log = makeLog({
      workedAt: new Date('2026-08-01T13:00:00'),
      createdAt: new Date('2026-08-01T13:00:30') // 30 seconds later -- well under the threshold
    })
    window.api = {
      workLogs: fakeWorkLogsApi({ listFor: vi.fn(async () => [log]) })
    } as unknown as IpcApi

    render(<BlockHistorySheet territory={TERRITORY} block={BLOCK} />)

    await screen.findByText('Maria Souza')
    expect(screen.queryByText(/sincronizado em/)).not.toBeInTheDocument()
  })

  it('shows a visible error message when loading the history fails', async () => {
    const listFor = vi.fn(async () => {
      throw new Error('O servidor não respondeu.')
    })
    window.api = { workLogs: fakeWorkLogsApi({ listFor }) } as unknown as IpcApi

    render(<BlockHistorySheet territory={TERRITORY} block={BLOCK} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('O servidor não respondeu.')
  })

  it('falls back to a generic error message when loading fails without an Error message', async () => {
    // A rejection that is not an `Error` -- exercising the fallback path on purpose.
    const listFor = vi.fn(async () => {
      throw 'boom'
    })
    window.api = { workLogs: fakeWorkLogsApi({ listFor }) } as unknown as IpcApi

    render(<BlockHistorySheet territory={TERRITORY} block={BLOCK} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o histórico.'
    )
  })

  it('asks for confirmation naming the publisher and the date before removing a record', async () => {
    const user = userEvent.setup()
    const log = makeLog({ publisher: { id: 'pub-1', name: 'Maria Souza' } })
    const deleteFn = vi.fn(async () => undefined)
    window.api = {
      workLogs: fakeWorkLogsApi({ listFor: vi.fn(async () => [log]), delete: deleteFn })
    } as unknown as IpcApi

    render(<BlockHistorySheet territory={TERRITORY} block={BLOCK} />)
    await screen.findByText('Maria Souza')

    await user.click(screen.getByRole('button', { name: /remover registro de maria souza/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/maria souza/i)).toBeInTheDocument()
    expect(
      within(dialog).getByText(new RegExp(expectedDateTime(log.workedAt).replace('/', '\\/')))
    ).toBeInTheDocument()
    expect(deleteFn).not.toHaveBeenCalled()
  })

  it('does not call workLogs.delete when the removal is cancelled', async () => {
    const user = userEvent.setup()
    const log = makeLog()
    const deleteFn = vi.fn(async () => undefined)
    window.api = {
      workLogs: fakeWorkLogsApi({ listFor: vi.fn(async () => [log]), delete: deleteFn })
    } as unknown as IpcApi

    render(<BlockHistorySheet territory={TERRITORY} block={BLOCK} />)
    await screen.findByText('Maria Souza')
    await user.click(screen.getByRole('button', { name: /remover registro de maria souza/i }))
    const dialog = await screen.findByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteFn).not.toHaveBeenCalled()
  })

  it('deletes the log, reloads the list and calls onWorkLogDeleted when confirmed', async () => {
    const user = userEvent.setup()
    const log = makeLog({ id: 'log-1' })
    const listFor = vi.fn(async () => [log])
    listFor.mockResolvedValueOnce([log]).mockResolvedValueOnce([])
    const deleteFn = vi.fn(async () => undefined)
    const onWorkLogDeleted = vi.fn()
    window.api = { workLogs: fakeWorkLogsApi({ listFor, delete: deleteFn }) } as unknown as IpcApi

    render(
      <BlockHistorySheet territory={TERRITORY} block={BLOCK} onWorkLogDeleted={onWorkLogDeleted} />
    )
    await screen.findByText('Maria Souza')
    await user.click(screen.getByRole('button', { name: /remover registro de maria souza/i }))
    const dialog = await screen.findByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: 'Remover' }))

    expect(deleteFn).toHaveBeenCalledWith('log-1')
    expect(await screen.findByText('Esta quadra nunca foi trabalhada.')).toBeInTheDocument()
    expect(listFor).toHaveBeenCalledTimes(2)
    expect(onWorkLogDeleted).toHaveBeenCalledTimes(1)
  })

  it('shows a visible error message and does not call onWorkLogDeleted when removal fails', async () => {
    const user = userEvent.setup()
    const log = makeLog()
    const deleteFn = vi.fn(async () => {
      throw new Error('Não foi possível remover agora.')
    })
    const onWorkLogDeleted = vi.fn()
    window.api = {
      workLogs: fakeWorkLogsApi({ listFor: vi.fn(async () => [log]), delete: deleteFn })
    } as unknown as IpcApi

    render(
      <BlockHistorySheet territory={TERRITORY} block={BLOCK} onWorkLogDeleted={onWorkLogDeleted} />
    )
    await screen.findByText('Maria Souza')
    await user.click(screen.getByRole('button', { name: /remover registro de maria souza/i }))
    const dialog = await screen.findByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: 'Remover' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível remover agora.')
    expect(onWorkLogDeleted).not.toHaveBeenCalled()
  })
})
