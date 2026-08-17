// The only file in the project that imports Leaflet-Geoman
// (@geoman-io/leaflet-geoman-free) -- if the library ever needs to change,
// this is the one file that moves. Same isolation principle the removed
// Flutter admin applied to `flutter_map_line_editor`/`flutter_map_dragmarker`
// in `admin/lib/presentation/map/polygon_editor.dart` (git history, spec
// 0003, commit 12c95fe).
//
// `usePolygonEditor` (Task 10) owns the ring and knows nothing about a map;
// this component is the wiring between its model and Geoman's event-driven
// editing of a live Leaflet layer. Two distinct phases, because "click
// anywhere always looks like a closed, filled shape" (the original approach
// here -- every click just appended a point to a react-leaflet `<Polygon>`,
// which always renders closed) is not the same thing as *drawing* one:
//
//   - **Empty ring** (nothing drawn yet): Geoman's own draw mode
//     (`map.pm.enableDraw('Polygon')`) owns the map -- click to place a
//     vertex, a line trails the cursor, and the ring is only ever considered
//     finished once the admin closes it by clicking back on the first vertex
//     (Geoman's own gesture) or double-clicking. That `pm:create` result is
//     handed to the controller in one `setPoints` call.
//   - **Non-empty ring** (freshly closed, or an existing territory/block
//     being reshaped): a react-leaflet `<Polygon>` renders the ring for
//     real, with Geoman's edit mode enabled on it -- dragging a vertex moves
//     it (`controller.movePoint`), Geoman's own vertex-removal gesture
//     (right-click by default) removes it (`controller.removePoint`).
//     Inserting a vertex mid-edge (Geoman's click-a-midpoint affordance) is
//     turned off: nothing above these two mutations extends the ring by an
//     arbitrary insert once it is closed, so leaving the gesture on would
//     look like it works and then silently do nothing.
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import '@geoman-io/leaflet-geoman-free'

import * as L from 'leaflet'
import { useCallback, useEffect, useRef } from 'react'
import { Polygon, useMap } from 'react-leaflet'
import type { LatLng } from '../../shared/geo'
import type { PolygonEditor } from './usePolygonEditor'

/**
 * Same intent as the removed Dart admin's Material colour scheme (`scheme
 * .primary` / `scheme.error` in the old `PolygonEditorLayers` widget): green
 * while the ring could be saved, red while it could not. This project has no
 * design-token system yet to draw the colours from instead -- if one shows
 * up later, these two constants are what to replace.
 */
const VALID_COLOR = '#2e7d32'
const INVALID_COLOR = '#c62828'
/** Thin, faint outline for non-editable reference context. */
const CONTEXT_COLOR = '#9e9e9e'

/**
 * Options for editing the one ring this component owns, once it is closed.
 *
 * `draggable: false` keeps whole-shape translation off -- only individual
 * vertices move, matching what the ported model supports. `snappable:
 * false` mirrors the Dart admin's documented gap ("Snapping continua não
 * existindo"). `allowSelfIntersection`/`allowSelfIntersectionEdit: true`
 * hand that judgment to `validateRing` (via `state.problem`), which treats
 * it as a hint rather than something Geoman should block or revert.
 * `removeLayerBelowMinVertexCount: true` lets the ring shrink past 3 points
 * while editing -- the hint communicates "too few points", Geoman
 * shouldn't refuse the removal. `addVertexValidation` always returning
 * false is what disables the mid-edge insert discussed above.
 */
const EDIT_OPTIONS: L.PM.EditModeOptions = {
  draggable: false,
  snappable: false,
  allowSelfIntersection: true,
  allowSelfIntersectionEdit: true,
  removeLayerBelowMinVertexCount: true,
  addVertexValidation: () => false
}

/**
 * Options for drawing a brand-new ring from nothing. `finishOn: 'dblclick'`
 * is on top of Geoman's own default finishing gesture (clicking back on the
 * first vertex) -- both close the ring, neither inserts an extra point at
 * the click. `snappable: false` and `allowSelfIntersection: true` mirror
 * {@link EDIT_OPTIONS} for the same reasons.
 */
const DRAW_OPTIONS: L.PM.DrawModeOptions = {
  snappable: false,
  allowSelfIntersection: true,
  finishOn: 'dblclick',
  templineStyle: { color: VALID_COLOR },
  hintlineStyle: { color: VALID_COLOR, dashArray: [5, 5] }
}

/**
 * Geoman's bundled types call `indexPath` a plain `number`, but at runtime
 * (`L.PM.Utils.findDeepMarkerIndex`) it is the full path into the
 * (possibly nested) ring array -- `[ringIndex, vertexIndex]` for an
 * ordinary polygon with no holes. Every ring this app edits is a single,
 * hole-less ring, so the vertex that matters is always the last entry of
 * that path.
 */
function vertexIndexFromPath(indexPath: unknown): number {
  return Array.isArray(indexPath)
    ? (indexPath[indexPath.length - 1] as number)
    : (indexPath as number)
}

function toLatLng(point: L.LatLng): LatLng {
  return { lat: point.lat, lng: point.lng }
}

/**
 * Geoman hands back a polygon's coordinates as `L.LatLng[][]` (one array per
 * ring, for shapes with holes). This app never draws holes, so only the
 * outer ring -- the first one -- is ever meaningful.
 */
