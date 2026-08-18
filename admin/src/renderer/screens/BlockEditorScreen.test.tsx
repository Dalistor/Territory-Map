// Ported from `admin/lib/presentation/block_editor_screen.dart` (removed
// Flutter admin, git history, spec 0003, commit 62d7957). `react-leaflet` and
// `PolygonEditorLayers` (Task 11, which itself pulls in Leaflet-Geoman) are
// mocked here rather than mounted for real: jsdom has no layout engine, and
// Leaflet needs one to size its container. The fake `PolygonEditorLayers`
// below exposes three buttons that call straight through to the *real*
// `usePolygonEditor` controller it is handed -- so these tests exercise the
// actual ring/undo state machine (already covered in isolation by
// `usePolygonEditor.test.ts`), just without a real map underneath it.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ReactNode } from 'react'
import type { Block, Territory } from '../../shared/models'
import type { LatLng } from '../../shared/geo'
import type { IpcApi } from '../../shared/ipc-contract'
import type { PolygonEditor } from '../map/usePolygonEditor'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center }: { children?: ReactNode; center?: [number, number] }) => (
    <div>
      <div data-testid="center-json">{JSON.stringify(center ?? null)}</div>
      {children}
    </div>
  ),
  TileLayer: () => null
}))

vi.mock('../map/PolygonEditorLayers', () => ({
  PolygonEditorLayers: ({
    controller,
    context
  }: {
    controller: PolygonEditor
    context?: LatLng[][]
  }) => (
    <div>
      <div data-testid="context-json">{JSON.stringify(context ?? [])}</div>
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

// Imported after the mocks above so the component under test picks them up.
const { BlockEditorScreen } = await import('./BlockEditorScreen')

const TERRITORY_BOUNDARY: LatLng[] = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 10 },
  { lat: 10, lng: 10 },
  { lat: 10, lng: 0 }
]

const EXISTING_BLOCK: Block = {
  id: 'block-1',
  number: 5,
  polygon: [
    { lat: 1, lng: 1 },
    { lat: 1, lng: 2 },
    { lat: 2, lng: 2 },
    { lat: 2, lng: 1 }
  ]
}

const OTHER_BLOCK: Block = {
  id: 'block-2',
  number: 2,
  polygon: [
    { lat: 3, lng: 3 },
    { lat: 3, lng: 4 },
    { lat: 4, lng: 4 }
  ]
}

function makeTerritory(blocks: Block[] = []): Territory {
  return { id: 'territory-1', name: 'Bairro Norte', boundary: TERRITORY_BOUNDARY, blocks }
}

/** A fake `window.api`; only `blocks.create`/`blocks.update` are exercised per test. */
function makeApi(overrides: Partial<IpcApi['blocks']> = {}): IpcApi {
  return {
    session: {
      isConfigured: vi.fn(),
      configure: vi.fn(),
      signOut: vi.fn(),
      getCongregation: vi.fn()
    },
    territories: {
      listWithBlocks: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      assign: vi.fn()
    },
    blocks: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      ...overrides
    },
    publishers: {
      list: vi.fn(),
      create: vi.fn(),
      regenerateCode: vi.fn(),
      setActive: vi.fn()
    },
    workLogs: { listFor: vi.fn(), delete: vi.fn() },
    geo: { geocodeCity: vi.fn() }
  }
}

/** Matches both "Salvar" and the in-flight "Salvando…" label. */
function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /salv/i }) as HTMLButtonElement
}

function undoButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Desfazer' }) as HTMLButtonElement
}

function clearButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Apagar tudo' }) as HTMLButtonElement
}

function numberField(): HTMLInputElement {
  return screen.getByLabelText('Número da quadra') as HTMLInputElement
}

/** Clicks the three fake add-point buttons, which always form a valid triangle. */
async function drawValidRing(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'add-a' }))
  await user.click(screen.getByRole('button', { name: 'add-b' }))
  await user.click(screen.getByRole('button', { name: 'add-c' }))
}

beforeEach(() => {
  window.api = makeApi()
})

