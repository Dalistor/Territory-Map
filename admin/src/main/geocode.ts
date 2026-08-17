// Looks up a rough centre point for a city name, via OSM's Nominatim search
// API -- the same map data source the app already uses for tiles (Task 09,
// spec 0003). Used only to give the map a sensible starting point when there
// is nothing else to anchor on yet: a brand-new congregation with no
// territories drawn otherwise falls back to the middle of Brazil, which is
// not useful for drawing the first one.
//
// Runs from the main process, not the renderer, for the same reason
// `api-client.ts` does: Nominatim's usage policy
// (https://operations.osmfoundation.org/policies/nominatim/) asks for a
// valid User-Agent identifying the application, and a browser/renderer
// `fetch` cannot set that header at all (the Fetch spec forbids it) -- only
// Node's `fetch`, which the main process runs, can.
//
// A failed lookup (no match, network down, malformed response) resolves to
// `null` rather than throwing: this is a nicety for where the map opens, not
// something worth blocking the app on.

import type { LatLng } from '../shared/geo'

export interface Geocoder {
  geocodeCity(city: string): Promise<LatLng | null>
}

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'territory-map-admin (https://github.com/dalistor/territory-map)'

export function createGeocoder({ fetchImpl }: { fetchImpl?: typeof fetch } = {}): Geocoder {
  const doFetch = fetchImpl ?? globalThis.fetch

  return {
    async geocodeCity(city: string): Promise<LatLng | null> {
      const trimmed = city.trim()
      if (trimmed.length === 0) return null

      const url = new URL(NOMINATIM_SEARCH_URL)
      url.searchParams.set('q', trimmed)
      url.searchParams.set('format', 'json')
      url.searchParams.set('limit', '1')

      let response: Response
      try {
        response = await doFetch(url.toString(), {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
        })
      } catch {
        return null
      }

      if (!response.ok) return null

      let body: unknown
      try {
        body = await response.json()
      } catch {
        return null
      }

      if (!Array.isArray(body) || body.length === 0) return null
      const [first] = body
      if (typeof first !== 'object' || first === null) return null

      const lat = parseCoordinate((first as Record<string, unknown>).lat)
      const lng = parseCoordinate((first as Record<string, unknown>).lon)
      if (lat === null || lng === null) return null

      return { lat, lng }
    }
  }
}

function parseCoordinate(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
