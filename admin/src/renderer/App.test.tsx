// Ports `_Root`/`_Authenticated` from the removed `admin/lib/main.dart` --
// the root decision between the setup screen and the authenticated app.
// `window.api` is never the real IPC bridge here, per the spec 0003
// convention already used by `HomeScreen.test.tsx`/`session.test.ts`.
import type { ReactNode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { IpcApi } from '../shared/ipc-contract'
import type { Block, Congregation, Territory } from '../shared/models'
import type { PolygonEditor } from './map/usePolygonEditor'
import App from './App'

// `TerritoryEditorScreen`/`BlockEditorScreen` (real here, reached by
// navigating from `HomeScreen`) pull in `react-leaflet`/`PolygonEditorLayers`,
// which need a real Leaflet DOM layout jsdom does not provide -- same stub
// their own test files use. `AuthenticatedApp`'s job is only wiring the
// navigation together, not how either map draws.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null
}))

// Exposes the real `usePolygonEditor` controller it is handed through three
// buttons that always draw a valid triangle -- lets the "save a block, stay
// on the screen" regression test (below) actually get `canSave` to `true`
// without a real Leaflet/Geoman layout, the same technique
// `BlockEditorScreen.test.tsx` uses.
vi.mock('./map/PolygonEditorLayers', () => ({
  PolygonEditorLayers: ({ controller }: { controller: PolygonEditor }) => (
    <div>
      <button type="button" onClick={() => controller.addPoint({ lat: 1, lng: 1 })}>
        add-a
      </button>
      <button type="button" onClick={() => controller.addPoint({ lat: 1, lng: 2 })}>
        add-b
      </button>
      <button type="button" onClick={() => controller.addPoint({ lat: 2, lng: 2 })}>
        add-c
      </button>
    </div>
  )
}))

