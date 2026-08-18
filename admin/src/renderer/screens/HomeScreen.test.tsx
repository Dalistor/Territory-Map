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
      signOut: vi.fn().mockResolvedValue(undefined),
      getCongregation: vi.fn(),
      ...overrides.session
    },
    territories: {
      listWithBlocks: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      assign: vi.fn(),
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
        delete: vi.fn(),
        assign: vi.fn()
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
        delete: vi.fn(),
        assign: vi.fn()
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
  it('"Novo território" signals the intent to create one, handing over the loaded territories', async () => {
    const territory = makeTerritory()
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign: vi.fn()
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
        delete: vi.fn(),
        assign: vi.fn()
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
        delete: vi.fn(),
        assign: vi.fn()
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
        delete: vi.fn(),
        assign: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<HomeScreen />)

    expect(await findRenderedTerritoryNames()).toEqual(['Bairro Norte', 'Centro', 'Zona Sul'])
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
        delete: vi.fn(),
        assign: vi.fn()
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
        delete: vi.fn(),
        assign: vi.fn()
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
        delete: vi.fn(),
        assign: vi.fn()
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
        delete: vi.fn(),
        assign: vi.fn()
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
        delete: deleteTerritory,
        assign: vi.fn()
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
        delete: deleteTerritory,
        assign: vi.fn()
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
        delete: deleteTerritory,
        assign: vi.fn()
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
        delete: vi.fn().mockRejectedValue(new Error('O território tem uma pendência.')),
        assign: vi.fn()
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
        delete: vi.fn(),
        assign: vi.fn()
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

describe('HomeScreen signing out', () => {
  it('keeps "Sair da congregação" behind a secondary menu, not next to "Recarregar"', async () => {
    const api = makeApi()
    vi.stubGlobal('api', api)

    render(<HomeScreen />)
    await waitFor(() => expect(api.territories.listWithBlocks).toHaveBeenCalled())

    const header = screen.getByRole('banner')
    expect(
      within(header).queryByRole('button', { name: /sair da congregação/i })
    ).not.toBeInTheDocument()
  })

  it('explains, on confirmation, that local data is erased but nothing is removed from the server, and signs out on confirm', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    const api = makeApi({
      session: { isConfigured: vi.fn(), configure: vi.fn(), signOut, getCongregation: vi.fn() }
    })
    vi.stubGlobal('api', api)
    const onSignedOut = vi.fn()
    const user = userEvent.setup()

    render(<HomeScreen onSignedOut={onSignedOut} />)
    await waitFor(() => expect(api.territories.listWithBlocks).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: /mais opções/i }))
    await user.click(screen.getByRole('menuitem', { name: /sair da congregação/i }))

    const message = confirmSpy.mock.calls[0]?.[0] as string
    expect(message).toMatch(/neste computador/i)
    expect(message).toMatch(/servidor/i)
    expect(message).toMatch(/nome.*cidade.*senha|senha.*cidade.*nome|de novo/i)
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1))
  })

  it('does not sign out when the confirmation is declined', async () => {
    confirmSpy.mockReturnValue(false)
    const signOut = vi.fn()
    const api = makeApi({
      session: { isConfigured: vi.fn(), configure: vi.fn(), signOut, getCongregation: vi.fn() }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    await waitFor(() => expect(api.territories.listWithBlocks).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: /mais opções/i }))
    await user.click(screen.getByRole('menuitem', { name: /sair da congregação/i }))

    expect(signOut).not.toHaveBeenCalled()
  })

  it('shows a visible error message when signing out fails', async () => {
    const api = makeApi({
      session: {
        isConfigured: vi.fn(),
        configure: vi.fn(),
        signOut: vi.fn().mockRejectedValue(new Error('Falha ao sair.')),
        getCongregation: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    await waitFor(() => expect(api.territories.listWithBlocks).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: /mais opções/i }))
    await user.click(screen.getByRole('menuitem', { name: /sair da congregação/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao sair.')
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

/** Opens the "Atribuir a publicador" dialog for a territory row, via its "⋮" menu. */
async function openAssignDialog(
  user: ReturnType<typeof userEvent.setup>,
  territoryName: string
): Promise<HTMLElement> {
  await openTerritoryMenu(user, territoryName)
  await user.click(
    await screen.findByRole('menuitem', {
      name: new RegExp(`atribuir a publicador.*${territoryName}`, 'i')
    })
  )
  return screen.findByRole('dialog', { name: new RegExp(territoryName, 'i') })
}

describe('HomeScreen assigning a territory to a publisher', () => {
  it('lists active publishers as selectable options, plus "Nenhum", and excludes inactive ones', async () => {
    const territory = makeTerritory({ name: 'Bairro Sul' })
    const activePublisher = makePublisher({ id: 'p1', name: 'Ana', isActive: true })
    const inactivePublisher = makePublisher({ id: 'p2', name: 'Beto', isActive: false })
    const api = makeApi({
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([territory]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign: vi.fn()
      },
      publishers: {
        list: vi.fn().mockResolvedValue([activePublisher, inactivePublisher]),
        create: vi.fn(),
        regenerateCode: vi.fn(),
        setActive: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    const dialog = await openAssignDialog(user, 'Bairro Sul')

    expect(within(dialog).getByRole('radio', { name: 'Nenhum' })).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Ana' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('radio', { name: 'Beto' })).not.toBeInTheDocument()
  })

  it('assigns the selected publisher: calls assign with its id, reloads, and the row shows their name', async () => {
    const territory = makeTerritory({ name: 'Bairro Sul' })
    const assignedTerritory = { ...territory, assignedUser: { id: 'p1', name: 'Ana' } }
    const publisher = makePublisher({ id: 'p1', name: 'Ana', isActive: true })
    const listWithBlocks = vi
      .fn()
      .mockResolvedValueOnce([territory])
      .mockResolvedValueOnce([assignedTerritory])
    const assign = vi.fn().mockResolvedValue(assignedTerritory)
    const api = makeApi({
      territories: {
        listWithBlocks,
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign
      },
      publishers: {
        list: vi.fn().mockResolvedValue([publisher]),
        create: vi.fn(),
        regenerateCode: vi.fn(),
        setActive: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    const dialog = await openAssignDialog(user, 'Bairro Sul')
    await user.click(within(dialog).getByRole('radio', { name: 'Ana' }))
    await user.click(within(dialog).getByRole('button', { name: /^atribuir$/i }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('territory-1', 'p1'))
    await waitFor(() => expect(listWithBlocks).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/designado a ana/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('choosing "Nenhum" removes the assignment: calls assign with null, and the row no longer shows a publisher', async () => {
    const territory = makeTerritory({
      name: 'Bairro Sul',
      assignedUser: { id: 'p1', name: 'Ana' }
    })
    const unassignedTerritory = { ...territory, assignedUser: undefined }
    const publisher = makePublisher({ id: 'p1', name: 'Ana', isActive: true })
    const listWithBlocks = vi
      .fn()
      .mockResolvedValueOnce([territory])
      .mockResolvedValueOnce([unassignedTerritory])
    const assign = vi.fn().mockResolvedValue(unassignedTerritory)
    const api = makeApi({
      territories: {
        listWithBlocks,
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        assign
      },
      publishers: {
        list: vi.fn().mockResolvedValue([publisher]),
        create: vi.fn(),
        regenerateCode: vi.fn(),
        setActive: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    expect(await screen.findByText(/designado a ana/i)).toBeInTheDocument()
    const dialog = await openAssignDialog(user, 'Bairro Sul')
    await user.click(within(dialog).getByRole('radio', { name: 'Nenhum' }))
    await user.click(within(dialog).getByRole('button', { name: /^atribuir$/i }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('territory-1', null))
    await waitFor(() => expect(listWithBlocks).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/designado a/i)).not.toBeInTheDocument())
  })

  it('shows a visible error message when assigning fails, without incorrectly reloading the list', async () => {
    const territory = makeTerritory({ name: 'Bairro Sul' })
    const publisher = makePublisher({ id: 'p1', name: 'Ana', isActive: true })
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
        list: vi.fn().mockResolvedValue([publisher]),
        create: vi.fn(),
        regenerateCode: vi.fn(),
        setActive: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    const dialog = await openAssignDialog(user, 'Bairro Sul')
    await user.click(within(dialog).getByRole('radio', { name: 'Ana' }))
    await waitFor(() => expect(listWithBlocks).toHaveBeenCalledTimes(1))
    await user.click(within(dialog).getByRole('button', { name: /^atribuir$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Publicador não encontrado.')
    expect(listWithBlocks).toHaveBeenCalledTimes(1)
  })

  it('"Cancelar" closes the dialog without calling assign', async () => {
    const territory = makeTerritory({ name: 'Bairro Sul' })
    const publisher = makePublisher({ id: 'p1', name: 'Ana', isActive: true })
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
        list: vi.fn().mockResolvedValue([publisher]),
        create: vi.fn(),
        regenerateCode: vi.fn(),
        setActive: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    const dialog = await openAssignDialog(user, 'Bairro Sul')
    await user.click(within(dialog).getByRole('radio', { name: 'Ana' }))
    await user.click(within(dialog).getByRole('button', { name: /^cancelar$/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('shows a visible error message when loading the publisher options fails', async () => {
    const territory = makeTerritory({ name: 'Bairro Sul' })
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

    render(<HomeScreen />)
    await openTerritoryMenu(user, 'Bairro Sul')
    await user.click(
      await screen.findByRole('menuitem', { name: /atribuir a publicador.*bairro sul/i })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar publicadores.')
  })
})
