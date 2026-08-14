// Mirrors packages/core/test/geo/lat_lng_test.dart — this module is the
// TypeScript port of packages/core/lib/geo/lat_lng.dart for the Electron
// admin. Coordinates arrive as { lat, lng } named members (never a bare
// pair) so a client cannot silently swap them; GeoJSON/PostGIS write
// [lng, lat], the reverse order — that inversion is tested explicitly below.
import { describe, expect, it } from 'vitest'
import {
  fromGeoJson,
  InvalidPolygonError,
  isOnGlobe,
  isValidRing,
  pointsEqual,
  ringFromJson,
  ringToJson,
  toGeoJson,
  validateRing,
  type LatLng
} from './geo'

/** A counter-clockwise unit square around (0, 0), open. */
const square: LatLng[] = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 1 },
  { lat: 1, lng: 1 },
  { lat: 1, lng: 0 }
]

describe('isOnGlobe', () => {
  it('accepts the poles and the antimeridian as real positions', () => {
    expect(isOnGlobe({ lat: 90, lng: 180 })).toBe(true)
    expect(isOnGlobe({ lat: -90, lng: -180 })).toBe(true)
  })

  it('rejects a coordinate just past the bounds', () => {
    expect(isOnGlobe({ lat: 90.0001, lng: 0 })).toBe(false)
    expect(isOnGlobe({ lat: 0, lng: -180.0001 })).toBe(false)
  })
})

describe('pointsEqual', () => {
  it('compares by value', () => {
    const a: LatLng = { lat: 1, lng: 2 }
    const b: LatLng = { lat: 1, lng: 2 }

    expect(pointsEqual(a, b)).toBe(true)
  })

  it('is false when either member differs', () => {
    expect(pointsEqual({ lat: 1, lng: 2 }, { lat: 2, lng: 1 })).toBe(false)
  })
})

describe('GeoJSON conversion', () => {
  it('writes GeoJSON with longitude first', () => {
    expect(toGeoJson({ lat: -23.55, lng: -46.63 })).toEqual([-46.63, -23.55])
  })

  it('reads GeoJSON, which is the reverse order', () => {
    expect(fromGeoJson([-46.63, -23.55])).toEqual({ lat: -23.55, lng: -46.63 })
  })

  it('survives a GeoJSON round trip', () => {
    const original: LatLng = { lat: -23.55, lng: -46.63 }

    expect(fromGeoJson(toGeoJson(original))).toEqual(original)
  })
})

describe('ring serialisation', () => {
  it('reads the API ring', () => {
    const ring = ringFromJson([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 }
    ])

    expect(ring).toEqual([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 }
    ])
  })

  it('leaves an already open ring alone', () => {
    expect(ringToJson(square)).toHaveLength(square.length)
  })

  it('writes the API ring open, because the server closes it -- a ring whose first point repeats at the end is opened first', () => {
    expect(ringToJson([...square, square[0]])).toHaveLength(square.length)
    expect(ringToJson([...square, square[0]])).toEqual(square)
  })

  it('survives a round trip through the wire format', () => {
    expect(ringFromJson(ringToJson(square))).toEqual(square)
  })
})

describe('validateRing — accepts valid shapes', () => {
  it('accepts a simple square', () => {
    expect(() => validateRing(square)).not.toThrow()
  })

  it('accepts a ring that already repeats its first point at the end', () => {
    expect(() => validateRing([...square, square[0]])).not.toThrow()
  })

  it('accepts a concave outline of 5+ points, which a real block often is', () => {
    const lShape: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 1, lng: 2 },
      { lat: 1, lng: 1 },
      { lat: 2, lng: 1 },
      { lat: 2, lng: 0 }
    ]

    expect(() => validateRing(lShape)).not.toThrow()
  })
})

describe('validateRing — too few points', () => {
  it('refuses fewer than three points', () => {
    expect(() =>
      validateRing([
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 }
      ])
    ).toThrow(expect.objectContaining({ problem: 'tooFewPoints' }))
  })

  it('counts distinct points, so a repeated corner does not make three, even after opening/collapsing', () => {
    expect(() =>
      validateRing([
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 }
      ])
    ).toThrow(expect.objectContaining({ problem: 'tooFewPoints' }))
  })

  it('tolerates a duplicated point when three distinct ones remain', () => {
    expect(() =>
      validateRing([
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
        { lat: 1, lng: 1 }
      ])
    ).not.toThrow()
  })

  it('drops the duplicate the collapse exposes at the closing seam: (a, b, a, a) opens to (a, b, a), whose ends then repeat too', () => {
    // Opening [a, b, a, a] drops the trailing "a" (it repeats the first
    // point), leaving [a, b, a] -- collapsing consecutive duplicates does
    // nothing there since a and a are not neighbours, but the ring's own
    // first and last point now coincide, exposing a duplicate the earlier
    // pass could not see. Left uncaught, this would count "a" and "b" as
    // three points instead of two.
    expect(() =>
      validateRing([
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0 }
      ])
    ).toThrow(expect.objectContaining({ problem: 'tooFewPoints' }))
  })
})

