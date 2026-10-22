import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BlockWorkPanel } from './BlockWorkPanel'
import type { Block, Publisher, Territory, WorkLog } from '../../shared/models'
import type { IpcApi } from '../../shared/ipc-contract'

// Mirrors the component's own formatting so the assertions do not hardcode a
// timezone-dependent literal -- same approach `BlockHistorySheet.test.tsx`
// already takes.
function expectedDateTime(moment: Date): string {
  const two = (value: number): string => value.toString().padStart(2, '0')
  return `${two(moment.getDate())}/${two(moment.getMonth() + 1)}/${moment.getFullYear()} ${two(moment.getHours())}:${two(moment.getMinutes())}`
}

const PUBLISHER: Publisher = { id: 'pub-1', name: 'Maria Souza', isActive: true }
const OTHER_PUBLISHER: Publisher = { id: 'pub-2', name: 'João Lima', isActive: true }

const TERRITORY: Territory = {
  id: 'territory-1',
  name: 'Setor Norte',
  boundary: [],
  blocks: [],
  assignedUser: { id: PUBLISHER.id, name: PUBLISHER.name }
}

const BLOCK: Block = { id: 'block-1', number: 12, polygon: [] }

const TODAY = new Date(2026, 7, 20, 10, 0, 0)

function makeLog(overrides: Partial<WorkLog> = {}): WorkLog {
  return {
    id: 'log-1',
    blockId: BLOCK.id,
    publisher: { id: PUBLISHER.id, name: PUBLISHER.name },
    workedAt: new Date(2026, 7, 1, 13, 5, 0),
    createdAt: new Date(2026, 7, 1, 13, 5, 0),
    ...overrides
  }
}

interface FakeApi {
  listFor: ReturnType<typeof vi.fn>
  markWorked: ReturnType<typeof vi.fn>
  deleteLog: ReturnType<typeof vi.fn>
  updateBlock: ReturnType<typeof vi.fn>
  listPublishers: ReturnType<typeof vi.fn>
}

function installApi(overrides: Partial<FakeApi> = {}): FakeApi {
  const api: FakeApi = {
    listFor: vi.fn(async () => [] as WorkLog[]),
    markWorked: vi.fn(async () => makeLog()),
    deleteLog: vi.fn(async () => undefined),
    updateBlock: vi.fn(async () => BLOCK),
    listPublishers: vi.fn(async () => [PUBLISHER, OTHER_PUBLISHER]),
    ...overrides
  }
  window.api = {
    workLogs: {
      listFor: api.listFor,
      markWorked: api.markWorked,
      delete: api.deleteLog
    },
    blocks: {
      create: vi.fn(),
      update: api.updateBlock,
      delete: vi.fn()
    },
    publishers: {
      list: api.listPublishers,
      create: vi.fn(),
      regenerateCode: vi.fn(),
      rename: vi.fn(),
      setActive: vi.fn(),
      delete: vi.fn()
    }
  } as unknown as IpcApi
  return api
}

beforeEach(() => {
  installApi()
})

function renderPanel(props: { block?: Block; onChanged?: () => void } = {}): {
  onChanged: ReturnType<typeof vi.fn>
} {
  const onChanged = vi.fn()
  render(
    <BlockWorkPanel
      territory={TERRITORY}
      block={props.block ?? BLOCK}
      now={TODAY}
      onChanged={props.onChanged ?? onChanged}
    />
  )
  return { onChanged }
}