describe('BlockEditorScreen', () => {
  it('shows the create-mode title with an empty, unsavable ring', () => {
    const territory = makeTerritory()
    render(<BlockEditorScreen territory={territory} onSaved={vi.fn()} />)

    expect(screen.getByText(`Nova quadra em ${territory.name}`)).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
    expect(undoButton().disabled).toBe(true)
    expect(clearButton().disabled).toBe(true)
  })

  it('explains the blank-number default only in create mode', () => {
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    expect(screen.getByText('Em branco, o servidor usa o menor número livre.')).toBeTruthy()
  })

  it('hides the blank-number explanation when editing an existing block', () => {
    render(
      <BlockEditorScreen
        territory={makeTerritory([EXISTING_BLOCK])}
        block={EXISTING_BLOCK}
        onSaved={vi.fn()}
      />
    )

    expect(screen.queryByText('Em branco, o servidor usa o menor número livre.')).toBeNull()
  })

  it('seeds the title and number field from the existing block in edit mode', () => {
    render(
      <BlockEditorScreen
        territory={makeTerritory([EXISTING_BLOCK])}
        block={EXISTING_BLOCK}
        onSaved={vi.fn()}
      />
    )

    expect(screen.getByText('Editar quadra 5')).toBeTruthy()
    expect(numberField().value).toBe('5')
  })

  it('starts already savable when editing a block with a valid existing polygon', () => {
    render(
      <BlockEditorScreen
        territory={makeTerritory([EXISTING_BLOCK])}
        block={EXISTING_BLOCK}
        onSaved={vi.fn()}
      />
    )

    expect(saveButton().disabled).toBe(false)
    // Seeding the ring does not itself count as a mutation to undo.
    expect(undoButton().disabled).toBe(true)
  })

  it('centers the map on the first point of the territory boundary', () => {
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    const center = JSON.parse(screen.getByTestId('center-json').textContent ?? 'null')
    expect(center).toEqual([TERRITORY_BOUNDARY[0].lat, TERRITORY_BOUNDARY[0].lng])
  })

  it('falls back to a default center when the territory has no boundary yet', () => {
    render(<BlockEditorScreen territory={{ ...makeTerritory(), boundary: [] }} onSaved={vi.fn()} />)

    const center = JSON.parse(screen.getByTestId('center-json').textContent ?? 'null')
    expect(center).toEqual([-15.78, -47.93])
  })

  it('excludes the block being edited from the non-editable context, keeping the rest', () => {
    render(
      <BlockEditorScreen
        territory={makeTerritory([EXISTING_BLOCK, OTHER_BLOCK])}
        block={EXISTING_BLOCK}
        onSaved={vi.fn()}
      />
    )

    const context = JSON.parse(screen.getByTestId('context-json').textContent ?? '[]')
    expect(context).toEqual([TERRITORY_BOUNDARY, OTHER_BLOCK.polygon])
  })

  it('includes every existing block as context when creating a new one', () => {
    render(
      <BlockEditorScreen
        territory={makeTerritory([EXISTING_BLOCK, OTHER_BLOCK])}
        onSaved={vi.fn()}
      />
    )

    const context = JSON.parse(screen.getByTestId('context-json').textContent ?? '[]')
    expect(context).toEqual([TERRITORY_BOUNDARY, EXISTING_BLOCK.polygon, OTHER_BLOCK.polygon])
  })

  it('enables Save only once three points make a valid ring', async () => {
    const user = userEvent.setup()
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'add-a' }))
    await user.click(screen.getByRole('button', { name: 'add-b' }))
    expect(saveButton().disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: 'add-c' }))
    expect(saveButton().disabled).toBe(false)
  })

  it('enables Undo after the first point, and disables it again once undone away', async () => {
    const user = userEvent.setup()
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'add-a' }))
    expect(undoButton().disabled).toBe(false)

    await user.click(undoButton())
    expect(undoButton().disabled).toBe(true)
  })

  it('disables Apagar tudo while the ring is empty, and clears every point when clicked', async () => {
    const user = userEvent.setup()
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    expect(clearButton().disabled).toBe(true)
    await drawValidRing(user)
    expect(clearButton().disabled).toBe(false)

    await user.click(clearButton())

    expect(clearButton().disabled).toBe(true)
    expect(saveButton().disabled).toBe(true)
  })

  it('rejects a non-integer number, disabling Save even with a valid ring', async () => {
    const user = userEvent.setup()
    render(
      <BlockEditorScreen
        territory={makeTerritory([EXISTING_BLOCK])}
        block={EXISTING_BLOCK}
        onSaved={vi.fn()}
      />
    )
    expect(saveButton().disabled).toBe(false) // sanity: valid before touching the field

    await user.clear(numberField())
    await user.type(numberField(), 'abc')

    expect(screen.getByText('Use um número a partir de 1.')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('rejects zero, since numbering starts at 1', async () => {
    const user = userEvent.setup()
    render(
      <BlockEditorScreen
        territory={makeTerritory([EXISTING_BLOCK])}
        block={EXISTING_BLOCK}
        onSaved={vi.fn()}
      />
    )

    await user.clear(numberField())
    await user.type(numberField(), '0')

    expect(screen.getByText('Use um número a partir de 1.')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('accepts a positive integer typed into the number field', async () => {
    const user = userEvent.setup()
    render(
      <BlockEditorScreen
        territory={makeTerritory([EXISTING_BLOCK])}
        block={EXISTING_BLOCK}
        onSaved={vi.fn()}
      />
    )

    await user.clear(numberField())
    await user.type(numberField(), '12')

    expect(screen.queryByText('Use um número a partir de 1.')).toBeNull()
    expect(saveButton().disabled).toBe(false)
  })

  it('creates a block with the drawn ring and the chosen number', async () => {
    const user = userEvent.setup()
    const created: Block = { id: 'new-block', number: 9, polygon: [] }
    const create = vi.fn().mockResolvedValue(created)
    window.api = makeApi({ create })
    const onSaved = vi.fn()
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={onSaved} />)

    await drawValidRing(user)
    await user.type(numberField(), '9')
    await user.click(saveButton())

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith({
      territoryId: 'territory-1',
      polygon: [
        { lat: 1, lng: 1 },
        { lat: 1, lng: 2 },
        { lat: 2, lng: 2 }
      ],
      number: 9
    })
    expect(onSaved).toHaveBeenCalledWith(created)
  })

  it('creates a block with no number, letting the server choose the next free one', async () => {
    const user = userEvent.setup()
    const create = vi.fn().mockResolvedValue({ id: 'new-block', number: 1, polygon: [] })
    window.api = makeApi({ create })
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    await drawValidRing(user)
    await user.click(saveButton())

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0].number).toBeUndefined()
  })

  it('updates an existing block with the drawn ring and the chosen number', async () => {
    const user = userEvent.setup()
    const updated: Block = { ...EXISTING_BLOCK, number: 8 }
    const update = vi.fn().mockResolvedValue(updated)
    window.api = makeApi({ update })
    const onSaved = vi.fn()
    render(
      <BlockEditorScreen
        territory={makeTerritory([EXISTING_BLOCK])}
        block={EXISTING_BLOCK}
        onSaved={onSaved}
      />
    )

    await user.clear(numberField())
    await user.type(numberField(), '8')
    await user.click(saveButton())

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith('block-1', {
      polygon: EXISTING_BLOCK.polygon,
      number: 8
    })
    expect(onSaved).toHaveBeenCalledWith(updated)
  })

  it('shows the server error verbatim and re-enables Save after a failed save', async () => {
    const user = userEvent.setup()
    const create = vi
      .fn()
      .mockRejectedValue(new Error('A quadra precisa ficar dentro do território.'))
    window.api = makeApi({ create })
    const onSaved = vi.fn()
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={onSaved} />)

    await drawValidRing(user)
    await user.click(saveButton())

    expect(await screen.findByText('A quadra precisa ficar dentro do território.')).toBeTruthy()
    expect(saveButton().disabled).toBe(false)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('falls back to a generic message for a rejection that carries no usable message', async () => {
    const user = userEvent.setup()
    const create = vi.fn().mockRejectedValue('boom')
    window.api = makeApi({ create })
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    await drawValidRing(user)
    await user.click(saveButton())

    expect(await screen.findByText('Não foi possível completar a operação.')).toBeTruthy()
  })

  it('shows a temporary confirmation naming the block number after a successful create', async () => {
    const user = userEvent.setup()
    const created: Block = { id: 'new-block', number: 9, polygon: [] }
    const create = vi.fn().mockResolvedValue(created)
    window.api = makeApi({ create })
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    await drawValidRing(user)
    await user.type(numberField(), '9')
    await user.click(saveButton())

    expect(await screen.findByRole('status')).toHaveTextContent('Quadra 9 salva.')
  })

  it('resets the ring to empty after a successful create, ready for the next block', async () => {
    const user = userEvent.setup()
    const created: Block = { id: 'new-block', number: 9, polygon: [] }
    const create = vi.fn().mockResolvedValue(created)
    window.api = makeApi({ create })
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    await drawValidRing(user)
    await user.type(numberField(), '9')
    await user.click(saveButton())

    await screen.findByRole('status')
    expect(clearButton().disabled).toBe(true)
    expect(screen.getByText('Toque no mapa para marcar ao menos 3 pontos.')).toBeTruthy()
  })

  it('suggests the saved number plus one in the number field after a successful create', async () => {
    const user = userEvent.setup()
    const created: Block = { id: 'new-block', number: 7, polygon: [] }
    const create = vi.fn().mockResolvedValue(created)
    window.api = makeApi({ create })
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    await drawValidRing(user)
    await user.click(saveButton())

    await screen.findByRole('status')
    expect(numberField().value).toBe('8')
  })

  it('sends the suggested next number on the following save without retyping', async () => {
    const user = userEvent.setup()
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: 'block-a', number: 7, polygon: [] })
      .mockResolvedValueOnce({ id: 'block-b', number: 8, polygon: [] })
    window.api = makeApi({ create })
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    await drawValidRing(user)
    await user.click(saveButton())
    await screen.findByRole('status')

    await drawValidRing(user)
    await user.click(saveButton())

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    expect(create.mock.calls[1][0].number).toBe(8)
  })

  it('lets the admin erase the suggested number and save blank, leaving the choice to the server', async () => {
    const user = userEvent.setup()
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: 'block-a', number: 7, polygon: [] })
      .mockResolvedValueOnce({ id: 'block-b', number: 1, polygon: [] })
    window.api = makeApi({ create })
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    await drawValidRing(user)
    await user.click(saveButton())
    await screen.findByRole('status')

    await user.clear(numberField())
    await drawValidRing(user)
    await user.click(saveButton())

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    expect(create.mock.calls[1][0].number).toBeUndefined()
  })

  it('adds the newly created block to the map context, so drawing the next one shows it', async () => {
    const created: Block = { id: 'new-block', number: 9, polygon: [{ lat: 1, lng: 1 }] }
    const create = vi.fn().mockResolvedValue(created)
    window.api = makeApi({ create })
    const user = userEvent.setup()
    render(<BlockEditorScreen territory={makeTerritory([EXISTING_BLOCK])} onSaved={vi.fn()} />)

    await drawValidRing(user)
    await user.type(numberField(), '9')
    await user.click(saveButton())
    await screen.findByRole('status')

    const context = JSON.parse(screen.getByTestId('context-json').textContent ?? '[]')
    expect(context).toEqual([TERRITORY_BOUNDARY, EXISTING_BLOCK.polygon, created.polygon])
  })

  it('replaces, not duplicates, the map context entry after saving an edit to an existing block', async () => {
    const updated: Block = { ...EXISTING_BLOCK, polygon: [{ lat: 9, lng: 9 }] }
    const update = vi.fn().mockResolvedValue(updated)
    window.api = makeApi({ update })
    const user = userEvent.setup()
    render(
      <BlockEditorScreen
        territory={makeTerritory([EXISTING_BLOCK, OTHER_BLOCK])}
        block={EXISTING_BLOCK}
        onSaved={vi.fn()}
      />
    )

    await user.click(saveButton())
    await screen.findByRole('status')

    // Now drawing a brand-new block (mode returned to 'create'): the context
    // should show the *updated* shape of the edited block exactly once, not
    // the stale one it opened with and not both.
    const context = JSON.parse(screen.getByTestId('context-json').textContent ?? '[]')
    expect(context).toEqual([TERRITORY_BOUNDARY, OTHER_BLOCK.polygon, updated.polygon])
  })

  it('returns to create mode after successfully saving an edit to an existing block', async () => {
    const user = userEvent.setup()
    const updated: Block = { ...EXISTING_BLOCK, number: 8 }
    const update = vi.fn().mockResolvedValue(updated)
    window.api = makeApi({ update })
    render(
      <BlockEditorScreen
        territory={makeTerritory([EXISTING_BLOCK])}
        block={EXISTING_BLOCK}
        onSaved={vi.fn()}
      />
    )

    await user.clear(numberField())
    await user.type(numberField(), '8')
    await user.click(saveButton())

    await screen.findByRole('status')
    expect(screen.getByText('Nova quadra em Bairro Norte')).toBeTruthy()
    expect(screen.queryByText(/^Editar quadra/)).toBeNull()
    // Blank, not "edited + 1" -- suggesting a number after an edit would
    // usually collide with a block that already exists.
    expect(numberField().value).toBe('')
  })

  it('hides the confirmation after a few seconds', async () => {
    // Drawing and typing happen under real timers -- userEvent's pointer
    // machinery doesn't play well with fake ones -- and only the click that
    // triggers the save (via the lower-level `fireEvent`, which dispatches
    // synchronously with no timer-driven waiting of its own) runs under fake
    // timers, so the confirmation's own `setTimeout` can be fast-forwarded.
    const user = userEvent.setup()
    const created: Block = { id: 'new-block', number: 9, polygon: [] }
    const create = vi.fn().mockResolvedValue(created)
    window.api = makeApi({ create })
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    await drawValidRing(user)
    await user.type(numberField(), '9')

    vi.useFakeTimers()
    try {
      fireEvent.click(saveButton())
      await vi.waitFor(() => expect(screen.getByRole('status')).toBeTruthy())

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })

      expect(screen.queryByRole('status')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears a still-pending confirmation timeout before scheduling a new one, so back-to-back saves do not hide each other early', async () => {
    const user = userEvent.setup()
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: 'block-a', number: 9, polygon: [] })
      .mockResolvedValueOnce({ id: 'block-b', number: 10, polygon: [] })
    window.api = makeApi({ create })
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    await drawValidRing(user)
    await user.type(numberField(), '9')

    vi.useFakeTimers()
    try {
      fireEvent.click(saveButton())
      await vi.waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Quadra 9 salva.')
      )

      // Three seconds into the first confirmation's four-second lifetime,
      // draw and save a second block -- if the first timeout were left
      // running instead of cleared, it would fire partway through the
      // second confirmation's own window and hide it early.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })

      fireEvent.click(screen.getByRole('button', { name: 'add-a' }))
      fireEvent.click(screen.getByRole('button', { name: 'add-b' }))
      fireEvent.click(screen.getByRole('button', { name: 'add-c' }))
      fireEvent.change(numberField(), { target: { value: '10' } })
      fireEvent.click(saveButton())

      await vi.waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Quadra 10 salva.')
      )

      // 1.5s later -- past when the stale first timeout would have fired
      // (it was due at the 4s mark, i.e. 1s from here) -- the second
      // confirmation must still be up.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })
      expect(screen.getByRole('status')).toHaveTextContent('Quadra 10 salva.')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(screen.queryByRole('status')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('disables Save and shows a saving indicator while the request is in flight', async () => {
    const user = userEvent.setup()
    let resolveCreate: (block: Block) => void = () => {}
    const create: Mock = vi.fn(
      () =>
        new Promise<Block>((resolve) => {
          resolveCreate = resolve
        })
    )
    window.api = makeApi({ create })
    render(<BlockEditorScreen territory={makeTerritory()} onSaved={vi.fn()} />)

    await drawValidRing(user)
    await user.click(saveButton())

    expect(saveButton().disabled).toBe(true)
    expect(screen.getByText('Salvando…')).toBeTruthy()

    resolveCreate({ id: 'new-block', number: 1, polygon: [] })
    // The in-flight indicator clears -- but Save stays disabled, because a
    // successful save now resets the ring for the next block (Task 04, spec
    // 0004) rather than leaving the just-saved shape re-savable.
    await waitFor(() => expect(screen.queryByText('Salvando…')).toBeNull())
    expect(saveButton().disabled).toBe(true)
  })
})
