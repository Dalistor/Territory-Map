// Coordinates, and the only place in the client code that converts between
// the orders they are written in.
//
// The API speaks `{"lat": …, "lng": …}` -- named members, never a bare pair --
// so a client cannot silently swap them. GeoJSON and PostGIS, on the other
// hand, write `[lng, lat]`, and Leaflet takes `(lat, lng)`. That inversion is
// the classic bug of this project, so it is spelled out once, here, and
// tested. Ported from packages/core/lib/geo/lat_lng.dart -- keep the two in
// sync if the rule ever changes.

/** A position on the globe. Immutable, compared by value, not a class. */
export interface LatLng {
  readonly lat: number
  readonly lng: number
}

/** WGS84 bounds. The poles and the antimeridian are real positions, so inclusive. */
export const MIN_LATITUDE = -90
export const MAX_LATITUDE = 90
export const MIN_LONGITUDE = -180
export const MAX_LONGITUDE = 180

/** Three corners is the least that encloses an area, and they must be distinct. */
export const MIN_RING_POINTS = 3

export function isOnGlobe(point: LatLng): boolean {
  return (
    point.lat >= MIN_LATITUDE &&
    point.lat <= MAX_LATITUDE &&
    point.lng >= MIN_LONGITUDE &&
    point.lng <= MAX_LONGITUDE
  )
}

export function pointsEqual(a: LatLng, b: LatLng): boolean {
  return a.lat === b.lat && a.lng === b.lng
}

/** GeoJSON order: longitude first. */
export function toGeoJson(point: LatLng): [number, number] {
  return [point.lng, point.lat]
}

/** Reads a GeoJSON position, which is `[lng, lat]` -- the reverse order. */
export function fromGeoJson(position: readonly number[]): LatLng {
  return { lat: position[1], lng: position[0] }
}

/** Parses the API's ring: a list of `{"lat": …, "lng": …}` objects. */
export function ringFromJson(json: ReadonlyArray<{ lat: number; lng: number }>): LatLng[] {
  return json.map((point) => ({ lat: point.lat, lng: point.lng }))
}

/** Drops the closing point if the ring repeats its first vertex at the end. */
function openRing(ring: readonly LatLng[]): LatLng[] {
  return ring.length > 1 && pointsEqual(ring[0], ring[ring.length - 1])
    ? ring.slice(0, -1)
    : [...ring]
}

/** Serialises a ring for the API, open (the server closes it itself). */
export function ringToJson(ring: readonly LatLng[]): LatLng[] {
  return openRing(ring).map((point) => ({ lat: point.lat, lng: point.lng }))
}

/** Why a ring of points is not a usable polygon. */
export type PolygonProblem = 'offGlobe' | 'tooFewPoints' | 'selfIntersecting'

/**
 * Raised by {@link validateRing} when a drawing cannot become a polygon.
 *
 * This mirrors the server's `InvalidPolygonError`, and exists so the admin
 * can refuse an impossible shape while the user is still drawing it. The
 * server re-checks everything with PostGIS regardless: this is feedback, not
 * authority.
 */
export class InvalidPolygonError extends Error {
  readonly problem: PolygonProblem

  constructor(problem: PolygonProblem, message: string) {
    super(message)
    this.name = 'InvalidPolygonError'
    this.problem = problem
  }
}

/**
 * The open ring with consecutive duplicates collapsed.
 *
 * A repeated point is a zero-length edge, which is a point and cannot cross
 * anything -- but it *is* collinear with everything through it, so leaving it
 * in would report a self-intersection that is really a duplicated vertex.
 * Dropping the edge alone is not enough either: its neighbours then become
 * adjacent in fact while the indices still say otherwise. Collapsing first
 * makes both problems disappear, and matches what the server sees through
 * Shapely.
 */
function cleanRing(ring: readonly LatLng[]): LatLng[] {
  const open = openRing(ring)
  const cleaned: LatLng[] = []
  for (const point of open) {
    if (cleaned.length === 0 || !pointsEqual(cleaned[cleaned.length - 1], point)) {
      cleaned.push(point)
    }
  }
  // The collapse can expose a new duplicate across the seam: (a, b, a, a)
  // opens to (a, b, a), whose last point repeats the first once the ring
  // closes.
  if (cleaned.length > 1 && pointsEqual(cleaned[0], cleaned[cleaned.length - 1])) {
    cleaned.pop()
  }
  return cleaned
}

