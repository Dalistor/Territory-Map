// Drawing or reshaping a territory boundary -- ported behaviour from the
// removed Flutter admin's `territory_editor_screen_test.dart` (git history,
// spec 0003, commit 62d7957), adapted to React Testing Library.
//
// `react-leaflet` and `PolygonEditorLayers` (Task 11, Leaflet-Geoman) are
// mocked: what this screen owns is enable/disable logic and which
// `window.api` call fires, not Leaflet's hit-testing or Geoman's gesture
// wiring -- those already have their own coverage (`usePolygonEditor.test.ts`
// for the controller; Leaflet-Geoman itself is a third-party concern). The
// mock exposes a single "add a point" button that appends the next point of
// a fixed triangle, so a test can grow the ring one click at a time exactly
// like three taps on a real map would.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { TerritoryEditorScreen } from './TerritoryEditorScreen'
import type { IpcApi, TerritoryCreateInput, TerritoryUpdateInput } from '../../shared/ipc-contract'
import type { LatLng } from '../../shared/geo'
import type { PolygonEditor } from '../map/usePolygonEditor'
import type { Territory } from '../../shared/models'

/** What three taps on a real map would have produced -- a valid triangle. */
const DRAWN: LatLng[] = [
  { lat: -23.3, lng: -51.16 },
  { lat: -23.3, lng: -51.15 },
  { lat: -23.31, lng: -51.15 }
]

let lastContext: LatLng[][] | undefined

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null
}))

vi.mock('../map/PolygonEditorLayers', () => ({
  PolygonEditorLayers: ({
    controller,
    context
  }: {
    controller: PolygonEditor
    context?: LatLng[][]
  }) => {
    lastContext = context
    return (
      <button onClick={() => controller.addPoint(DRAWN[controller.points.length % DRAWN.length])}>
        Adicionar ponto
      </button>
    )
  }
}))

/** A fake covering every member of `IpcApi` -- this screen only calls
 * `territories.create`/`territories.update`, but the interface is wide, and
 * `vi.fn()` stubs for the rest keep this fake honest about what it
 * implements without touching the real IPC bridge. */
function fakeApi(
  overrides: Partial<Pick<IpcApi['territories'], 'create' | 'update'>> = {}
): IpcApi {
  return {
    session: {
      isConfigured: vi.fn(),
      configure: vi.fn(),
      signOut: vi.fn(),
      getCongregation: vi.fn()
    },
    territories: {
      listWithBlocks: vi.fn(),
      create: overrides.create ?? vi.fn(),
      update: overrides.update ?? vi.fn(),
      delete: vi.fn()
    },
    blocks: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    publishers: {
      list: vi.fn(),
      create: vi.fn(),
      regenerateCode: vi.fn(),
      rename: vi.fn(),
      setActive: vi.fn(),
      delete: vi.fn()
    },
    assignments: {
      listAll: vi.fn().mockResolvedValue([]),
      listFor: vi.fn(),
      designate: vi.fn(),
      complete: vi.fn(),
      delete: vi.fn(),
      update: vi.fn()
    },
    exports: { assignments: vi.fn(), s13t: vi.fn(), s13tDocx: vi.fn() },
    imports: { s13tSelectAndPreview: vi.fn(), s13tExecute: vi.fn() },
    workLogs: { listFor: vi.fn(), delete: vi.fn(), markWorked: vi.fn() },
    campaigns: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      designate: vi.fn(),
      setPublishers: vi.fn(),
      complete: vi.fn()
    },
    geo: { geocodeCity: vi.fn() }
  }
}

const CENTRO: Territory = { id: 't1', name: 'Centro - N5', boundary: DRAWN, blocks: [] }

/** A resolvable/rejectable promise this test can settle whenever it wants,
 * so "Salvar" can be inspected while a save is still pending. */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function addPoints(user: ReturnType<typeof userEvent.setup>, count: number): Promise<void> {
  const button = screen.getByRole('button', { name: 'Adicionar ponto' })
  for (let i = 0; i < count; i++) {
    await user.click(button)
  }
}

beforeEach(() => {
  lastContext = undefined
})