function ringFromDrawnLayer(layer: L.Layer): LatLng[] {
  const rings = (layer as L.Polygon).getLatLngs() as L.LatLng[][] | L.LatLng[]
  const outer = Array.isArray(rings[0]) ? (rings[0] as L.LatLng[]) : (rings as L.LatLng[])
  return outer.map(toLatLng)
}

export interface PolygonEditorLayersProps {
  readonly controller: PolygonEditor
  /**
   * Non-editable reference outlines -- the territory a block is being
   * drawn inside, or the neighbouring territories/blocks it must not
   * overlap. Drawn thin and faint, underneath the editable ring.
   */
  readonly context?: LatLng[][]
}

/**
 * The map layers that make a ring drawable and, once closed, editable.
 * Render inside a react-leaflet `MapContainer` (this component renders no
 * `MapContainer` of its own).
 */
export function PolygonEditorLayers({
  controller,
  context
}: PolygonEditorLayersProps): React.JSX.Element {
  const { points, state, movePoint, removePoint, setPoints } = controller
  const map = useMap()
  const layerRef = useRef<L.Polygon | null>(null)

  // Drawing phase: nothing to reshape yet, so Geoman's own draw mode owns
  // the map instead of a react-leaflet `<Polygon>` existing at all. Re-arms
  // whenever the ring goes back to empty (e.g. "Apagar tudo"), and always
  // tears down draw mode on the way out -- both on a real close (`pm:
  // create` firing, handled below) and on unmount, so a screen navigated
  // away from mid-draw never leaves the map stuck in draw mode.
  useEffect(() => {
    if (points.length > 0) return undefined

    map.pm.enableDraw('Polygon', DRAW_OPTIONS)

    const handleCreate = (event: L.LeafletEvent): void => {
      const { layer } = event as L.LeafletEvent & { layer: L.Layer }
      setPoints(ringFromDrawnLayer(layer))
      // The controller's own `points` is what re-renders as the editable
      // `<Polygon>` below -- Geoman's temporary drawn layer is not it, and
      // left on the map the two would sit on top of each other.
      map.removeLayer(layer)
    }

    map.on('pm:create', handleCreate)
    return () => {
      map.off('pm:create', handleCreate)
      map.pm.disableDraw('Polygon')
    }
  }, [points.length, map, setPoints])

  const handleMarkerDragEnd = useCallback(
    (event: L.LeafletEvent) => {
      const payload = event as L.LeafletEvent & {
        indexPath: unknown
        markerEvent: { target: L.Marker }
      }
      movePoint(
        vertexIndexFromPath(payload.indexPath),
        toLatLng(payload.markerEvent.target.getLatLng())
      )
    },
    [movePoint]
  )

  const handleVertexRemoved = useCallback(
    (event: L.LeafletEvent) => {
      const payload = event as L.LeafletEvent & { indexPath: unknown }
      removePoint(vertexIndexFromPath(payload.indexPath))
    },
    [removePoint]
  )

  // React-leaflet keeps the same `L.Polygon` instance alive for the whole
  // life of this element (position changes call `setLatLngs`, they don't
  // recreate it) so this ref callback fires once per mount, once per
  // unmount -- a natural place to bind and unbind the two gestures that
  // don't have another hook to live in.
  const setLayerRef = useCallback(
    (layer: L.Polygon | null) => {
      const previous = layerRef.current
      if (previous && previous !== layer) {
        previous.off('pm:markerdragend', handleMarkerDragEnd)
        previous.off('pm:vertexremoved', handleVertexRemoved)
      }
      layerRef.current = layer
      if (layer) {
        layer.on('pm:markerdragend', handleMarkerDragEnd)
        layer.on('pm:vertexremoved', handleVertexRemoved)
        layer.pm.enable(EDIT_OPTIONS)
      }
    },
    [handleMarkerDragEnd, handleVertexRemoved]
  )

  // Re-sync Geoman's vertex/midpoint markers whenever the ring changes for a
  // reason Geoman itself didn't cause -- an undo, a drawn ring just handed
  // in by `setPoints`. `enable()` is exactly what Geoman uses internally to
  // rebuild its markers from the layer's current coordinates, so calling it
  // again is the supported way to refresh them, not a workaround. This
  // effect always runs after react-leaflet's own effect that applies
  // `positions` to the layer (child effects flush before parent effects),
  // so the coordinates are already current by the time the markers are
  // rebuilt from them.
  useEffect(() => {
    layerRef.current?.pm.enable(EDIT_OPTIONS)
  }, [points])

  const color = state.problem === null ? VALID_COLOR : INVALID_COLOR

  return (
    <>
      {(context ?? []).map((ring, index) => (
        <Polygon
          // Context rings carry no identity of their own here -- they are
          // whatever reference outlines the caller passed for this render.
          key={index}
          positions={ring}
          pathOptions={{ color: CONTEXT_COLOR, weight: 1, fillOpacity: 0.05 }}
          interactive={false}
          pmIgnore
        />
      ))}
      {points.length > 0 && (
        <Polygon
          ref={setLayerRef}
          positions={points}
          pathOptions={{ color, weight: 3, fillOpacity: 0.15 }}
        />
      )}
    </>
  )
}
