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
import { useMemo, useState } from 'react'
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
  const isNew = block === undefined
  const editor = usePolygonEditor(block?.polygon ?? [])
  const [numberText, setNumberText] = useState(block?.number.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { value: chosenNumber, usable: numberIsUsable } = parseNumberField(numberText)
  const canSave = editor.state.problem === null && numberIsUsable && !saving

  // Every other block in the territory is context; the one being edited is
  // excluded so it isn't drawn twice, once as the (invisible, mid-edit) live
  // ring and once as its old, frozen shape underneath it.
  const contextRings = useMemo<LatLng[][]>(
    () => [
      territory.boundary,
      ...territory.blocks.filter((other) => other.id !== block?.id).map((other) => other.polygon)
    ],
    [territory, block]
  )

  const center =
    territory.boundary.length > 0 ? toLatLngTuple(territory.boundary[0]) : FALLBACK_CENTER

  async function handleSave(): Promise<void> {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const saved = isNew
        ? await window.api.blocks.create({
            territoryId: territory.id,
            polygon: editor.points,
            number: chosenNumber
          })
        : await window.api.blocks.update(block.id, {
            polygon: editor.points,
            number: chosenNumber
          })
      onSaved?.(saved)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1>{isNew ? `Nova quadra em ${territory.name}` : `Editar quadra ${block.number}`}</h1>
      <div role="toolbar">
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
        {isNew && <p>Em branco, o servidor usa o menor número livre.</p>}
        {!numberIsUsable && <p role="alert">Use um número a partir de 1.</p>}
      </div>
      {error !== null && <p role="alert">{error}</p>}
      <p>{editor.state.hint ?? 'Arraste um ponto para mover, e segure para remover.'}</p>
      <div style={{ height: '480px', width: '100%' }}>
        <MapContainer center={center} zoom={MAP_ZOOM} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <PolygonEditorLayers controller={editor} context={contextRings} />
        </MapContainer>
      </div>
    </div>
  )
}

export default BlockEditorScreen
