// The "Quadras" tab of the territory dialog. `window.api` is a fake stubbed
// with `vi.stubGlobal`, the same convention every screen test here follows.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Block, Territory } from '../../shared/models'
import { TerritoryBlocksTab } from './TerritoryBlocksTab'

const NOW = new Date(2026, 9, 17, 10)

function block(number: number, lastWorkedAt?: Date): Block {
  return { id: `b${number}`, number, polygon: [], lastWorkedAt }
}

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'territory-1',
    name: 'Vila Guarani - N13',
    boundary: [],
    blocks: [
      block(1, new Date(2026, 9, 9)),
      block(2),
      block(3, new Date(2026, 5, 7)),
      block(4, new Date(2026, 8, 8))
    ],
    assignedUser: { id: 'leader', name: 'Alisson' },
    ...overrides
  }
}

function stubApi(markWorked = vi.fn().mockResolvedValue({})): ReturnType<typeof vi.fn> {
  vi.stubGlobal('api', {
    workLogs: { markWorked, listFor: vi.fn().mockResolvedValue([]), delete: vi.fn() },
    publishers: { list: vi.fn().mockResolvedValue([]) },
    blocks: { update: vi.fn() }
  })
  return markWorked
}

function blockNumbers(): string[] {
  const table = screen.getByRole('table', { name: /quadras de/i })
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => (row as HTMLTableRowElement).cells[1].textContent ?? '')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TerritoryBlocksTab', () => {
  it('orders by number, or by longest without work with never-worked blocks first', async () => {
    stubApi()
    const user = userEvent.setup()

    render(<TerritoryBlocksTab territory={makeTerritory()} now={NOW} onChanged={vi.fn()} />)

    expect(blockNumbers()).toEqual(['1', '2', '3', '4'])
    await user.click(screen.getByRole('radio', { name: 'Mais tempo sem trabalho' }))
    expect(blockNumbers()).toEqual(['2', '3', '4', '1'])
  })

  it('says each status in words and how long ago the block was worked', () => {
    stubApi()

    render(<TerritoryBlocksTab territory={makeTerritory()} now={NOW} onChanged={vi.fn()} />)

    const rows = within(screen.getByRole('table', { name: /quadras de/i })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Em dia')
    expect(rows[1]).toHaveTextContent('há 8 dias')
    expect(rows[2]).toHaveTextContent('Nunca trabalhada')
    expect(rows[3]).toHaveTextContent('Vencida')
  })

  it('marks a single block in the name of the current leader, on the chosen date', async () => {
    const markWorked = stubApi()
    const onChanged = vi.fn()
    const user = userEvent.setup()

    render(<TerritoryBlocksTab territory={makeTerritory()} now={NOW} onChanged={onChanged} />)

    const date = screen.getByLabelText('Data do trabalho')
    await user.clear(date)
    await user.type(date, '2026-10-15')
    await user.click(screen.getByRole('button', { name: 'Marcar quadra 3 como trabalhada' }))

    await waitFor(() =>
      expect(markWorked).toHaveBeenCalledWith('b3', 'leader', new Date(2026, 9, 15))
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Quadra 3 marcada como trabalhada em nome de Alisson'
    )
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('marks every selected block, one request each, and clears the selection', async () => {
    const markWorked = stubApi()
    const user = userEvent.setup()

    render(<TerritoryBlocksTab territory={makeTerritory()} now={NOW} onChanged={vi.fn()} />)

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar quadra 2' }))
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar quadra 4' }))
    await user.click(screen.getByRole('button', { name: 'Marcar 2 selecionadas' }))

    await waitFor(() => expect(markWorked).toHaveBeenCalledTimes(2))
    expect(markWorked.mock.calls.map((call) => call[0])).toEqual(['b2', 'b4'])
    expect(await screen.findByRole('status')).toHaveTextContent('Quadras 2 e 4 marcadas')
    expect(screen.getByRole('checkbox', { name: 'Selecionar quadra 2' })).not.toBeChecked()
  })

  it('"select all" picks every block', async () => {
    stubApi()
    const user = userEvent.setup()

    render(<TerritoryBlocksTab territory={makeTerritory()} now={NOW} onChanged={vi.fn()} />)
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar todas as quadras' }))

    expect(screen.getByRole('button', { name: 'Marcar 4 selecionadas' })).toBeEnabled()
  })

  it('says which blocks made it when one request in a batch fails', async () => {
    const markWorked = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Data no futuro.'))
    stubApi(markWorked)
    const onChanged = vi.fn()
    const user = userEvent.setup()

    render(<TerritoryBlocksTab territory={makeTerritory()} now={NOW} onChanged={onChanged} />)
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar todas as quadras' }))
    await user.click(screen.getByRole('button', { name: 'Marcar 4 selecionadas' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Data no futuro. Já marcadas: 1.')
    expect(markWorked).toHaveBeenCalledTimes(2)
    // What did get recorded still has to show up on the map.
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('offers no marking when the territory has no leader', () => {
    stubApi()

    render(
      <TerritoryBlocksTab
        territory={makeTerritory({ assignedUser: undefined })}
        now={NOW}
        onChanged={vi.fn()}
      />
    )

    expect(screen.getByText(/sem dirigente/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marcar quadra 1 como trabalhada' })).toBeDisabled()
  })

  it('refuses a date in the future', async () => {
    stubApi()
    const user = userEvent.setup()

    render(<TerritoryBlocksTab territory={makeTerritory()} now={NOW} onChanged={vi.fn()} />)
    const date = screen.getByLabelText('Data do trabalho')
    await user.clear(date)
    await user.type(date, '2026-10-20')

    expect(screen.getByText(/não pode ficar vazia nem estar no futuro/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marcar quadra 1 como trabalhada' })).toBeDisabled()
  })

  it('opens the history of a block, where someone else can be recorded', async () => {
    stubApi()
    const user = userEvent.setup()

    render(<TerritoryBlocksTab territory={makeTerritory()} now={NOW} onChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Histórico da quadra 2' }))

    expect(screen.getByRole('region', { name: 'Trabalho da quadra 2' })).toBeInTheDocument()
    expect(await screen.findByText('Esta quadra nunca foi trabalhada.')).toBeInTheDocument()
  })

  it('explains what to do when the territory has no blocks yet', () => {
    stubApi()

    render(
      <TerritoryBlocksTab territory={makeTerritory({ blocks: [] })} now={NOW} onChanged={vi.fn()} />
    )

    expect(screen.getByText(/ainda não tem quadras/i)).toBeInTheDocument()
  })
})
