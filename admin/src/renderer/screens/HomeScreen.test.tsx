// Ports `admin/lib/presentation/home_screen.dart` (removed Flutter admin) to
// React. `window.api` is never the real IPC bridge here -- a fake stubbed
// with `vi.stubGlobal` stands in, per the spec 0003 convention already used
// by `session.test.ts` and `api-client.test.ts`.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcApi } from '../../shared/ipc-contract'
import type { Block, Publisher, Territory } from '../../shared/models'
import { HomeScreen } from './HomeScreen'

// The real TerritoryMap pulls in react-leaflet, which needs a real DOM layout
// jsdom does not provide. HomeScreen's own job -- the header, the territory
// list, the confirmations, the error handling -- does not depend on how the
// map draws a block, only on the `onBlockTap` callback it receives. Task 09
// is what verifies the map itself; this stub exposes the same prop shape so
// a test can simulate a tap without a real Leaflet layout.
vi.mock('../map/TerritoryMap', () => ({
  TerritoryMap: ({
    territories,
    onBlockTap
  }: {
    territories: Territory[]
    onBlockTap?: (territory: Territory, block: Block) => void
  }) => (
    <div data-testid="fake-map">
      {territories.flatMap((territory) =>
        territory.blocks.map((block) => (
          <button key={block.id} onClick={() => onBlockTap?.(territory, block)}>
            {`Quadra ${block.number}`}
          </button>
        ))
      )}
    </div>
  )
}))

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

function makeApi(overrides: Partial<IpcApi> = {}): IpcApi {
  return {
    session: {
      isConfigured: vi.fn(),
      configure: vi.fn(),
      signOut: vi.fn().mockResolvedValue(undefined),
      getCongregation: vi.fn(),
      ...overrides.session
    },
    territories: {
      listWithBlocks: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      ...overrides.territories
    },
    blocks: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
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
      delete: vi.fn(),
      ...overrides.assignments
    },
    exports: {
      assignments: vi.fn(),
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

describe('HomeScreen loading and header', () => {
  it('shows a loading state while the territories load, then removes it', async () => {
    const api = makeApi()
    vi.stubGlobal('api', api)

    render(<HomeScreen />)

    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/carregando/i)).not.toBeInTheDocument())
    expect(api.territories.listWithBlocks).toHaveBeenCalledTimes(1)
  })

  it('shows a generic title before the congregation is known, then the name and city once passed', async () => {
    const api = makeApi()
    vi.stubGlobal('api', api)

    const { rerender } = render(<HomeScreen />)
    await waitFor(() => expect(screen.queryByText(/carregando/i)).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Territory Map' })).toBeInTheDocument()

    rerender(<HomeScreen congregation={{ id: 'c1', name: 'Centro', city: 'Recife' }} />)

    expect(screen.getByRole('heading', { name: 'Centro — Recife' })).toBeInTheDocument()
  })

  it('shows a visible error message, not an unhandled rejection, when loading fails', async () => {
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockRejectedValue(new Error('Falha de rede.')),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<HomeScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de rede.')
  })

  it('falls back to a generic message when the rejection is not an Error', async () => {
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockRejectedValue('boom'),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<HomeScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível completar a operação.'
    )
  })

  it('shows an empty-state message when there are no territories yet', async () => {
    const api = makeApi()
    vi.stubGlobal('api', api)

    render(<HomeScreen />)

    expect(await screen.findByText(/nenhum território/i)).toBeInTheDocument()
  })
})

/** Opens a territory row's "⋮" options menu -- its three actions only render once it is open. */
async function openTerritoryMenu(
  user: ReturnType<typeof userEvent.setup>,
  territoryName: string
): Promise<void> {
  await user.click(
    await screen.findByRole('button', { name: new RegExp(`opções de ${territoryName}`, 'i') })
  )
}

