// Ports `admin/lib/presentation/map/territory_map.dart` (removed Flutter
// admin) to react-leaflet: a read-only view of every territory and its
// blocks. Editing lives in a separate component (`PolygonEditorLayers.tsx`,
// Task 11), so swapping the map library later stays confined to a couple of
// files instead of spreading through every screen.
//
// OpenStreetMap tile usage policy
// (https://operations.osmfoundation.org/policies/tiles/): identify the app
// with a User-Agent and never bulk-download tiles. This component never
// fetches more than the visible viewport needs -- no pre-fetching, no
// offline mirroring -- and Leaflet already tags every tile request with the
// browser's own User-Agent; the on-screen attribution below is the other
// half the policy asks for.
import { useMemo } from 'react'
import { MapContainer, TileLayer, Polygon, Marker, useMapEvents } from 'react-leaflet'
import { DivIcon, type LatLngTuple } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Block, Territory } from '../../shared/models'
import type { LatLng } from '../../shared/geo'
import { CATEGORY_COLOR, blockColorCategory } from './blockColor'
import { MapStatusLegend } from './MapStatusLegend'

/** Brasília -- the fallback centre when there is nothing to draw yet. */
const FALLBACK_CENTER: LatLngTuple = [-15.78, -47.93]
const FALLBACK_ZOOM = 4
const TERRITORY_ZOOM = 15

const TERRITORY_OUTLINE_COLOR = '#1565c0'

export interface TerritoryMapProps {
  readonly territories: Territory[]
  /** Injected rather than read here, so a test can pin "today" wherever it needs the colours to land. */
  readonly now: Date
  readonly onBlockTap?: (territory: Territory, block: Block) => void
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
 * is its own component instead of a hook call inline in `TerritoryMap`.
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

function toLatLngTuple(point: LatLng): LatLngTuple {
  return [point.lat, point.lng]
}

function toLatLngTuples(ring: readonly LatLng[]): LatLngTuple[] {
  return ring.map(toLatLngTuple)
}

/**
 * The average of the vertices -- a cheap stand-in for a real geometric
 * centroid, close enough to place a number label. Mirrors `_centroid` in the
 * removed Dart map widget.
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
 * hardcoded Brasília point as the last resort when even that is unavailable
 * (offline, or the lookup found nothing).
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

/** A small circular badge with the block's number, coloured by its work status. */
function numberIcon(number: number, color: string): DivIcon {
  return new DivIcon({
    className: 'territory-map-block-number',
    html:
      `<div style="width:28px;height:28px;border-radius:50%;` +
      `background:${color};color:#fff;border:2px solid #fff;` +
      `display:flex;align-items:center;justify-content:center;` +
      `font-weight:bold;font-size:12px;font-family:sans-serif;` +
      `box-shadow:0 1px 3px rgba(0,0,0,0.4);">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  })
}

/**
 * The map itself: territories drawn as thin, unfilled outlines; blocks drawn
 * as filled polygons coloured by how overdue their work is against their own
 * territory's rotation; a numbered
 * marker on each block's centroid that reports taps to the caller.
 *
 * This component only draws what it is handed through props -- no
 * `window.api` call lives here, so it can be exercised with plain in-memory
 * fixtures wherever it is used.
 */
export function TerritoryMap({
  territories,
  now,
  onBlockTap,
  fallbackCenter,
  initialView,
  onViewChange
}: TerritoryMapProps): React.JSX.Element {
  const center = useMemo(
    () => initialView?.center ?? initialCenter(territories, fallbackCenter),
    [initialView, territories, fallbackCenter]
  )
  const zoom = initialView?.zoom ?? (territories.length === 0 ? FALLBACK_ZOOM : TERRITORY_ZOOM)

  return (
    <div className="map-with-status-legend">
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
            pathOptions={{ color: TERRITORY_OUTLINE_COLOR, weight: 2, fill: false }}
          />
        ))}
        {territories.map((territory) =>
          territory.blocks.map((block) => {
            const color = CATEGORY_COLOR[blockColorCategory(block, now, territory.rotationDays)]
            return (
              <Polygon
                key={block.id}
                positions={toLatLngTuples(block.polygon)}
                pathOptions={{ color, weight: 1.5, fillColor: color, fillOpacity: 0.35 }}
              />
            )
          })
        )}
        {territories.map((territory) =>
          territory.blocks.map((block) => {
            const color = CATEGORY_COLOR[blockColorCategory(block, now, territory.rotationDays)]
            return (
              <Marker
                key={block.id}
                position={averageCentroid(block.polygon)}
                icon={numberIcon(block.number, color)}
                eventHandlers={{ click: () => onBlockTap?.(territory, block) }}
              />
            )
          })
        )}
      </MapContainer>
      <MapStatusLegend />
    </div>
  )
}

export default TerritoryMap