describe('TerritoryEditorScreen', () => {
  it('shows a creation heading when no territory is given', () => {
    window.api = fakeApi({})
    render(<TerritoryEditorScreen />)

    expect(screen.getByText('Novo território')).toBeInTheDocument()
  })

  it('shows an edit heading naming the territory when one is given', () => {
    window.api = fakeApi({})
    render(<TerritoryEditorScreen territory={CENTRO} />)

    expect(screen.getByText('Editar Centro - N5')).toBeInTheDocument()
  })

  it('disables Salvar with nothing drawn and no name', () => {
    window.api = fakeApi({})
    render(<TerritoryEditorScreen />)

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('keeps Salvar disabled with a name but fewer than three points', async () => {
    const user = userEvent.setup()
    window.api = fakeApi({})
    render(<TerritoryEditorScreen />)

    await user.type(screen.getByLabelText('Nome do território'), 'Centro')
    await addPoints(user, 2)

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('keeps Salvar disabled with a valid ring but no name', async () => {
    const user = userEvent.setup()
    window.api = fakeApi({})
    render(<TerritoryEditorScreen />)

    await addPoints(user, 3)

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('keeps Salvar disabled when the name is only whitespace', async () => {
    const user = userEvent.setup()
    window.api = fakeApi({})
    render(<TerritoryEditorScreen />)

    await user.type(screen.getByLabelText('Nome do território'), '   ')
    await addPoints(user, 3)

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('enables Salvar once the numbered name is filled and the ring is valid', async () => {
    const user = userEvent.setup()
    window.api = fakeApi({})
    render(<TerritoryEditorScreen />)

    await user.type(screen.getByLabelText('Nome do território'), 'Centro - N5')
    await addPoints(user, 3)

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
  })

  it('keeps Salvar disabled while the name has no number, and explains why', async () => {
    const user = userEvent.setup()
    window.api = fakeApi({})
    render(<TerritoryEditorScreen />)

    await user.type(screen.getByLabelText('Nome do território'), 'Centro')
    await addPoints(user, 3)

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    expect(
      screen.getByText('O nome precisa incluir o número do território (ex.: Centro - N5).')
    ).toBeInTheDocument()
  })

  it('does not nag about the number while the name is still empty', () => {
    window.api = fakeApi({})
    render(<TerritoryEditorScreen />)

    expect(
      screen.queryByText('O nome precisa incluir o número do território (ex.: Centro - N5).')
    ).not.toBeInTheDocument()
  })

  it('disables Desfazer with nothing drawn, and enables it after a mutation', async () => {
    const user = userEvent.setup()
    window.api = fakeApi({})
    render(<TerritoryEditorScreen />)

    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeDisabled()

    await addPoints(user, 1)

    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeEnabled()
  })

  it('disables Apagar tudo with an empty ring, and enables it once a point exists', async () => {
    const user = userEvent.setup()
    window.api = fakeApi({})
    render(<TerritoryEditorScreen />)

    expect(screen.getByRole('button', { name: 'Apagar tudo' })).toBeDisabled()

    await addPoints(user, 1)

    expect(screen.getByRole('button', { name: 'Apagar tudo' })).toBeEnabled()
  })

  it('disables Apagar tudo again once it wipes the ring', async () => {
    const user = userEvent.setup()
    window.api = fakeApi({})
    render(<TerritoryEditorScreen />)

    await addPoints(user, 1)
    await user.click(screen.getByRole('button', { name: 'Apagar tudo' }))

    expect(screen.getByRole('button', { name: 'Apagar tudo' })).toBeDisabled()
  })

  it('seeds the editor with the existing boundary in edit mode: nothing to undo, something to wipe', () => {
    window.api = fakeApi({})
    render(<TerritoryEditorScreen territory={CENTRO} />)

    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Apagar tudo' })).toBeEnabled()
    // The name and the seeded ring are both already valid, so saving is
    // immediately possible without touching anything.
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
  })

  it('creates a territory with the trimmed name and the drawn ring, then reports success', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async (input: TerritoryCreateInput) => ({
      id: 'new',
      name: input.name,
      boundary: input.boundary,
      blocks: []
    }))
    window.api = fakeApi({ create })
    const onSaved = vi.fn()
    render(<TerritoryEditorScreen onSaved={onSaved} />)

    await user.type(screen.getByLabelText('Nome do território'), '  Centro - N5  ')
    await addPoints(user, 3)
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({ name: 'Centro - N5', boundary: DRAWN })
  })

  it('updates the existing territory by id instead of creating a new one', async () => {
    const user = userEvent.setup()
    const update = vi.fn(async (id: string, input: TerritoryUpdateInput) => ({
      id,
      name: input.name ?? '',
      boundary: input.boundary ?? [],
      blocks: []
    }))
    window.api = fakeApi({ update })
    const onSaved = vi.fn()
    render(<TerritoryEditorScreen territory={CENTRO} onSaved={onSaved} />)

    await user.click(screen.getByRole('button', { name: 'Apagar tudo' }))
    await addPoints(user, 3)
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith('t1', { name: 'Centro - N5', boundary: DRAWN })
  })

  it('disables Salvar while a save is still pending', async () => {
    const user = userEvent.setup()
    const { promise, resolve } = deferred<{
      id: string
      name: string
      boundary: LatLng[]
      blocks: []
    }>()
    const create = vi.fn(() => promise)
    window.api = fakeApi({ create })
    render(<TerritoryEditorScreen />)

    await user.type(screen.getByLabelText('Nome do território'), 'Centro - N5')
    await addPoints(user, 3)
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.getByRole('button', { name: /Salvar|Salvando/ })).toBeDisabled()

    resolve({ id: 'new', name: 'Centro - N5', boundary: DRAWN, blocks: [] })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled())
  })

  it('shows a server refusal verbatim, keeps the drawing, and lets the admin retry', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async () => {
      throw new Error('O território se sobrepõe a Jardim. Ajuste o desenho.')
    })
    window.api = fakeApi({ create })
    const onSaved = vi.fn()
    render(<TerritoryEditorScreen onSaved={onSaved} />)

    await user.type(screen.getByLabelText('Nome do território'), 'Vila Nova - N3')
    await addPoints(user, 3)
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(
      await screen.findByText('O território se sobrepõe a Jardim. Ajuste o desenho.')
    ).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    // Nothing is thrown away on a refusal -- the ring is still there to fix.
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
  })

  it('excludes the territory being edited from its own neighbour context', () => {
    const jardim: Territory = { id: 't2', name: 'Jardim', boundary: DRAWN, blocks: [] }
    window.api = fakeApi({})
    render(<TerritoryEditorScreen territory={CENTRO} neighbours={[CENTRO, jardim]} />)

    expect(lastContext).toEqual([jardim.boundary])
  })

  it('draws every neighbour when creating a brand-new territory', () => {
    const jardim: Territory = { id: 't2', name: 'Jardim', boundary: DRAWN, blocks: [] }
    window.api = fakeApi({})
    render(<TerritoryEditorScreen neighbours={[CENTRO, jardim]} />)

    expect(lastContext).toEqual([CENTRO.boundary, jardim.boundary])
  })
})