describe('HomeScreen territory actions', () => {
  it('the "⋮" menu offers exactly four actions: add block, edit boundary, settings and delete territory', async () => {
    const territory = makeTerritory({ name: 'Bairro Sul' })
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    await openTerritoryMenu(user, 'Bairro Sul')

    const menu = await screen.findByRole('menu', { name: /opções de bairro sul/i })
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Adicionar quadra em Bairro Sul',
      'Editar demarcação de Bairro Sul',
      'Configurações de Bairro Sul',
      'Apagar território Bairro Sul'
    ])
  })

  it('asks the caller to open the settings of the territory whose menu was used', async () => {
    const territory = makeTerritory({ name: 'Bairro Sul' })
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()

    render(<HomeScreen onOpenSettings={onOpenSettings} />)
    await openTerritoryMenu(user, 'Bairro Sul')
    await user.click(await screen.findByRole('menuitem', { name: /configurações de bairro sul/i }))

    expect(onOpenSettings).toHaveBeenCalledWith(territory)
  })

  it('shows "Designado a {name}" on the territory row when a publisher is designated', async () => {
    const assigned = makeTerritory({
      name: 'Bairro Sul',
      assignedUser: { id: 'p1', name: 'Ana' }
    })
    const unassigned = makeTerritory({ id: 'territory-2', name: 'Centro' })
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([assigned, unassigned]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<HomeScreen />)

    expect(await screen.findByText('Designado a Ana')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    const centroRow = rows.find((row) => within(row).queryByText('Centro') !== null)
    expect(centroRow).toBeDefined()
    expect(within(centroRow as HTMLElement).queryByText(/designado a/i)).not.toBeInTheDocument()
  })

  it('"Novo território" signals the intent to create one, handing over the loaded territories', async () => {
    const territory = makeTerritory()
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const onNewTerritory = vi.fn()
    const user = userEvent.setup()

    render(<HomeScreen onNewTerritory={onNewTerritory} />)
    await user.click(await screen.findByRole('button', { name: /novo território/i }))

    expect(onNewTerritory).toHaveBeenCalledWith([territory])
  })

  it('"Adicionar quadra" on a territory row signals that territory', async () => {
    const territory = makeTerritory({ name: 'Bairro Sul' })
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const onAddBlock = vi.fn()
    const user = userEvent.setup()

    render(<HomeScreen onAddBlock={onAddBlock} />)
    await openTerritoryMenu(user, 'Bairro Sul')
    await user.click(await screen.findByRole('menuitem', { name: /adicionar quadra.*bairro sul/i }))

    expect(onAddBlock).toHaveBeenCalledWith(territory)
  })

  it('"Editar demarcação" on a territory row signals that territory and the full list', async () => {
    const territory = makeTerritory({ name: 'Bairro Sul' })
    const other = makeTerritory({ id: 'territory-2', name: 'Bairro Norte' })
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory, other]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const onEditTerritory = vi.fn()
    const user = userEvent.setup()

    render(<HomeScreen onEditTerritory={onEditTerritory} />)
    await openTerritoryMenu(user, 'Bairro Sul')
    await user.click(
      await screen.findByRole('menuitem', { name: /editar demarcação.*bairro sul/i })
    )

    // The list HomeScreen now hands over is alphabetically sorted (Task 02,
    // spec 0004), not the raw API order -- "Bairro Norte" sorts before
    // "Bairro Sul", even though the API resolved them the other way round.
    expect(onEditTerritory).toHaveBeenCalledWith(territory, [other, territory])
  })
})

