// Drawing a block inside a territory, and numbering it. Ported from
// `admin/lib/presentation/block_editor_screen.dart` (removed Flutter admin,
// git history, spec 0003, commit 62d7957) to React + react-leaflet.
//
// The territory's own boundary, and its other blocks, are drawn underneath as
// non-editable context (`PolygonEditorLayers`, Task 11): "the block must be
// entirely inside the territory" is the rule most easily broken by accident
// while drawing. The server is still what decides -- `ST_Within` on the real
// geometry -- so a refusal is shown exactly as its message says, not guessed
// at here.
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Block, Territory } from '../../shared/models'
import type { LatLng } from '../../shared/geo'
import { parseIpcError } from '../../shared/ipc-error'
import { usePolygonEditor } from '../map/usePolygonEditor'
import { PolygonEditorLayers } from '../map/PolygonEditorLayers'

/** Only reached if a territory somehow has an empty boundary. */
const FALLBACK_CENTER: LatLngTuple = [-15.78, -47.93]
const MAP_ZOOM = 17
/** How long the "saved" confirmation stays up before fading on its own. */
const CONFIRMATION_TIMEOUT_MS = 4000

export interface BlockEditorScreenProps {
  readonly territory: Territory
  /** Undefined when drawing a new block. */
  readonly block?: Block
  /** Called with the block as the server saved it, once the save succeeds. */
  readonly onSaved?: (block: Block) => void
}

function toLatLngTuple(point: LatLng): LatLngTuple {
  return [point.lat, point.lng]
}

interface NumberField {
  /** The number to send, or `undefined` to let the server pick the next free one. */
  readonly value: number | undefined
  readonly usable: boolean
}

/**
 * Parses the number field. `Number.parseInt` alone would silently accept
 * "2.5" (truncating to 2) or "-3" -- neither is a valid block number -- so
 * the shape is checked with a plain-digits pattern first, mirroring the
 * Dart original's `int.tryParse` (which rejects a decimal point outright).
 */
function parseNumberField(raw: string): NumberField {
  const trimmed = raw.trim()
  if (trimmed === '') return { value: undefined, usable: true }
  if (!/^\d+$/.test(trimmed)) return { value: undefined, usable: false }
  const parsed = Number(trimmed)
  return parsed >= 1 ? { value: parsed, usable: true } : { value: undefined, usable: false }
}

function errorMessage(error: unknown): string {
  return parseIpcError(error, 'Não foi possível completar a operação.').message
}

/**
 * Drawing or reshaping one block's outline, and its number.
 *
 * `territory` is always required -- a block cannot exist outside one -- and
 * `block` is only present in edit mode, seeding both the ring and the number
 * field. Save/Undo/Clear follow the same enablement rules as the territory
 * editor: Save needs a valid ring, a usable number, and no save already in
 * flight; Undo needs something to undo; Clear needs a non-empty ring.
 */