/** The count of distinct positions, by value -- not by array length. */
function distinctPointCount(points: readonly LatLng[]): number {
  const seen = new Set(points.map((point) => `${point.lat},${point.lng}`))
  return seen.size
}

function cross(o: LatLng, a: LatLng, b: LatLng): number {
  return (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng)
}

function isBetween(o: LatLng, a: LatLng, b: LatLng): boolean {
  return (
    Math.min(a.lng, b.lng) <= o.lng &&
    o.lng <= Math.max(a.lng, b.lng) &&
    Math.min(a.lat, b.lat) <= o.lat &&
    o.lat <= Math.max(a.lat, b.lat)
  )
}

/** Standard orientation test, with the collinear-overlap case handled explicitly. */
function segmentsCross(p1: LatLng, p2: LatLng, q1: LatLng, q2: LatLng): boolean {
  const d1 = cross(q1, q2, p1)
  const d2 = cross(q1, q2, p2)
  const d3 = cross(p1, p2, q1)
  const d4 = cross(p1, p2, q2)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }

  // Collinear and overlapping counts as crossing: the outline doubles back
  // on itself, which PostGIS rejects as not simple just the same.
  if (d1 === 0 && isBetween(p1, q1, q2)) return true
  if (d2 === 0 && isBetween(p2, q1, q2)) return true
  if (d3 === 0 && isBetween(q1, p1, p2)) return true
  if (d4 === 0 && isBetween(q2, p1, p2)) return true

  return false
}

/**
 * True when any two non-adjacent edges of the closed ring cross.
 *
 * Adjacent edges are skipped because they legitimately share a vertex, and
 * the first and last edges are adjacent too once the ring closes.
 */
function hasSelfIntersection(open: readonly LatLng[]): boolean {
  const count = open.length
  for (let i = 0; i < count; i++) {
    const a1 = open[i]
    const a2 = open[(i + 1) % count]
    for (let j = i + 1; j < count; j++) {
      const adjacent = (j + 1) % count === i || j === (i + 1) % count
      if (adjacent) continue
      if (segmentsCross(a1, a2, open[j], open[(j + 1) % count])) return true
    }
  }
  return false
}

/**
 * Throws {@link InvalidPolygonError} unless `ring` can be a simple polygon.
 *
 * Accepts the ring either open or closed. The order of the checks matters:
 * an off-globe coordinate is reported as such rather than as a shape
 * problem, because it usually means a unit or a parsing mistake, not a bad
 * drawing.
 */
export function validateRing(ring: readonly LatLng[]): void {
  for (const point of ring) {
    if (!isOnGlobe(point)) {
      throw new InvalidPolygonError(
        'offGlobe',
        `A coordenada ${point.lat}, ${point.lng} está fora do globo. ` +
          'A latitude vai de -90 a 90 e a longitude de -180 a 180.'
      )
    }
  }

  const cleaned = cleanRing(ring)
  if (distinctPointCount(cleaned) < MIN_RING_POINTS) {
    throw new InvalidPolygonError(
      'tooFewPoints',
      'A demarcação precisa de pelo menos 3 pontos diferentes.'
    )
  }

  if (hasSelfIntersection(cleaned)) {
    throw new InvalidPolygonError(
      'selfIntersecting',
      'As linhas da demarcação se cruzam. Ajuste os pontos para que o contorno ' +
        'não passe por cima de si mesmo.'
    )
  }
}

/**
 * Whether `ring` is a valid simple polygon, without throwing.
 *
 * For the drawing loop, where the shape is invalid most of the time and an
 * exception per pointer move would be noise.
 */
export function isValidRing(ring: readonly LatLng[]): boolean {
  try {
    validateRing(ring)
    return true
  } catch (error) {
    if (error instanceof InvalidPolygonError) return false
    throw error
  }
}