describe('HomeScreen territory list ordering', () => {
  /** Reads the territory names in the order the `<li>` rows render them. */
  async function findRenderedTerritoryNames(): Promise<string[]> {
    const items = await screen.findAllByRole('listitem')
    return items.map((item) => item.querySelector('span')?.textContent ?? '')
  }

  it('renders territories in alphabetical order by name, regardless of the order the API returned', async () => {
    const territories = [
      makeTerritory({ id: 't-zona', name: 'Zona Sul' }),
      makeTerritory({ id: 't-bairro', name: 'Bairro Norte' }),
      makeTerritory({ id: 't-centro', name: 'Centro' })
    ]
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue(territories),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<HomeScreen />)

    expect(await findRenderedTerritoryNames()).toEqual(['Bairro Norte', 'Centro', 'Zona Sul'])
  })

  it('orders by territory number across different area names, not by the area name', async () => {
    // The real congregation data that exposed this: sorting by name put
    // "Próximo ao centro - N12" between "Centro - N6" and "Santa Helena - N 7".
    const territories = [
      makeTerritory({ id: 't-12', name: 'Próximo ao centro - N12' }),
      makeTerritory({ id: 't-6', name: 'Centro - N6' }),
      makeTerritory({ id: 't-7', name: 'Santa Helena - N 7' })
    ]
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue(territories),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<HomeScreen />)

    expect(await findRenderedTerritoryNames()).toEqual([
      'Centro - N6',
      'Santa Helena - N 7',
      'Próximo ao centro - N12'
    ])
  })

  it('sorts embedded numbers numerically, so "N 10" comes after "N 9" instead of after "N 1"', async () => {
    const territories = [
      makeTerritory({ id: 't-10', name: 'Santa Helena - N 10' }),
      makeTerritory({ id: 't-7', name: 'Santa Helena - N 7' }),
      makeTerritory({ id: 't-9', name: 'Santa Helena - N 9' })
    ]
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue(territories),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<HomeScreen />)

    expect(await findRenderedTerritoryNames()).toEqual([
      'Santa Helena - N 7',
      'Santa Helena - N 9',
      'Santa Helena - N 10'
    ])
  })

  it('sorts ignoring case and accents, so accented and plain variants of a name land next to each other', async () => {
    const territories = [
      makeTerritory({ id: 't-arvore-plain', name: 'arvore' }),
      makeTerritory({ id: 't-banana', name: 'Banana' }),
      makeTerritory({ id: 't-arvore-accent', name: 'Árvore' })
    ]
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue(territories),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<HomeScreen />)

    const names = await findRenderedTerritoryNames()
    expect(names[2]).toBe('Banana')
    expect(names.slice(0, 2).sort()).toEqual(['arvore', 'Árvore'].sort())
  })

  it('passes the map the territories in sorted order too', async () => {
    const zona = makeTerritory({
      id: 't-zona',
      name: 'Zona Sul',
      blocks: [makeBlock({ id: 'block-zona', number: 9 })]
    })
    const bairro = makeTerritory({
      id: 't-bairro',
      name: 'Bairro Norte',
      blocks: [makeBlock({ id: 'block-bairro', number: 1 })]
    })
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([zona, bairro]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<HomeScreen />)

    const buttons = await screen.findAllByRole('button', { name: /^Quadra \d+$/ })
    expect(buttons.map((button) => button.textContent)).toEqual(['Quadra 1', 'Quadra 9'])
  })

  it('"Novo território" hands over the territories in sorted order', async () => {
    const territories = [
      makeTerritory({ id: 't-zona', name: 'Zona Sul' }),
      makeTerritory({ id: 't-bairro', name: 'Bairro Norte' })
    ]
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue(territories),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const onNewTerritory = vi.fn()
    const user = userEvent.setup()

    render(<HomeScreen onNewTerritory={onNewTerritory} />)
    await user.click(await screen.findByRole('button', { name: /novo território/i }))

    expect(onNewTerritory).toHaveBeenCalledWith([territories[1], territories[0]])
  })

  it('"Editar demarcação" hands over the neighbours in sorted order', async () => {
    const territories = [
      makeTerritory({ id: 't-zona', name: 'Zona Sul' }),
      makeTerritory({ id: 't-bairro', name: 'Bairro Norte' })
    ]
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue(territories),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const onEditTerritory = vi.fn()
    const user = userEvent.setup()

    render(<HomeScreen onEditTerritory={onEditTerritory} />)
    await openTerritoryMenu(user, 'Bairro Norte')
    await user.click(
      await screen.findByRole('menuitem', { name: /editar demarcação.*bairro norte/i })
    )

    expect(onEditTerritory).toHaveBeenCalledWith(territories[1], [territories[1], territories[0]])
  })
})

