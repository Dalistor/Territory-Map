// The only file in the project that imports Leaflet-Geoman
// (@geoman-io/leaflet-geoman-free) -- if the library ever needs to change,
// this is the one file that moves. Same isolation principle the removed
// Flutter admin applied to `flutter_map_line_editor`/`flutter_map_dragmarker`
// in `admin/lib/presentation/map/polygon_editor.dart` (git history, spec
// 0003, commit 12c95fe).
//
// `usePolygonEditor` (Task 10) owns the ring and knows nothing about a map;
// this component is the wiring between its model and Geoman's event-driven
// editing of a live Leaflet layer. Three gestures matter here:
//   - clicking the map appends a point (`controller.addPoint`);
//   - dragging an existing vertex moves it (`controller.movePoint`);
//   - Geoman's own vertex-removal gesture (right-click by default) removes
//     it (`controller.removePoint`).
// Inserting a vertex mid-edge -- Geoman's click-a-midpoint affordance -- is
// deliberately turned off below: `usePolygonEditor` only supports appending
// to the end of the ring, so a mid-ring insert would have no way to reach
// the controller and would be silently discarded the next time any other
// mutation re-synced the layer from `controller.points`. Disabling the
// gesture is clearer than leaving a control that looks like it works once
// and then doesn't.
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import '@geoman-io/leaflet-geoman-free'

import * as L from 'leaflet'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Polygon, useMapEvents } from 'react-leaflet'
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
 * Options for editing the one ring this component owns.
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
 * The map layers that make a ring editable. Render inside a react-leaflet
 * `MapContainer` (this component renders no `MapContainer` of its own).
 */
export function PolygonEditorLayers({
  controller,
  context
}: PolygonEditorLayersProps): React.JSX.Element {
  const { points, state, addPoint, movePoint, removePoint } = controller
  const layerRef = useRef<L.Polygon | null>(null)

  const mapEventHandlers = useMemo(
    () => ({
      click(event: L.LeafletMouseEvent) {
        addPoint(toLatLng(event.latlng))
      }
    }),
    [addPoint]
  )
  useMapEvents(mapEventHandlers)

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
  // reason Geoman itself didn't cause -- a click adding a point, an undo, a
  // clear. `enable()` is exactly what Geoman uses internally to rebuild its
  // markers from the layer's current coordinates, so calling it again is
  // the supported way to refresh them, not a workaround. This effect always
  // runs after react-leaflet's own effect that applies `positions` to the
  // layer (child effects flush before parent effects), so the coordinates
  // are already current by the time the markers are rebuilt from them.
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