describe('validateRing — self-intersection', () => {
  it('refuses a figure eight (edge crossing another edge)', () => {
    const bowtie: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
      { lat: 0, lng: 1 }
    ]

    expect(() => validateRing(bowtie)).toThrow(
      expect.objectContaining({ problem: 'selfIntersecting' })
    )
  })

  it('refuses an outline whose non-adjacent edges overlap collinearly', () => {
    const spike: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 }
    ]

    expect(() => validateRing(spike)).toThrow(
      expect.objectContaining({ problem: 'selfIntersecting' })
    )
  })

  it('refuses the same crossing shape with the two edges relabelled the other way round', () => {
    // Same four points as the figure eight above, walked in a different
    // order. The crossing test compares one edge's endpoints against the
    // other edge's line (twice, in each direction), and a proper crossing
    // can present with either sign pattern depending on which side each
    // point falls on -- this ring exercises the pattern the bowtie above
    // does not.
    const mirroredBowtie: LatLng[] = [
      { lat: 0, lng: 1 },
      { lat: 1, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 0, lng: 0 }
    ]

    expect(() => validateRing(mirroredBowtie)).toThrow(
      expect.objectContaining({ problem: 'selfIntersecting' })
    )
  })

  it('refuses a corner that lands exactly on another edge, touching it from either end', () => {
    // Three quads, each with one vertex of edge0 sitting exactly on edge2 --
    // once as edge0's start, once as its end, once as edge2's end -- the
    // three ways a T-junction can present itself.
    const touchesAsEdgeStart: LatLng[] = [
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 }
    ]
    const touchesAsEdgeEnd: LatLng[] = [
      { lat: 1, lng: 1 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 }
    ]
    const touchesTheOtherEdgesEnd: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 1, lng: 1 },
      { lat: 0, lng: 1 }
    ]

    for (const ring of [touchesAsEdgeStart, touchesAsEdgeEnd, touchesTheOtherEdgesEnd]) {
      expect(() => validateRing(ring)).toThrow(
        expect.objectContaining({ problem: 'selfIntersecting' })
      )
    }
  })
})

describe('validateRing — off-globe', () => {
  it('refuses a coordinate off the globe, and says which one', () => {
    expect(() =>
      validateRing([
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
        { lat: 91, lng: 1 }
      ])
    ).toThrow(
      expect.objectContaining({ problem: 'offGlobe', message: expect.stringContaining('91') })
    )
  })

  it('reports an off-globe point before complaining about the shape', () => {
    expect(() =>
      validateRing([
        { lat: 999, lng: 0 },
        { lat: 0, lng: 1 }
      ])
    ).toThrow(expect.objectContaining({ problem: 'offGlobe' }))
  })
})

describe('validateRing — messages', () => {
  it('writes every problem message in Portuguese, for the admin', () => {
    const rings: LatLng[][] = [
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 }
      ],
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
        { lat: 1, lng: 0 },
        { lat: 0, lng: 1 }
      ],
      [
        { lat: 999, lng: 0 },
        { lat: 0, lng: 1 },
        { lat: 1, lng: 1 }
      ]
    ]

    for (const ring of rings) {
      expect(() => validateRing(ring)).toThrow(/[çãéêáíú]|precisa|cruzam|fora/)
    }
  })

  it('rejects with an InvalidPolygonError instance carrying the typed problem', () => {
    try {
      validateRing([
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 }
      ])
      expect.unreachable('validateRing should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPolygonError)
      expect((error as InvalidPolygonError).problem).toBe('tooFewPoints')
    }
  })
})

describe('isValidRing', () => {
  it('answers true instead of throwing, for the drawing loop', () => {
    expect(isValidRing(square)).toBe(true)
  })

  it('answers false for a shape still being drawn', () => {
    expect(
      isValidRing([
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 }
      ])
    ).toBe(false)
  })

  it('only swallows InvalidPolygonError -- any other failure still propagates', () => {
    // Not a realistic input under the TypeScript types, but validateRing
    // does no runtime guarding of ring elements, so a malformed point (e.g.
    // arriving from an untyped IPC boundary) throws a plain TypeError.
    // isValidRing must not report that as "just an invalid shape".
    const malformed = [null, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }] as unknown as LatLng[]

    expect(() => isValidRing(malformed)).toThrow(TypeError)
  })
})