describe('HomeScreen deleting a territory', () => {
  it('asks for confirmation with a simple message when the territory has no blocks, and deletes on confirm', async () => {
    const territory = makeTerritory({ name: 'Bairro Sul', blocks: [] })
    const deleteTerritory = vi.fn().mockResolvedValue(undefined)
    const listWithBlocks = vi.fn().mockResolvedValue([territory])
    const api = makeApi({
      territories: {
        listWithBlocks,
        create: vi.fn(),
        update: vi.fn(),
        delete: deleteTerritory
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    await openTerritoryMenu(user, 'Bairro Sul')
    await user.click(
      await screen.findByRole('menuitem', { name: /apagar território.*bairro sul/i })
    )

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    const message = confirmSpy.mock.calls[0]?.[0] as string
    expect(message).not.toMatch(/histórico/i)
    await waitFor(() => expect(deleteTerritory).toHaveBeenCalledWith('territory-1'))
    expect(listWithBlocks).toHaveBeenCalledTimes(2)
  })

  it('warns that the blocks and their work history are deleted together when the territory has blocks', async () => {
    const territory = makeTerritory({
      name: 'Bairro Sul',
      blocks: [makeBlock(), makeBlock({ id: 'b2', number: 2 })]
    })
    const deleteTerritory = vi.fn().mockResolvedValue(undefined)
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: deleteTerritory
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    await openTerritoryMenu(user, 'Bairro Sul')
    await user.click(
      await screen.findByRole('menuitem', { name: /apagar território.*bairro sul/i })
    )

    const message = confirmSpy.mock.calls[0]?.[0] as string
    expect(message).toMatch(/histórico/i)
    expect(message).toMatch(/2/)
    await waitFor(() => expect(deleteTerritory).toHaveBeenCalledWith('territory-1'))
  })

  it('does not call the API when the confirmation is declined', async () => {
    confirmSpy.mockReturnValue(false)
    const territory = makeTerritory({ name: 'Bairro Sul' })
    const deleteTerritory = vi.fn()
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: deleteTerritory
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    await openTerritoryMenu(user, 'Bairro Sul')
    await user.click(
      await screen.findByRole('menuitem', { name: /apagar território.*bairro sul/i })
    )

    expect(deleteTerritory).not.toHaveBeenCalled()
  })

  it('shows a visible error message when deleting a territory fails', async () => {
    const territory = makeTerritory({ name: 'Bairro Sul' })
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn().mockRejectedValue(new Error('O território tem uma pendência.'))
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    await openTerritoryMenu(user, 'Bairro Sul')
    await user.click(
      await screen.findByRole('menuitem', { name: /apagar território.*bairro sul/i })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('O território tem uma pendência.')
  })
})

describe('HomeScreen reloading', () => {
  it('"Recarregar" forces a fresh fetch of the territories', async () => {
    const api = makeApi()
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    await waitFor(() => expect(api.territories.listWithBlocks).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: /recarregar/i }))

    await waitFor(() => expect(api.territories.listWithBlocks).toHaveBeenCalledTimes(2))
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

    render(<HomeScreen />)
    await waitFor(() => expect(listWithBlocks).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: /recarregar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao recarregar.')
  })
})

describe('HomeScreen header after the sidebar shell', () => {
  it('offers neither a "Publicadores" button nor a "Mais opções" menu -- navigation and sign-out moved to the sidebar', async () => {
    const api = makeApi()
    vi.stubGlobal('api', api)

    render(<HomeScreen />)
    await waitFor(() => expect(api.territories.listWithBlocks).toHaveBeenCalled())

    expect(screen.queryByRole('button', { name: /publicadores/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mais opções/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /sair da congregação/i })).not.toBeInTheDocument()
  })
})

describe('HomeScreen tapping a block on the map', () => {
  async function renderWithOneBlock(
    props: Parameters<typeof HomeScreen>[0] = {},
    api = makeApi()
  ): Promise<{ territory: Territory; block: Block; user: ReturnType<typeof userEvent.setup> }> {
    const block = makeBlock({ number: 7 })
    const territory = makeTerritory({ name: 'Bairro Sul', blocks: [block] })
    api.territories.listWithBlocks = vi.fn().mockResolvedValue([territory])
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen {...props} />)
    await user.click(await screen.findByRole('button', { name: 'Quadra 7' }))

    return { territory, block, user }
  }

  it('opens a menu offering "Ver histórico", "Editar contorno ou número" and "Apagar quadra"', async () => {
    await renderWithOneBlock()

    expect(screen.getByRole('menuitem', { name: 'Ver histórico' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Editar contorno ou número' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Apagar quadra' })).toBeInTheDocument()
  })

  it('"Ver histórico" signals the territory and the block', async () => {
    const onShowHistory = vi.fn()
    const { territory, block, user } = await renderWithOneBlock({ onShowHistory })

    await user.click(screen.getByRole('menuitem', { name: 'Ver histórico' }))

    expect(onShowHistory).toHaveBeenCalledWith(territory, block)
  })

  it('"Editar contorno ou número" signals the territory and the block', async () => {
    const onEditBlock = vi.fn()
    const { territory, block, user } = await renderWithOneBlock({ onEditBlock })

    await user.click(screen.getByRole('menuitem', { name: 'Editar contorno ou número' }))

    expect(onEditBlock).toHaveBeenCalledWith(territory, block)
  })

  it('"Apagar quadra" asks for confirmation warning that the work history goes with it, then deletes on confirm', async () => {
    const deleteBlock = vi.fn().mockResolvedValue(undefined)
    const api = makeApi()
    api.blocks.delete = deleteBlock
    const { block, user } = await renderWithOneBlock({}, api)

    await user.click(screen.getByRole('menuitem', { name: 'Apagar quadra' }))

    const message = confirmSpy.mock.calls[0]?.[0] as string
    expect(message).toMatch(/histórico/i)
    await waitFor(() => expect(deleteBlock).toHaveBeenCalledWith(block.id))
  })

  it('does not delete the block when the confirmation is declined', async () => {
    confirmSpy.mockReturnValue(false)
    const deleteBlock = vi.fn()
    const api = makeApi()
    api.blocks.delete = deleteBlock
    const { user } = await renderWithOneBlock({}, api)

    await user.click(screen.getByRole('menuitem', { name: 'Apagar quadra' }))

    expect(deleteBlock).not.toHaveBeenCalled()
  })

  it('shows a visible error message when deleting a block fails', async () => {
    const api = makeApi()
    api.blocks.delete = vi.fn().mockRejectedValue(new Error('A quadra tem um registro pendente.'))
    const { user } = await renderWithOneBlock({}, api)

    await user.click(screen.getByRole('menuitem', { name: 'Apagar quadra' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A quadra tem um registro pendente.')
  })

  it('closes without side effects when dismissed', async () => {
    const onShowHistory = vi.fn()
    const onEditBlock = vi.fn()
    const { user } = await renderWithOneBlock({ onShowHistory, onEditBlock })

    await user.click(screen.getByRole('button', { name: 'Fechar' }))

    expect(screen.queryByRole('menuitem', { name: 'Ver histórico' })).not.toBeInTheDocument()
    expect(onShowHistory).not.toHaveBeenCalled()
    expect(onEditBlock).not.toHaveBeenCalled()
  })
})

describe('HomeScreen marking a block as worked', () => {
  const TODAY = new Date(2026, 7, 19, 10, 30)

  function makePublisher(overrides: Partial<Publisher> = {}): Publisher {
    return { id: 'publisher-1', name: 'Ana', isActive: true, ...overrides }
  }

  async function openMarkWorkedForm(
    api = makeApi(),
    territoryOverrides: Partial<Territory> = {}
  ): Promise<{ block: Block; user: ReturnType<typeof userEvent.setup> }> {
    const block = makeBlock({ number: 7 })
    const territory = makeTerritory({ name: 'Bairro Sul', blocks: [block], ...territoryOverrides })
    api.territories.listWithBlocks = vi.fn().mockResolvedValue([territory])
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen now={TODAY} />)
    await user.click(await screen.findByRole('button', { name: 'Quadra 7' }))
    await user.click(screen.getByRole('menuitem', { name: 'Marcar como trabalhada' }))

    return { block, user }
  }

  it('offers "Marcar como trabalhada" in the block action menu', async () => {
    const block = makeBlock({ number: 7 })
    const territory = makeTerritory({ blocks: [block] })
    const api = makeApi()
    api.territories.listWithBlocks = vi.fn().mockResolvedValue([territory])
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen now={TODAY} />)
    await user.click(await screen.findByRole('button', { name: 'Quadra 7' }))

    expect(screen.getByRole('menuitem', { name: 'Marcar como trabalhada' })).toBeInTheDocument()
  })

  it('lists the congregation publishers in the form it opens', async () => {
    const api = makeApi()
    api.publishers.list = vi
      .fn()
      .mockResolvedValue([makePublisher(), makePublisher({ id: 'publisher-2', name: 'Bruno' })])

    await openMarkWorkedForm(api)

    const select = await screen.findByLabelText('Publicador')
    expect(within(select).getByRole('option', { name: 'Ana' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Bruno' })).toBeInTheDocument()
  })

  it('preselects the publisher the territory is assigned to', async () => {
    const api = makeApi()
    api.publishers.list = vi
      .fn()
      .mockResolvedValue([makePublisher(), makePublisher({ id: 'publisher-2', name: 'Bruno' })])

    await openMarkWorkedForm(api, { assignedUser: { id: 'publisher-2', name: 'Bruno' } })

    expect(await screen.findByLabelText('Publicador')).toHaveValue('publisher-2')
  })

  it('preselects nobody when the territory has no open assignment', async () => {
    const api = makeApi()
    api.publishers.list = vi.fn().mockResolvedValue([makePublisher()])

    await openMarkWorkedForm(api)

    expect(await screen.findByLabelText('Publicador')).toHaveValue('')
  })

  it('defaults the date to today', async () => {
    const api = makeApi()
    api.publishers.list = vi.fn().mockResolvedValue([makePublisher()])

    await openMarkWorkedForm(api)

    expect(await screen.findByLabelText('Data')).toHaveValue('2026-08-19')
  })

  it('records the chosen publisher and the chosen date when confirmed', async () => {
    const api = makeApi()
    api.publishers.list = vi
      .fn()
      .mockResolvedValue([makePublisher(), makePublisher({ id: 'publisher-2', name: 'Bruno' })])
    api.workLogs.markWorked = vi.fn().mockResolvedValue(undefined)
    const { block, user } = await openMarkWorkedForm(api)

    await user.selectOptions(await screen.findByLabelText('Publicador'), 'publisher-2')
    await user.clear(screen.getByLabelText('Data'))
    await user.type(screen.getByLabelText('Data'), '2026-08-10')
    await user.click(screen.getByRole('button', { name: 'Marcar' }))

    await waitFor(() =>
      expect(api.workLogs.markWorked).toHaveBeenCalledWith(
        block.id,
        'publisher-2',
        new Date(2026, 7, 10)
      )
    )
  })

  it('records nothing when the form is cancelled', async () => {
    const api = makeApi()
    api.publishers.list = vi.fn().mockResolvedValue([makePublisher()])
    api.workLogs.markWorked = vi.fn()
    const { user } = await openMarkWorkedForm(api)

    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(api.workLogs.markWorked).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Publicador')).not.toBeInTheDocument()
  })

  it('reloads the territories after a successful marking, so the map recolours', async () => {
    const api = makeApi()
    api.publishers.list = vi.fn().mockResolvedValue([makePublisher()])
    api.workLogs.markWorked = vi.fn().mockResolvedValue(undefined)
    const { user } = await openMarkWorkedForm(api)

    await user.selectOptions(await screen.findByLabelText('Publicador'), 'publisher-1')
    await user.click(screen.getByRole('button', { name: 'Marcar' }))

    await waitFor(() => expect(api.territories.listWithBlocks).toHaveBeenCalledTimes(2))
  })

  it('shows the API error and does not reload when the marking fails', async () => {
    const api = makeApi()
    api.publishers.list = vi.fn().mockResolvedValue([makePublisher()])
    api.workLogs.markWorked = vi
      .fn()
      .mockRejectedValue(new Error('A data da visita está no futuro.'))
    const { user } = await openMarkWorkedForm(api)

    await user.selectOptions(await screen.findByLabelText('Publicador'), 'publisher-1')
    await user.click(screen.getByRole('button', { name: 'Marcar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A data da visita está no futuro.')
    expect(api.territories.listWithBlocks).toHaveBeenCalledTimes(1)
  })

  it('shows the API error when the publishers cannot be loaded', async () => {
    const api = makeApi()
    api.publishers.list = vi.fn().mockRejectedValue(new Error('Sem conexão com o servidor.'))

    await openMarkWorkedForm(api)

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor.')
  })
})