export function BlockEditorScreen({
  territory,
  block,
  onSaved
}: BlockEditorScreenProps): React.JSX.Element {
  // Which block this screen is currently working on -- starts out matching
  // the `block` prop, but only that: after a successful save the screen
  // returns to create mode on its own (Task 04, spec 0004) without waiting
  // to be unmounted and reopened, because the prop itself never changes.
  const [mode, setMode] = useState<'create' | 'edit'>(block === undefined ? 'create' : 'edit')
  const isCreateMode = mode === 'create'
  const editor = usePolygonEditor(block?.polygon ?? [])
  const [numberText, setNumberText] = useState(block?.number.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const confirmationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seeded once from the `territory` prop, then kept in sync by hand after
  // every successful save -- `territory` itself never changes (it is
  // captured once by `AuthenticatedApp` when this screen opens, and this
  // screen no longer navigates away on save, spec 0004 Task 04). Without
  // this, drawing a second block right after the first would still show the
  // map as if the first one had never been saved: its outline exists on the
  // server, but nowhere the admin can see it here.
  const [sessionBlocks, setSessionBlocks] = useState<Block[]>(territory.blocks)

  useEffect(
    () => () => {
      if (confirmationTimeout.current !== null) clearTimeout(confirmationTimeout.current)
    },
    []
  )

  const { value: chosenNumber, usable: numberIsUsable } = parseNumberField(numberText)
  const canSave = editor.state.problem === null && numberIsUsable && !saving

  // The block actually being edited right now -- distinct from the `block`
  // prop, which never changes: once a save returns the screen to create
  // mode, nothing is "being edited" anymore, even though the prop itself is
  // still set.
  const editingBlock = mode === 'edit' ? block : undefined

  // Every other block in the territory is context; the one being edited is
  // excluded so it isn't drawn twice, once as the (invisible, mid-edit) live
  // ring and once as its old, frozen shape underneath it. Once nothing is
  // being edited, every block -- including the one just finished -- goes
  // back to being plain context.
  const contextRings = useMemo<LatLng[][]>(
    () => [
      territory.boundary,
      ...sessionBlocks
        .filter((other) => other.id !== editingBlock?.id)
        .map((other) => other.polygon)
    ],
    [territory.boundary, sessionBlocks, editingBlock]
  )

  const center =
    territory.boundary.length > 0 ? toLatLngTuple(territory.boundary[0]) : FALLBACK_CENTER

  async function handleSave(): Promise<void> {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const saved = editingBlock
        ? await window.api.blocks.update(editingBlock.id, {
            polygon: editor.points,
            number: chosenNumber
          })
        : await window.api.blocks.create({
            territoryId: territory.id,
            polygon: editor.points,
            number: chosenNumber
          })
      onSaved?.(saved)

      // Replaces the matching entry on an update, appends on a create --
      // either way, the map shows this block's real, saved outline from now
      // on, not the stale copy the screen opened with.
      setSessionBlocks((previous) => [...previous.filter((other) => other.id !== saved.id), saved])

      if (editor.points.length > 0) editor.clear()
      // After creating, the next block is usually the next number on the
      // paper map, so it is suggested up front -- editable and erasable like
      // anything typed. After an *edit* the field goes back to blank instead:
      // "edited number + 1" would usually collide with an existing block.
      setNumberText(editingBlock ? '' : String(saved.number + 1))
      setMode('create')

      if (confirmationTimeout.current !== null) clearTimeout(confirmationTimeout.current)
      setConfirmation(`Quadra ${saved.number} salva.`)
      confirmationTimeout.current = setTimeout(() => {
        setConfirmation(null)
      }, CONFIRMATION_TIMEOUT_MS)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="editor-split screen-workbench">
      <aside className="editor-panel screen-card">
        <div>
          <p className="eyebrow">Quadras</p>
          <h1>
            {editingBlock
              ? `Editar quadra ${editingBlock.number}`
              : `Nova quadra em ${territory.name}`}
          </h1>
        </div>
        {confirmation !== null && <p role="status">{confirmation}</p>}
        <div className="workbench-actions" role="toolbar" aria-label="Ferramentas de desenho">
          <button type="button" onClick={editor.undo} disabled={!editor.canUndo}>
            Desfazer
          </button>
          <button type="button" onClick={editor.clear} disabled={editor.points.length === 0}>
            Apagar tudo
          </button>
          <button type="button" onClick={handleSave} disabled={!canSave}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <div>
          <label htmlFor="block-number-field">Número da quadra</label>
          <input
            id="block-number-field"
            type="text"
            inputMode="numeric"
            value={numberText}
            onChange={(event) => setNumberText(event.target.value)}
          />
          {/* The numbering usually already exists on paper, so leaving it
              blank is the normal path, not an omission -- but only worth
              explaining while there is no number to show yet. */}
          {isCreateMode && <p>Em branco, o servidor usa o menor número livre.</p>}
          {!numberIsUsable && <p role="alert">Use um número a partir de 1.</p>}
        </div>
        {error !== null && <p role="alert">{error}</p>}
        <p>{editor.state.hint ?? 'Arraste um ponto para mover, e segure para remover.'}</p>
      </aside>
      <section className="editor-map" aria-label="Mapa para desenhar a quadra">
        <MapContainer center={center} zoom={MAP_ZOOM} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <PolygonEditorLayers controller={editor} context={contextRings} />
        </MapContainer>
      </section>
    </div>
  )
}

export default BlockEditorScreen
