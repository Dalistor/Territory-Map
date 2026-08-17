// Ports `admin/lib/presentation/home_screen.dart` (removed Flutter admin) to
// React. `window.api` is never the real IPC bridge here -- a fake stubbed
// with `vi.stubGlobal` stands in, per the spec 0003 convention already used
// by `session.test.ts` and `api-client.test.ts`.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcApi } from '../../shared/ipc-contract'
import type { Block, Territory } from '../../shared/models'
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
      list: vi.fn(),
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

describe('HomeScreen territory actions', () => {
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
    await user.click(await screen.findByRole('button', { name: /adicionar quadra.*bairro sul/i }))

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
    await user.click(await screen.findByRole('button', { name: /editar demarcação.*bairro sul/i }))

    expect(onEditTerritory).toHaveBeenCalledWith(territory, [territory, other])
  })
})

describe('HomeScreen deleting a territory', () => {
  it('asks for confirmation with a simple message when the territory has no blocks, and deletes on confirm', async () => {
    const territory = makeTerritory({ name: 'Bairro Sul', blocks: [] })
    const deleteTerritory = vi.fn().mockResolvedValue(undefined)
    const listWithBlocks = vi.fn().mockResolvedValue([territory])
    const api = makeApi({
      territories: { listWithBlocks, create: vi.fn(), update: vi.fn(), delete: deleteTerritory }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<HomeScreen />)
    await user.click(await screen.findByRole('button', { name: /apagar território.*bairro sul/i }))

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
    await user.click(await screen.findByRole('button', { name: /apagar território.*bairro sul/i }))

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
    await user.click(await screen.findByRole('button', { name: /apagar território.*bairro sul/i }))

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
    await user.click(await screen.findByRole('button', { name: /apagar território.*bairro sul/i }))

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
      territories: { listWithBlocks, create: vi.fn(), update: vi.fn(), delete: vi.fn() }
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
