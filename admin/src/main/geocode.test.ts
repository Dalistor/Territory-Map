import { describe, expect, it, vi } from 'vitest'
import { createGeocoder } from './geocode'

function fakeFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): typeof fetch {
  return vi.fn(impl) as unknown as typeof fetch
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body)
  } as Response
}

describe('createGeocoder', () => {
  it("resolves the lat/lng of the first result, parsed from Nominatim's string coordinates", async () => {
    const fetchImpl = fakeFetch(() =>
      Promise.resolve(jsonResponse([{ lat: '-23.2963', lon: '-51.2801' }]))
    )
    const geocoder = createGeocoder({ fetchImpl })

    await expect(geocoder.geocodeCity('Cambé')).resolves.toEqual({ lat: -23.2963, lng: -51.2801 })
  })

  it('sends the city as `q`, asks for one JSON result, and identifies the app via User-Agent', async () => {
    let capturedUrl = ''
    let capturedHeaders: HeadersInit | undefined
    const fetchImpl = fakeFetch((url, init) => {
      capturedUrl = url
      capturedHeaders = init?.headers
      return Promise.resolve(jsonResponse([{ lat: '1', lon: '2' }]))
    })
    const geocoder = createGeocoder({ fetchImpl })

    await geocoder.geocodeCity('Cambé')

    const parsed = new URL(capturedUrl)
    expect(parsed.origin + parsed.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(parsed.searchParams.get('q')).toBe('Cambé')
    expect(parsed.searchParams.get('format')).toBe('json')
    expect(parsed.searchParams.get('limit')).toBe('1')
    expect((capturedHeaders as Record<string, string>)['User-Agent']).toContain(
      'territory-map-admin'
    )
  })

  it('trims the city before sending it, and never calls fetch for a blank city', async () => {
    const fetchImpl = fakeFetch(() => Promise.resolve(jsonResponse([{ lat: '1', lon: '2' }])))
    const geocoder = createGeocoder({ fetchImpl })

    await geocoder.geocodeCity('  Cambé  ')
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    await expect(geocoder.geocodeCity('   ')).resolves.toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('resolves null when Nominatim finds nothing', async () => {
    const fetchImpl = fakeFetch(() => Promise.resolve(jsonResponse([])))
    const geocoder = createGeocoder({ fetchImpl })

    await expect(geocoder.geocodeCity('Uma Cidade Que Não Existe')).resolves.toBeNull()
  })

  it('resolves null on a non-ok HTTP response instead of throwing', async () => {
    const fetchImpl = fakeFetch(() => Promise.resolve(jsonResponse({ error: 'boom' }, false, 503)))
    const geocoder = createGeocoder({ fetchImpl })

    await expect(geocoder.geocodeCity('Cambé')).resolves.toBeNull()
  })

  it('resolves null when fetch itself rejects (network down)', async () => {
    const fetchImpl = fakeFetch(() => Promise.reject(new Error('sem conexão')))
    const geocoder = createGeocoder({ fetchImpl })

    await expect(geocoder.geocodeCity('Cambé')).resolves.toBeNull()
  })

  it('resolves null when the response body is not valid JSON', async () => {
    const fetchImpl = fakeFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('not json'))
      } as Response)
    )
    const geocoder = createGeocoder({ fetchImpl })

    await expect(geocoder.geocodeCity('Cambé')).resolves.toBeNull()
  })

  it('resolves null when the body is not an array', async () => {
    const fetchImpl = fakeFetch(() => Promise.resolve(jsonResponse({ not: 'an array' })))
    const geocoder = createGeocoder({ fetchImpl })

    await expect(geocoder.geocodeCity('Cambé')).resolves.toBeNull()
  })

  it('resolves null when the first result is not an object', async () => {
    const fetchImpl = fakeFetch(() => Promise.resolve(jsonResponse(['not an object'])))
    const geocoder = createGeocoder({ fetchImpl })

    await expect(geocoder.geocodeCity('Cambé')).resolves.toBeNull()
  })

  it('resolves null when lat/lon are not numeric strings', async () => {
    const fetchImpl = fakeFetch(() => Promise.resolve(jsonResponse([{ lat: 'abc', lon: '2' }])))
    const geocoder = createGeocoder({ fetchImpl })

    await expect(geocoder.geocodeCity('Cambé')).resolves.toBeNull()
  })

  it('resolves null when lon is missing entirely', async () => {
    const fetchImpl = fakeFetch(() => Promise.resolve(jsonResponse([{ lat: '1' }])))
    const geocoder = createGeocoder({ fetchImpl })

    await expect(geocoder.geocodeCity('Cambé')).resolves.toBeNull()
  })

  it('falls back to the global fetch when no fetchImpl is injected', () => {
    expect(() => createGeocoder()).not.toThrow()
  })
})
