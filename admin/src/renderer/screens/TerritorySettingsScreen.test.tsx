// The territory's settings page (spec 0009, Task 09): name, rotation, a
// read-only summary and the delete action. `window.api` is never the real
// IPC bridge here -- a fake stubbed with `vi.stubGlobal` stands in, per the
// convention every other renderer test already follows.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { IpcApi } from '../../shared/ipc-contract'
import type { Block, Territory } from '../../shared/models'
import { TerritorySettingsScreen } from './TerritorySettingsScreen'

const NOW = new Date('2026-08-19T12:00:00')

/** `daysAgo` days before {@link NOW} -- how every fixture below dates a visit. */
function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    number: 1,
    polygon: [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 }
    ],
    ...overrides
  }
}

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'territory-1',
    name: 'Centro - N5',
    boundary: [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 }
    ],
    blocks: [],
    ...overrides
  }
}

function makeApi(overrides: Partial<IpcApi['territories']> = {}): IpcApi {
  return {
    territories: {
      listWithBlocks: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(makeTerritory()),
      delete: vi.fn().mockResolvedValue(undefined),
      ...overrides
    }
  } as unknown as IpcApi
}

beforeEach(() => {
  vi.stubGlobal('api', makeApi())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('TerritorySettingsScreen fields', () => {
  it('shows the territory current name in the name field', () => {
    render(
      <TerritorySettingsScreen territory={makeTerritory({ name: 'Bairro Sul - N7' })} now={NOW} />
    )

    expect(screen.getByLabelText(/nome do território/i)).toHaveValue('Bairro Sul - N7')
  })

  it('shows the territory current rotation in the rotation field', () => {
    render(<TerritorySettingsScreen territory={makeTerritory({ rotationDays: 45 })} now={NOW} />)

    expect(screen.getByLabelText(/tempo de rotação/i)).toHaveValue('45')
  })

  it('leaves the rotation field empty and spells out the default when the territory has none', () => {
    render(<TerritorySettingsScreen territory={makeTerritory()} now={NOW} />)

    expect(screen.getByLabelText(/tempo de rotação/i)).toHaveValue('')
    // Written on screen, not only in the code: an empty field otherwise
    // reads as something forgotten rather than as a deliberate default.
    expect(screen.getByText(/vazio.*padrão de 120 dias/i)).toBeInTheDocument()
  })
})

describe('TerritorySettingsScreen saving', () => {
  it('saves the edited name through territories.update', async () => {
    const update = vi.fn().mockResolvedValue(makeTerritory())
    vi.stubGlobal('api', makeApi({ update }))
    const user = userEvent.setup()

    render(<TerritorySettingsScreen territory={makeTerritory({ rotationDays: 45 })} now={NOW} />)

    const nameField = screen.getByLabelText(/nome do território/i)
    await user.clear(nameField)
    await user.type(nameField, 'Bairro Sul - N7')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('territory-1', {
        name: 'Bairro Sul - N7',
        rotationDays: 45
      })
    )
  })

  it('sends the typed number as rotationDays', async () => {
    const update = vi.fn().mockResolvedValue(makeTerritory())
    vi.stubGlobal('api', makeApi({ update }))
    const user = userEvent.setup()

    render(<TerritorySettingsScreen territory={makeTerritory()} now={NOW} />)

    await user.type(screen.getByLabelText(/tempo de rotação/i), '60')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('territory-1', {
        name: 'Centro - N5',
        rotationDays: 60
      })
    )
  })

  it('sends rotationDays: null when the rotation field is cleared', async () => {
    const update = vi.fn().mockResolvedValue(makeTerritory())
    vi.stubGlobal('api', makeApi({ update }))
    const user = userEvent.setup()

    render(<TerritorySettingsScreen territory={makeTerritory({ rotationDays: 45 })} now={NOW} />)

    await user.clear(screen.getByLabelText(/tempo de rotação/i))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('territory-1', {
        name: 'Centro - N5',
        rotationDays: null
      })
    )
  })

  it.each([
    ['zero', '0'],
    ['a negative number', '-5'],
    ['text', 'trinta'],
    ['a fraction', '2,5']
  ])('refuses %s in the rotation field before calling the API', async (_label, typed) => {
    const update = vi.fn().mockResolvedValue(makeTerritory())
    vi.stubGlobal('api', makeApi({ update }))
    const user = userEvent.setup()

    render(<TerritorySettingsScreen territory={makeTerritory()} now={NOW} />)

    await user.type(screen.getByLabelText(/tempo de rotação/i), typed)
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /número inteiro de dias maior que zero/i
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a blank name before calling the API', async () => {
    const update = vi.fn().mockResolvedValue(makeTerritory())
    vi.stubGlobal('api', makeApi({ update }))
    const user = userEvent.setup()

    render(<TerritorySettingsScreen territory={makeTerritory()} now={NOW} />)

    await user.clear(screen.getByLabelText(/nome do território/i))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/nome.*não pode ficar em branco/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('shows a refusal coming from the API instead of losing it', async () => {
    const update = vi.fn().mockRejectedValue(new Error('O território já foi apagado.'))
    vi.stubGlobal('api', makeApi({ update }))
    const user = userEvent.setup()

    render(<TerritorySettingsScreen territory={makeTerritory()} now={NOW} />)

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('O território já foi apagado.')
  })
})

describe('TerritorySettingsScreen summary', () => {
  const blocks = [
    makeBlock({ id: 'b1', number: 1, lastWorkedAt: daysAgo(10) }),
    makeBlock({ id: 'b2', number: 2, lastWorkedAt: daysAgo(45) }),
    makeBlock({ id: 'b3', number: 3, lastWorkedAt: daysAgo(200) }),
    makeBlock({ id: 'b4', number: 4 })
  ]

  it('counts the blocks and the overdue ones against the territory rotation', () => {
    render(
      <TerritorySettingsScreen territory={makeTerritory({ blocks, rotationDays: 30 })} now={NOW} />
    )

    expect(screen.getByText('Quadras')).toBeInTheDocument()
    expect(screen.getByTestId('summary-block-count')).toHaveTextContent('4')
    // 45 and 200 days ago are both past a 30-day rotation; 10 days ago is not,
    // and the never-worked one is counted on its own line.
    expect(screen.getByTestId('summary-overdue-count')).toHaveTextContent('2')
    expect(screen.getByTestId('summary-never-count')).toHaveTextContent('1')
  })

  it('counts the overdue ones against the default rotation when the territory has none', () => {
    render(<TerritorySettingsScreen territory={makeTerritory({ blocks })} now={NOW} />)

    // Only the 200-day-old one is past the default 120-day rotation.
    expect(screen.getByTestId('summary-overdue-count')).toHaveTextContent('1')
    expect(screen.getByTestId('summary-never-count')).toHaveTextContent('1')
  })

  it('names the designated publisher, and says "Nenhum" when there is none', () => {
    const { unmount } = render(
      <TerritorySettingsScreen
        territory={makeTerritory({ assignedUser: { id: 'pub-1', name: 'Maria Souza' } })}
        now={NOW}
      />
    )
    expect(screen.getByTestId('summary-assigned-user')).toHaveTextContent('Maria Souza')
    unmount()

    render(<TerritorySettingsScreen territory={makeTerritory()} now={NOW} />)
    expect(screen.getByTestId('summary-assigned-user')).toHaveTextContent('Nenhum')
  })

  it('shows the most recent visit recorded in the territory', () => {
    render(
      <TerritorySettingsScreen
        territory={makeTerritory({
          blocks: [
            makeBlock({ id: 'b1', number: 1, lastWorkedAt: new Date('2026-07-01T09:00:00') }),
            makeBlock({ id: 'b2', number: 2, lastWorkedAt: new Date('2026-08-10T09:00:00') })
          ]
        })}
        now={NOW}
      />
    )

    expect(screen.getByTestId('summary-last-visit')).toHaveTextContent('10/08/2026')
  })

  it('says the territory was never worked when no block has a visit', () => {
    render(
      <TerritorySettingsScreen territory={makeTerritory({ blocks: [makeBlock()] })} now={NOW} />
    )

    expect(screen.getByTestId('summary-last-visit')).toHaveTextContent('Nunca trabalhada')
  })
})

describe('TerritorySettingsScreen deleting', () => {
  it('asks for confirmation, deletes and reports back when the admin confirms', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const deleteTerritory = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('api', makeApi({ delete: deleteTerritory }))
    const onDeleted = vi.fn()
    const user = userEvent.setup()

    render(
      <TerritorySettingsScreen
        territory={makeTerritory({ name: 'Bairro Sul - N7', blocks: [makeBlock()] })}
        now={NOW}
        onDeleted={onDeleted}
      />
    )

    await user.click(screen.getByRole('button', { name: /apagar território/i }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    // The same warning `HomeScreen` shows, reused rather than retyped: the
    // blocks and their whole work history go with the territory.
    const message = confirmSpy.mock.calls[0]?.[0] as string
    expect(message).toContain('Bairro Sul - N7')
    expect(message).toMatch(/histórico de trabalho/i)
    await waitFor(() => expect(deleteTerritory).toHaveBeenCalledWith('territory-1'))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
  })

  it('does not delete anything when the admin cancels the confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const deleteTerritory = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('api', makeApi({ delete: deleteTerritory }))
    const onDeleted = vi.fn()
    const user = userEvent.setup()

    render(<TerritorySettingsScreen territory={makeTerritory()} now={NOW} onDeleted={onDeleted} />)

    await user.click(screen.getByRole('button', { name: /apagar território/i }))

    expect(deleteTerritory).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('shows a failed deletion on screen and stays put', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const deleteTerritory = vi.fn().mockRejectedValue(new Error('O território não existe mais.'))
    vi.stubGlobal('api', makeApi({ delete: deleteTerritory }))
    const onDeleted = vi.fn()
    const user = userEvent.setup()

    render(<TerritorySettingsScreen territory={makeTerritory()} now={NOW} onDeleted={onDeleted} />)

    await user.click(screen.getByRole('button', { name: /apagar território/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('O território não existe mais.')
    expect(onDeleted).not.toHaveBeenCalled()
  })
})