describe('BlockWorkPanel — histórico', () => {
  it('lists each work log with its publisher and date', async () => {
    const first = makeLog({ id: 'log-1', workedAt: new Date(2026, 7, 10, 9, 30, 0) })
    const second = makeLog({
      id: 'log-2',
      publisher: { id: OTHER_PUBLISHER.id, name: OTHER_PUBLISHER.name },
      workedAt: new Date(2026, 6, 2, 15, 0, 0)
    })
    const api = installApi({ listFor: vi.fn(async () => [first, second]) })

    renderPanel()

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument()
    expect(screen.getByText('João Lima')).toBeInTheDocument()
    expect(screen.getByText(expectedDateTime(first.workedAt))).toBeInTheDocument()
    expect(screen.getByText(expectedDateTime(second.workedAt))).toBeInTheDocument()
    expect(api.listFor).toHaveBeenCalledWith(BLOCK.id)
  })

  it('keeps the order the server sent, most recent first', async () => {
    const newest = makeLog({ id: 'log-1', workedAt: new Date(2026, 7, 10, 9, 30, 0) })
    const oldest = makeLog({
      id: 'log-2',
      publisher: { id: OTHER_PUBLISHER.id, name: OTHER_PUBLISHER.name },
      workedAt: new Date(2026, 6, 2, 15, 0, 0)
    })
    installApi({ listFor: vi.fn(async () => [newest, oldest]) })

    renderPanel()

    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Maria Souza')
    expect(items[1]).toHaveTextContent('João Lima')
  })

  it('shows its own message when the block was never worked', async () => {
    renderPanel()

    expect(await screen.findByText('Esta quadra nunca foi trabalhada.')).toBeInTheDocument()
  })

  it('notes a record that reached the server well after it was worked', async () => {
    const log = makeLog({
      workedAt: new Date(2026, 7, 1, 13, 0, 0),
      createdAt: new Date(2026, 7, 1, 13, 30, 0)
    })
    installApi({ listFor: vi.fn(async () => [log]) })

    renderPanel()

    expect(
      await screen.findByText(new RegExp(`sincronizado em ${expectedDateTime(log.createdAt)}`))
    ).toBeInTheDocument()
  })

  it('does not note a record that reached the server on time', async () => {
    const log = makeLog({
      workedAt: new Date(2026, 7, 1, 13, 0, 0),
      createdAt: new Date(2026, 7, 1, 13, 0, 30)
    })
    installApi({ listFor: vi.fn(async () => [log]) })

    renderPanel()

    await screen.findByText('Maria Souza')
    expect(screen.queryByText(/sincronizado em/)).not.toBeInTheDocument()
  })

  it('shows the failure when the history cannot be loaded', async () => {
    installApi({ listFor: vi.fn(async () => Promise.reject(new Error('sem rede'))) })

    renderPanel()

    expect(await screen.findByRole('alert')).toHaveTextContent('sem rede')
  })
})

