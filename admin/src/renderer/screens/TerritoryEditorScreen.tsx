// Ports `admin/lib/presentation/territory_editor_screen.dart` (removed
// Flutter admin, git history spec 0003 commit 12c95fe): drawing or reshaping
// a territory boundary.
//
// The client refuses an impossible ring before it is ever sent -- that is
// `usePolygonEditor`'s `state.problem` (Task 10), fed by `validateRing`
// (`shared/geo.ts`). Overlap with another territory is not something this
// client can know, though: only the server, with PostGIS and every other
// territory's real geometry, can say that. So a refusal from
// `window.api.territories.create`/`update` is shown exactly as the server
// wrote it -- it already phrases the message for the admin -- and the
// drawing is left on screen instead of being discarded, because redrawing a
// polygon by hand is the one thing the admin cannot get back easily.
import { useMemo, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PolygonEditorLayers } from '../map/PolygonEditorLayers'
import { usePolygonEditor } from '../map/usePolygonEditor'
import type { LatLng } from '../../shared/geo'
import type { Territory } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'

/** Brasília -- the fallback centre when there is nothing to draw yet and no neighbour to anchor on. */
const FALLBACK_CENTER: LatLngTuple = [-15.78, -47.93]
const MAP_ZOOM = 16

export interface TerritoryEditorScreenProps {
  /** Undefined when drawing a brand-new territory. */
  readonly territory?: Territory
  /**
   * Every other territory in the congregation, drawn faintly as
   * non-editable context. The territory being edited (if any) is excluded
   * from this list automatically -- the caller does not need to filter it
   * out itself.
   */
  readonly neighbours?: Territory[]
  /** Fired after a successful save, so the caller decides what happens next (close, refresh, both). */
  readonly onSaved?: () => void
  /**
   * Where the map opens when there is no existing boundary and no neighbour
   * to anchor on -- the congregation's own city, geocoded once by
   * `AuthenticatedApp`. Falls back to Brasília when even that is unavailable.
   */
  readonly fallbackCenter?: LatLngTuple
}

function toTuple(point: LatLng): LatLngTuple {
  return [point.lat, point.lng]
}

/**
 * Where the map opens: the first point of the existing boundary when
 * reshaping one, else the first point of the first neighbour, else the
 * caller's `fallbackCenter`, else Brasília as the last resort. Mirrors
 * `_initialCenter` in the removed Dart screen, with the fallback added.
 */
function initialCenter(
  territory: Territory | undefined,
  neighbours: readonly Territory[],
  fallbackCenter?: LatLngTuple
): LatLngTuple {
  const existing = territory?.boundary
  if (existing !== undefined && existing.length > 0) return toTuple(existing[0])

  const neighbourPoint = neighbours.flatMap((neighbour) => neighbour.boundary)[0]
  if (neighbourPoint !== undefined) return toTuple(neighbourPoint)

  return fallbackCenter ?? FALLBACK_CENTER
}

/**
 * Drawing (or reshaping) one territory boundary.
 *
 * "Salvar" is gated on three things at once: the ring has to be a shape
 * `validateRing` accepts, the name cannot be blank, and there cannot already
 * be a save in flight (a second click while the first request is still
 * pending would race it). None of that is enforced by the server call
 * itself -- disabling the button is what keeps an impossible request from
 * ever being made.
 */
export function TerritoryEditorScreen({
  territory,
  neighbours = [],
  onSaved,
  fallbackCenter
}: TerritoryEditorScreenProps): React.JSX.Element {
  const editor = usePolygonEditor(territory?.boundary ?? [])
  const [name, setName] = useState(territory?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A person is a text label, not a byte string -- trimming padding around
  // it is safe, unlike a password. `ringToJson`-style precision does not
  // apply here.
  const trimmedName = name.trim()
  const canSave = editor.state.problem === null && trimmedName.length > 0 && !saving

  const context = useMemo(
    () =>
      neighbours
        .filter((neighbour) => neighbour.id !== territory?.id)
        .map((neighbour) => neighbour.boundary),
    [neighbours, territory?.id]
  )

  const center = useMemo(
    () => initialCenter(territory, neighbours, fallbackCenter),
    [territory, neighbours, fallbackCenter]
  )

  async function handleSave(): Promise<void> {
    if (!canSave) return

    setSaving(true)
    setError(null)
    try {
      if (territory === undefined) {
        await window.api.territories.create({ name: trimmedName, boundary: editor.points })
      } else {
        await window.api.territories.update(territory.id, {
          name: trimmedName,
          boundary: editor.points
        })
      }
      onSaved?.()
    } catch (thrown) {
      // Verbatim: the server already wrote this message with the admin in
      // mind (e.g. "o território se sobrepõe a Jardim") -- rephrasing it
      // here would only make it less precise. `parseIpcError` is what
      // recovers that verbatim message from a real bridged rejection.
      setError(parseIpcError(thrown, 'Não foi possível salvar o território.').message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1>{territory === undefined ? 'Novo território' : `Editar ${territory.name}`}</h1>

      <label>
        Nome do território
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      <div>
        <button onClick={editor.undo} disabled={!editor.canUndo}>
          Desfazer
        </button>
        <button onClick={editor.clear} disabled={editor.points.length === 0}>
          Apagar tudo
        </button>
        <button onClick={handleSave} disabled={!canSave}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {editor.state.hint !== null && <p>{editor.state.hint}</p>}
      {error !== null && <p role="alert">{error}</p>}

      <MapContainer center={center} zoom={MAP_ZOOM} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <PolygonEditorLayers controller={editor} context={context} />
      </MapContainer>
    </div>
  )
}

export default TerritoryEditorScreen
