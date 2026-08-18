// The Designations page's map: territory outlines only -- no blocks, no
// block numbers -- with each territory's assigned publisher (or the lack of
// one) written over its centroid. Follows `TerritoryMap.tsx` for everything
// structural (react-leaflet, OSM tiles, initial-view resolution), so swapping
// the map library later stays confined to this folder.
//
// OpenStreetMap tile usage policy
// (https://operations.osmfoundation.org/policies/tiles/): identify the app
// with a User-Agent and never bulk-download tiles. This component never
// fetches more than the visible viewport needs, and the on-screen
// attribution below is the other half the policy asks for.
import { useMemo } from 'react'
import { MapContainer, TileLayer, Polygon, Marker, useMapEvents } from 'react-leaflet'
import { DivIcon, type LatLngTuple } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Territory } from '../../shared/models'
import type { LatLng } from '../../shared/geo'

/** Brasília -- the fallback centre when there is nothing to draw yet. */
const FALLBACK_CENTER: LatLngTuple = [-15.78, -47.93]
const FALLBACK_ZOOM = 4
const TERRITORY_ZOOM = 15

const ASSIGNED_COLOR = '#1565c0'
const UNASSIGNED_COLOR = '#78909c'

export interface AssignmentsMapProps {
  readonly territories: Territory[]
  /** Fired when the admin clicks a territory's outline or its label. */
  readonly onTerritoryTap?: (territory: Territory) => void
  /** Where to centre the map when there are no territories yet -- see {@link initialCenter}. */
  readonly fallbackCenter?: LatLngTuple
  /**
   * A previously-saved pan/zoom, taking priority over every other source of
   * the initial view (the territories' own average, `fallbackCenter`, and
   * the hardcoded Brasília fallback) when present. `MapContainer` only reads
   * `center`/`zoom` on mount, so this is the caller's way of restoring where
   * the admin left the map after this component remounts.
   */
  readonly initialView?: { center: LatLngTuple; zoom: number }
  /** Reports every pan/zoom so the caller can remember it (e.g. across a remount). */
  readonly onViewChange?: (view: { center: LatLngTuple; zoom: number }) => void
}

/**
 * Reports every pan/zoom to the caller. Must be rendered as a child of
 * `MapContainer` -- `useMapEvents` only works inside one -- which is why this
 * is its own component instead of a hook call inline in `AssignmentsMap`.
 */
function ViewTracker({
  onViewChange
}: {
  onViewChange?: (view: { center: LatLngTuple; zoom: number }) => void
}): null {
  useMapEvents({
    moveend: (event) => {
      const map = event.target
      onViewChange?.({ center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() })
    },
    zoomend: (event) => {
      const map = event.target
      onViewChange?.({ center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() })
    }
  })
  return null
}

function toLatLngTuples(ring: readonly LatLng[]): LatLngTuple[] {
  return ring.map((point) => [point.lat, point.lng])
}

/**
 * The average of the vertices -- a cheap stand-in for a real geometric
 * centroid, close enough to place a label. Same helper as `TerritoryMap`.
 */
function averageCentroid(ring: readonly LatLng[]): LatLngTuple {
  const lat = ring.reduce((sum, point) => sum + point.lat, 0) / ring.length
  const lng = ring.reduce((sum, point) => sum + point.lng, 0) / ring.length
  return [lat, lng]
}

/**
 * Average of every territory boundary point, or -- when there are no
 * territories to centre on yet -- the caller's own `fallbackCenter` (the
 * congregation's city, geocoded once by `AuthenticatedApp`), and only the
 * hardcoded Brasília point as the last resort when even that is unavailable.
 */
function initialCenter(
  territories: readonly Territory[],
  fallbackCenter?: LatLngTuple
): LatLngTuple {
  const points = territories.flatMap((territory) => territory.boundary)
  if (points.length === 0) return fallbackCenter ?? FALLBACK_CENTER
  const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length
  const lng = points.reduce((sum, point) => sum + point.lng, 0) / points.length
  return [lat, lng]
}

/** Names go into the DivIcon's raw html string, so escape them first. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A two-line label over the territory's centroid: its name, then the
 * assigned publisher's name (or "Sem dirigente"). Inline styles in the html,
 * the same way `numberIcon` does it in `TerritoryMap`.
 */
function assignmentIcon(territory: Territory): DivIcon {
  const leaderLine =
    territory.assignedUser !== undefined
      ? `<div style="font-size:12px;color:#263238;">${escapeHtml(territory.assignedUser.name)}</div>`
      : `<div style="font-size:12px;color:#78909c;font-style:italic;">Sem dirigente</div>`
  return new DivIcon({
    className: 'assignments-map-label',
    html:
      `<div style="display:inline-block;transform:translate(-50%,-50%);` +
      `background:rgba(255,255,255,0.88);border-radius:6px;` +
      `box-shadow:0 1px 4px rgba(0,0,0,0.25);padding:4px 8px;` +
      `font-family:sans-serif;text-align:center;white-space:nowrap;cursor:pointer;">` +
      `<div style="font-size:11px;font-weight:600;color:#37474f;">${escapeHtml(territory.name)}</div>` +
      leaderLine +
      `</div>`,
    // Leaflet centres the icon box on the point; the html centres itself via
    // the translate above, so the box can stay zero-sized.
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  })
}

/**
 * The Designations map: each territory's outline (solid blue when assigned,
 * dashed grey when not) and a label with the assigned publisher's name over
 * its centroid. Clicking either reports the territory to the caller.
 *
 * This component only draws what it is handed through props -- no
 * `window.api` call lives here, so the screen that uses it can be tested
 * with this component mocked out.
 */
export function AssignmentsMap({
  territories,
  onTerritoryTap,
  fallbackCenter,
  initialView,
  onViewChange
}: AssignmentsMapProps): React.JSX.Element {
  const center = useMemo(
    () => initialView?.center ?? initialCenter(territories, fallbackCenter),
    [initialView, territories, fallbackCenter]
  )
  const zoom = initialView?.zoom ?? (territories.length === 0 ? FALLBACK_ZOOM : TERRITORY_ZOOM)

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      {onViewChange !== undefined && <ViewTracker onViewChange={onViewChange} />}
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {territories.map((territory) => (
        <Polygon
          key={territory.id}
          positions={toLatLngTuples(territory.boundary)}
          pathOptions={
            territory.assignedUser !== undefined
              ? { color: ASSIGNED_COLOR, weight: 2, fill: true, fillOpacity: 0.08 }
              : {
                  color: UNASSIGNED_COLOR,
                  weight: 2,
                  fill: true,
                  fillOpacity: 0.05,
                  dashArray: '6 6'
                }
          }
          eventHandlers={{ click: () => onTerritoryTap?.(territory) }}
        />
      ))}
      {territories.map((territory) => (
        <Marker
          key={territory.id}
          position={averageCentroid(territory.boundary)}
          icon={assignmentIcon(territory)}
          eventHandlers={{ click: () => onTerritoryTap?.(territory) }}
        />
      ))}
    </MapContainer>
  )
}

export default AssignmentsMap