describe('BlockWorkPanel — adicionar registro', () => {
  it('preselects the publisher the territory is assigned to', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText('Esta quadra nunca foi trabalhada.')

    await user.click(screen.getByRole('button', { name: /adicionar registro/i }))

    expect(await screen.findByRole('option', { name: 'Maria Souza' })).toHaveProperty(
      'selected',
      true
    )
  })

  it('records the chosen publisher and date, reloads and reports the change', async () => {
    const user = userEvent.setup()
    const api = installApi()
    const { onChanged } = renderPanel()
    await screen.findByText('Esta quadra nunca foi trabalhada.')

    await user.click(screen.getByRole('button', { name: /adicionar registro/i }))
    await screen.findByRole('option', { name: 'João Lima' })
    await user.selectOptions(screen.getByLabelText('Publicador'), OTHER_PUBLISHER.id)
    await user.click(screen.getByRole('button', { name: 'Marcar' }))

    expect(api.markWorked).toHaveBeenCalledWith(BLOCK.id, OTHER_PUBLISHER.id, new Date(2026, 7, 20))
    expect(api.listFor).toHaveBeenCalledTimes(2)
    expect(onChanged).toHaveBeenCalled()
  })

  it('closes the form without recording anything when the admin cancels', async () => {
    const user = userEvent.setup()
    const api = installApi()
    const { onChanged } = renderPanel()
    await screen.findByText('Esta quadra nunca foi trabalhada.')

    await user.click(screen.getByRole('button', { name: /adicionar registro/i }))
    await screen.findByRole('option', { name: 'Maria Souza' })
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(api.markWorked).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /adicionar registro/i })).toBeInTheDocument()
  })

  it('shows the failure and does not report a change when the marking is refused', async () => {
    const user = userEvent.setup()
    const api = installApi({
      markWorked: vi.fn(async () => Promise.reject(new Error('data no futuro')))
    })
    const { onChanged } = renderPanel()
    await screen.findByText('Esta quadra nunca foi trabalhada.')

    await user.click(screen.getByRole('button', { name: /adicionar registro/i }))
    await screen.findByRole('option', { name: 'Maria Souza' })
    await user.click(screen.getByRole('button', { name: 'Marcar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('data no futuro')
    expect(api.markWorked).toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('BlockWorkPanel — apagar registro', () => {
  it('asks for confirmation naming the publisher and the date', async () => {
    const user = userEvent.setup()
    const log = makeLog()
    installApi({ listFor: vi.fn(async () => [log]) })
    renderPanel()

    await user.click(await screen.findByRole('button', { name: /apagar registro/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Maria Souza')
    expect(dialog).toHaveTextContent(expectedDateTime(log.workedAt))
  })

  it('does not delete anything when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const api = installApi({ listFor: vi.fn(async () => [makeLog()]) })
    const { onChanged } = renderPanel()

    await user.click(await screen.findByRole('button', { name: /apagar registro/i }))
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(api.deleteLog).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('deletes, reloads and reports the change once confirmed', async () => {
    const user = userEvent.setup()
    const api = installApi({ listFor: vi.fn(async () => [makeLog()]) })
    const { onChanged } = renderPanel()

    await user.click(await screen.findByRole('button', { name: /apagar registro/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Apagar' }))

    expect(api.deleteLog).toHaveBeenCalledWith('log-1')
    expect(api.listFor).toHaveBeenCalledTimes(2)
    expect(onChanged).toHaveBeenCalled()
  })

  it('shows the failure when the deletion is refused', async () => {
    const user = userEvent.setup()
    installApi({
      listFor: vi.fn(async () => [makeLog()]),
      deleteLog: vi.fn(async () => Promise.reject(new Error('não deu')))
    })
    const { onChanged } = renderPanel()

    await user.click(await screen.findByRole('button', { name: /apagar registro/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Apagar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('não deu')
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('BlockWorkPanel — status forçado', () => {
  it('shows "Automático" when the block has no forced status', async () => {
    renderPanel()

    const control = (await screen.findByLabelText('Status da quadra')) as HTMLSelectElement
    expect(control.value).toBe('auto')
  })

  it('shows the option matching the forced status the block already carries', async () => {
    renderPanel({ block: { ...BLOCK, statusOverride: 'never' } })

    const control = (await screen.findByLabelText('Status da quadra')) as HTMLSelectElement
    expect(control.value).toBe('never')
  })

  it('forces the block overdue and reports the change', async () => {
    const user = userEvent.setup()
    const api = installApi()
    const { onChanged } = renderPanel()

    await user.selectOptions(await screen.findByLabelText('Status da quadra'), 'overdue')

    expect(api.updateBlock).toHaveBeenCalledWith(BLOCK.id, { statusOverride: 'overdue' })
    expect(onChanged).toHaveBeenCalled()
  })

  it('forces the block to never worked and reports the change', async () => {
    const user = userEvent.setup()
    const api = installApi()
    const { onChanged } = renderPanel()

    await user.selectOptions(await screen.findByLabelText('Status da quadra'), 'never')

    expect(api.updateBlock).toHaveBeenCalledWith(BLOCK.id, { statusOverride: 'never' })
    expect(onChanged).toHaveBeenCalled()
  })

  it('gives the block back to the automatic colour and reports the change', async () => {
    const user = userEvent.setup()
    const api = installApi()
    const { onChanged } = renderPanel({ block: { ...BLOCK, statusOverride: 'overdue' } })

    await user.selectOptions(await screen.findByLabelText('Status da quadra'), 'auto')

    expect(api.updateBlock).toHaveBeenCalledWith(BLOCK.id, { statusOverride: null })
    expect(onChanged).toHaveBeenCalled()
  })

  it('says what the forced colour does and what undoes it', async () => {
    renderPanel()

    const note = await screen.findByText(/primeiro registro de trabalho/i)
    expect(note).toHaveTextContent(/autom/i)
    expect(screen.getByText(/celular do publicador/i)).toBeInTheDocument()
  })

  it('shows the failure and keeps the previous option when the change is refused', async () => {
    const user = userEvent.setup()
    installApi({ updateBlock: vi.fn(async () => Promise.reject(new Error('recusado'))) })
    const { onChanged } = renderPanel()

    const control = (await screen.findByLabelText('Status da quadra')) as HTMLSelectElement
    await user.selectOptions(control, 'never')

    expect(await screen.findByRole('alert')).toHaveTextContent('recusado')
    expect(control.value).toBe('auto')
    expect(onChanged).not.toHaveBeenCalled()
  })
})