// `HomeScreen` (rendered for real here, not mocked) pulls in `TerritoryMap`,
// which needs a real Leaflet DOM layout jsdom does not provide. Same stub
// `HomeScreen.test.tsx` uses -- App's own job is only the routing decision,
// not how the map draws.
vi.mock('./map/TerritoryMap', () => ({
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

const CONGREGATION: Congregation = { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' }

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

/** A fake covering every member of `IpcApi` -- `App` only calls
 * `session.isConfigured`, `session.getCongregation` and
 * `territories.listWithBlocks` directly, but `HomeScreen` (rendered for
 * real once `App` decides to show it) calls more, and `vi.fn()` stubs for
 * the rest keep this fake honest without touching the real IPC bridge. */
function fakeApi(overrides: Partial<IpcApi> = {}): IpcApi {
  return {
    session: {
      isConfigured: vi.fn(),
      configure: vi.fn(),
      signOut: vi.fn().mockResolvedValue(undefined),
      getCongregation: vi.fn().mockResolvedValue(null),
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
      list: vi.fn(),
      create: vi.fn(),
      regenerateCode: vi.fn(),
      setActive: vi.fn(),
      ...overrides.publishers
    },
    assignments: {
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
      ...overrides.workLogs
    },
    geo: {
      geocodeCity: vi.fn().mockResolvedValue(null),
      ...overrides.geo
    }
  }
}

/** Never settles -- for asserting what renders while a call is still pending. */
function pendingPromise<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

let confirmSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  confirmSpy.mockRestore()
})

describe('App', () => {
  it('shows a loading state while session.isConfigured is still pending', () => {
    const api = fakeApi({
      session: {
        isConfigured: vi.fn(() => pendingPromise<boolean>()),
        configure: vi.fn(),
        signOut: vi.fn(),
        getCongregation: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<App />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome da congregação')).not.toBeInTheDocument()
  })

  it('renders SetupScreen without a reason when isConfigured resolves false', async () => {
    const api = fakeApi({
      session: {
        isConfigured: vi.fn().mockResolvedValue(false),
        configure: vi.fn(),
        signOut: vi.fn(),
        getCongregation: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<App />)

    expect(await screen.findByLabelText('Nome da congregação')).toBeInTheDocument()
    expect(screen.queryByTestId('setup-reason')).not.toBeInTheDocument()
  })

  it('renders SetupScreen with a reason when isConfigured rejects (the storage read itself failed)', async () => {
    const api = fakeApi({
      session: {
        isConfigured: vi.fn().mockRejectedValue(new Error('disk is unreadable')),
        configure: vi.fn(),
        signOut: vi.fn(),
        getCongregation: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<App />)

    expect(await screen.findByLabelText('Nome da congregação')).toBeInTheDocument()
    expect(screen.getByTestId('setup-reason')).toHaveTextContent(
      'Não foi possível ler os dados guardados neste computador.'
    )
  })

  it('renders HomeScreen with the recovered congregation when isConfigured is true and territories load succeeds', async () => {
    const api = fakeApi({
      session: {
        isConfigured: vi.fn().mockResolvedValue(true),
        configure: vi.fn(),
        signOut: vi.fn(),
        getCongregation: vi.fn().mockResolvedValue(CONGREGATION)
      },
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Congregação Central — São Paulo' })
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome da congregação')).not.toBeInTheDocument()
  })

  it('falls back to SetupScreen with the server message when the territories probe fails with CredentialsRejectedException', async () => {
    const rejectedMessage =
      'As credenciais salvas não foram aceitas pelo servidor. Digite os dados novamente.'
    const api = fakeApi({
      session: {
        isConfigured: vi.fn().mockResolvedValue(true),
        configure: vi.fn(),
        signOut: vi.fn(),
        getCongregation: vi.fn()
      },
      territories: {
        listWithBlocks: vi
          .fn()
          .mockRejectedValue({ name: 'CredentialsRejectedException', message: rejectedMessage }),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<App />)

    expect(await screen.findByLabelText('Nome da congregação')).toBeInTheDocument()
    expect(screen.getByTestId('setup-reason')).toHaveTextContent(rejectedMessage)
  })

  it('also recognises a real CredentialsRejectedException Error instance, not just a plain object', async () => {
    const rejected = new Error('Senha alterada no servidor. Digite os dados novamente.')
    rejected.name = 'CredentialsRejectedException'
    const api = fakeApi({
      session: {
        isConfigured: vi.fn().mockResolvedValue(true),
        configure: vi.fn(),
        signOut: vi.fn(),
        getCongregation: vi.fn()
      },
      territories: {
        listWithBlocks: vi.fn().mockRejectedValue(rejected),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<App />)

    expect(await screen.findByLabelText('Nome da congregação')).toBeInTheDocument()
    expect(screen.getByTestId('setup-reason')).toHaveTextContent(rejected.message)
  })

  it('renders HomeScreen (letting it show its own error) when the territories probe fails with something other than CredentialsRejectedException', async () => {
    const networkError = new Error('Sem conexão com o servidor.')
    networkError.name = 'NetworkException'
    const api = fakeApi({
      session: {
        isConfigured: vi.fn().mockResolvedValue(true),
        configure: vi.fn(),
        signOut: vi.fn(),
        getCongregation: vi.fn()
      },
      territories: {
        listWithBlocks: vi.fn().mockRejectedValue(networkError),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<App />)

    // HomeScreen renders (its header, "Recarregar" -- SetupScreen has
    // neither) and shows the load failure itself, instead of App
    // second-guessing an error that is not about credentials.
    expect(await screen.findByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
    expect(screen.queryByTestId('setup-reason')).not.toBeInTheDocument()
    expect(await screen.findByText('Sem conexão com o servidor.')).toBeInTheDocument()
  })

  it('does not call session.getCongregation when the territories probe fails', async () => {
    const getCongregation = vi.fn()
    const api = fakeApi({
      session: {
        isConfigured: vi.fn().mockResolvedValue(true),
        configure: vi.fn(),
        signOut: vi.fn(),
        getCongregation
      },
      territories: {
        listWithBlocks: vi.fn().mockRejectedValue(new Error('boom')),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<App />)

    await screen.findByRole('button', { name: 'Recarregar' })
    expect(getCongregation).not.toHaveBeenCalled()
  })

  it('returns to SetupScreen after signing out from the sidebar\'s "Sair da congregação"', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    const api = fakeApi({
      session: {
        isConfigured: vi.fn().mockResolvedValue(true),
        configure: vi.fn(),
        signOut,
        getCongregation: vi.fn().mockResolvedValue(CONGREGATION)
      },
      territories: {
        listWithBlocks: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()

    render(<App />)

    const nav = await screen.findByRole('navigation')
    await user.click(within(nav).getByRole('button', { name: 'Sair da congregação' }))

    expect(confirmSpy).toHaveBeenCalledWith(
      'Os dados salvos neste computador serão apagados. Nada é removido do servidor: o território, ' +
        'as quadras e o histórico de trabalho continuam lá. Para usar este computador de novo, será ' +
        'preciso digitar o nome, a cidade e a senha da congregação de novo.'
    )
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(await screen.findByLabelText('Nome da congregação')).toBeInTheDocument()
    expect(screen.queryByTestId('setup-reason')).not.toBeInTheDocument()
  })

  it('falls back to the generic reason when a CredentialsRejectedException carries no usable message', async () => {
    const api = fakeApi({
      session: {
        isConfigured: vi.fn().mockResolvedValue(true),
        configure: vi.fn(),
        signOut: vi.fn(),
        getCongregation: vi.fn()
      },
      territories: {
        // No `message` field at all -- still identifiable as a credentials
        // problem by `name` alone, but with nothing of its own to show.
        listWithBlocks: vi.fn().mockRejectedValue({ name: 'CredentialsRejectedException' }),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<App />)

    expect(await screen.findByLabelText('Nome da congregação')).toBeInTheDocument()
    expect(screen.getByTestId('setup-reason')).toHaveTextContent(
      'Não foi possível ler os dados guardados neste computador.'
    )
  })

  it("treats a rejection with no usable name as HomeScreen's problem, not a credentials rejection", async () => {
    const api = fakeApi({
      session: {
        isConfigured: vi.fn().mockResolvedValue(true),
        configure: vi.fn(),
        signOut: vi.fn(),
        getCongregation: vi.fn()
      },
      territories: {
        // Not an `Error`, and no `name` field at all -- cannot possibly be
        // read as `CredentialsRejectedException`.
        listWithBlocks: vi.fn().mockRejectedValue('boom'),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    })
    vi.stubGlobal('api', api)

    render(<App />)

    expect(await screen.findByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
    expect(screen.queryByTestId('setup-reason')).not.toBeInTheDocument()
  })
})

/** An api whose boot path always lands on the authenticated shell. */
function authedApi(overrides: Partial<IpcApi> = {}): IpcApi {
  return fakeApi({
    ...overrides,
    session: {
      isConfigured: vi.fn().mockResolvedValue(true),
      configure: vi.fn(),
      signOut: vi.fn().mockResolvedValue(undefined),
      getCongregation: vi.fn().mockResolvedValue(CONGREGATION),
      ...overrides.session
    }
  })
}

// The permanent navigation shell (spec 0006, Task 04): a fixed sidebar with
// the congregation at the top, the three sections, and sign-out at the
// bottom, with every route rendering in the content area beside it.
describe('AuthenticatedApp sidebar shell', () => {
  it('shows the sidebar with the congregation, the three sections, and "Mapa" initially active', async () => {
    vi.stubGlobal('api', authedApi())

    render(<App />)

    const nav = await screen.findByRole('navigation')
    expect(within(nav).getByText('Congregação Central')).toBeInTheDocument()
    expect(within(nav).getByText('São Paulo')).toBeInTheDocument()
    const mapButton = within(nav).getByRole('button', { name: 'Mapa' })
    expect(mapButton).toHaveClass('is-active')
    expect(mapButton).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Designações' })).not.toHaveAttribute(
      'aria-current'
    )
    expect(within(nav).getByRole('button', { name: 'Publicadores' })).not.toHaveAttribute(
      'aria-current'
    )
    expect(within(nav).getByRole('button', { name: 'Sair da congregação' })).toBeInTheDocument()
  })

  it('falls back to "Territory Map" in the sidebar header when the congregation is unknown', async () => {
    vi.stubGlobal(
      'api',
      authedApi({
        session: {
          isConfigured: vi.fn().mockResolvedValue(true),
          configure: vi.fn(),
          signOut: vi.fn(),
          getCongregation: vi.fn().mockResolvedValue(null)
        }
      })
    )

    render(<App />)

    const nav = await screen.findByRole('navigation')
    expect(within(nav).getByText('Territory Map')).toBeInTheDocument()
    expect(within(nav).queryByText('Congregação Central')).not.toBeInTheDocument()
  })

  it('shows the Designations screen when "Designações" is clicked, and "Mapa" returns home', async () => {
    vi.stubGlobal('api', authedApi())
    const user = userEvent.setup()

    render(<App />)

    const nav = await screen.findByRole('navigation')
    await user.click(within(nav).getByRole('button', { name: 'Designações' }))

    expect(await screen.findByRole('heading', { name: 'Designações' })).toBeInTheDocument()
    const designationsButton = within(nav).getByRole('button', { name: 'Designações' })
    expect(designationsButton).toHaveClass('is-active')
    expect(designationsButton).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Mapa' })).not.toHaveAttribute('aria-current')

    await user.click(within(nav).getByRole('button', { name: 'Mapa' }))

    expect(await screen.findByRole('button', { name: 'Novo território' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Designações' })).not.toBeInTheDocument()
  })

  it('does not sign out when the confirmation is declined', async () => {
    confirmSpy.mockReturnValue(false)
    const signOut = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal(
      'api',
      authedApi({
        session: {
          isConfigured: vi.fn().mockResolvedValue(true),
          configure: vi.fn(),
          signOut,
          getCongregation: vi.fn().mockResolvedValue(CONGREGATION)
        }
      })
    )
    const user = userEvent.setup()

    render(<App />)

    const nav = await screen.findByRole('navigation')
    await user.click(within(nav).getByRole('button', { name: 'Sair da congregação' }))

    expect(signOut).not.toHaveBeenCalled()
    // Still on the authenticated shell, not back at setup.
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome da congregação')).not.toBeInTheDocument()
  })

  it('shows a sign-out failure as an alert in the content area and stays signed in', async () => {
    const signOut = vi.fn().mockRejectedValue(new Error('Falha ao apagar as credenciais.'))
    vi.stubGlobal(
      'api',
      authedApi({
        session: {
          isConfigured: vi.fn().mockResolvedValue(true),
          configure: vi.fn(),
          signOut,
          getCongregation: vi.fn().mockResolvedValue(CONGREGATION)
        }
      })
    )
    const user = userEvent.setup()

    render(<App />)

    const nav = await screen.findByRole('navigation')
    await user.click(within(nav).getByRole('button', { name: 'Sair da congregação' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao apagar as credenciais.')
    // Still authenticated -- the shell (and its sidebar) is intact.
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome da congregação')).not.toBeInTheDocument()
  })
})

// `HomeScreen`'s own test suite (Task 14) already verifies that each action
// calls the right callback with the right arguments -- what nothing verified
// until now is that `App.tsx` actually wires those callbacks to a screen the
// admin can see and leave again. That gap (no task ever connected the six
// screens together) is what shipped a `HomeScreen` where "Novo território"
// silently did nothing.
describe('AuthenticatedApp navigation', () => {
  async function renderHome(api: IpcApi): Promise<void> {
    vi.stubGlobal('api', api)
    render(<App />)
    // "Recarregar" is always in the header, loading or not -- "Novo
    // território" only renders once HomeScreen's own territories fetch has
    // actually settled successfully, which is the readiness signal every
    // test below needs before it can find the button it wants to click.
    await screen.findByRole('button', { name: 'Novo território' })
  }

  it('opens the territory editor from "Novo território" and returns home on "← Voltar"', async () => {
    const user = userEvent.setup()
    await renderHome(
      fakeApi({
        session: {
          isConfigured: vi.fn().mockResolvedValue(true),
          configure: vi.fn(),
          signOut: vi.fn(),
          getCongregation: vi.fn().mockResolvedValue(CONGREGATION)
        },
        territories: {
          listWithBlocks: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        }
      })
    )

    await user.click(screen.getByRole('button', { name: 'Novo território' }))

    expect(await screen.findByRole('heading', { name: 'Novo território' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recarregar' })).not.toBeInTheDocument()
    // The editor is pushed inside the content area -- the sidebar stays visible.
    expect(screen.getByRole('navigation')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '← Voltar' }))

    expect(await screen.findByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
  })

  it('opens the block editor from a territory\'s "Adicionar quadra" action', async () => {
    const user = userEvent.setup()
    const territory = makeTerritory()
    await renderHome(
      fakeApi({
        session: {
          isConfigured: vi.fn().mockResolvedValue(true),
          configure: vi.fn(),
          signOut: vi.fn(),
          getCongregation: vi.fn().mockResolvedValue(CONGREGATION)
        },
        territories: {
          listWithBlocks: vi.fn().mockResolvedValue([territory]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        }
      })
    )

    await user.click(screen.getByRole('button', { name: `Opções de ${territory.name}` }))
    await user.click(
      screen.getByRole('menuitem', { name: `Adicionar quadra em ${territory.name}` })
    )

    expect(
      await screen.findByRole('heading', { name: `Nova quadra em ${territory.name}` })
    ).toBeInTheDocument()
  })

  it('stays on the block editor after saving, instead of navigating back to Home', async () => {
    // Regression test: `BlockEditorScreen` (spec 0004, Task 04) resets itself
    // to create-mode after a successful save specifically so the admin can
    // keep adding blocks to the same territory without leaving -- but
    // `AuthenticatedApp` used to wire `onSaved={goHome}` on this route
    // anyway, which navigated away the instant the save resolved, before
    // that reset was ever visible. Neither `BlockEditorScreen.test.tsx` (it
    // knows nothing about `App.tsx`'s routing) nor the earlier "opens the
    // block editor" test above (it never saves) could catch that -- only an
    // end-to-end render through `App` can.
    const user = userEvent.setup()
    const territory = makeTerritory()
    const created: Block = {
      id: 'block-99',
      number: 1,
      polygon: [
        { lat: 1, lng: 1 },
        { lat: 1, lng: 2 },
        { lat: 2, lng: 2 }
      ]
    }
    const create = vi.fn().mockResolvedValue(created)
    await renderHome(
      fakeApi({
        session: {
          isConfigured: vi.fn().mockResolvedValue(true),
          configure: vi.fn(),
          signOut: vi.fn(),
          getCongregation: vi.fn().mockResolvedValue(CONGREGATION)
        },
        territories: {
          listWithBlocks: vi.fn().mockResolvedValue([territory]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        },
        blocks: { create, update: vi.fn(), delete: vi.fn() }
      })
    )

    await user.click(screen.getByRole('button', { name: `Opções de ${territory.name}` }))
    await user.click(
      screen.getByRole('menuitem', { name: `Adicionar quadra em ${territory.name}` })
    )
    await screen.findByRole('heading', { name: `Nova quadra em ${territory.name}` })

    await user.click(screen.getByRole('button', { name: 'add-a' }))
    await user.click(screen.getByRole('button', { name: 'add-b' }))
    await user.click(screen.getByRole('button', { name: 'add-c' }))
    await user.click(screen.getByRole('button', { name: /salv/i }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(
      screen.getByRole('heading', { name: `Nova quadra em ${territory.name}` })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recarregar' })).not.toBeInTheDocument()
  })

  it('opens the block history sheet after tapping a block and choosing "Ver histórico"', async () => {
    const user = userEvent.setup()
    const block = makeBlock()
    const territory = makeTerritory({ blocks: [block] })
    await renderHome(
      fakeApi({
        session: {
          isConfigured: vi.fn().mockResolvedValue(true),
          configure: vi.fn(),
          signOut: vi.fn(),
          getCongregation: vi.fn().mockResolvedValue(CONGREGATION)
        },
        territories: {
          listWithBlocks: vi.fn().mockResolvedValue([territory]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        },
        workLogs: {
          listFor: vi.fn().mockResolvedValue([]),
          delete: vi.fn()
        }
      })
    )

    await user.click(await screen.findByRole('button', { name: `Quadra ${block.number}` }))
    await user.click(screen.getByRole('menuitem', { name: 'Ver histórico' }))

    expect(
      await screen.findByRole('heading', { name: `Quadra ${block.number} — ${territory.name}` })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '← Voltar' })).toBeInTheDocument()
  })

  it('opens the publishers screen from the sidebar and returns home from "Mapa"', async () => {
    const user = userEvent.setup()
    await renderHome(
      authedApi({
        publishers: {
          list: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          regenerateCode: vi.fn(),
          setActive: vi.fn()
        }
      })
    )

    const nav = screen.getByRole('navigation')
    await user.click(within(nav).getByRole('button', { name: 'Publicadores' }))

    expect(await screen.findByRole('heading', { name: 'Publicadores' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Publicadores' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    // A sidebar section, not a pushed screen -- there is no back bar to leave by.
    expect(screen.queryByRole('button', { name: '← Voltar' })).not.toBeInTheDocument()

    await user.click(within(nav).getByRole('button', { name: 'Mapa' }))

    expect(await screen.findByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
  })
})
