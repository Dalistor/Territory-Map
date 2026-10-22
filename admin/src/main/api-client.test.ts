import { describe, expect, it, vi } from 'vitest'
import { InvalidPolygonError, type LatLng } from '../shared/geo'
import { ApiErrorException, NetworkException } from '../shared/api-errors'
import { createApiClient, type FetchImpl, type FetchResponseLike } from './api-client'

/** A `FetchResponseLike` whose body is the given raw text. */
function textResponse(status: number, text: string): FetchResponseLike {
  return { status, text: async () => text }
}

/** A `FetchResponseLike` whose body is `body`, JSON-encoded. */
function jsonResponse(status: number, body: unknown): FetchResponseLike {
  return textResponse(status, JSON.stringify(body))
}

/** A `FetchResponseLike` with no body at all -- the shape a `DELETE` answers with. */
function emptyResponse(status = 204): FetchResponseLike {
  return textResponse(status, '')
}

/** A `FetchImpl` fake that always answers the same response, capturing every call. */
function fakeFetch(response: FetchResponseLike): FetchImpl & ReturnType<typeof vi.fn> {
  return vi.fn(async () => response)
}

const BASE_URL = 'https://territory.example.test'
const APP_KEY = 'the-app-key'

const CONGREGATION_JSON = { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' }

const VALID_RING: LatLng[] = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 1 },
  { lat: 1, lng: 1 }
]

const SELF_INTERSECTING_RING: LatLng[] = [
  { lat: 0, lng: 0 },
  { lat: 1, lng: 1 },
  { lat: 1, lng: 0 },
  { lat: 0, lng: 1 }
]

function makeClient(response: FetchResponseLike): {
  client: ReturnType<typeof createApiClient>
  fetchImpl: FetchImpl & ReturnType<typeof vi.fn>
} {
  const fetchImpl = fakeFetch(response)
  const client = createApiClient({ baseUrl: BASE_URL, appKey: APP_KEY, fetchImpl })
  return { client, fetchImpl }
}

describe('createApiClient', () => {
  describe('every request', () => {
    it('sends the X-App-Key header with the configured value', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, { access_token: 't', congregation: CONGREGATION_JSON })
      )

      await client.login({ name: 'N', city: 'C', password: 'pw' })

      const [, init] = fetchImpl.mock.calls[0]
      expect(init.headers['X-App-Key']).toBe(APP_KEY)
    })

    it('sends no Authorization header before setToken is ever called', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, []))

      await client.listTerritories()

      const [, init] = fetchImpl.mock.calls[0]
      expect(init.headers['Authorization']).toBeUndefined()
    })

    it('sends Authorization: Bearer <token> on every request after setToken', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, []))

      client.setToken('abc')
      await client.listTerritories()

      const [, init] = fetchImpl.mock.calls[0]
      expect(init.headers['Authorization']).toBe('Bearer abc')
    })

    it('stops sending Authorization once setToken(null) is called', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, []))

      client.setToken('abc')
      client.setToken(null)
      await client.listTerritories()

      const [, init] = fetchImpl.mock.calls[0]
      expect(init.headers['Authorization']).toBeUndefined()
    })
  })

  describe('login', () => {
    it('POSTs /auth/login with name, city and password and returns the parsed AdminSession', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, { access_token: 'jwt-token', congregation: CONGREGATION_JSON })
      )

      const session = await client.login({
        name: 'Congregação Central',
        city: 'São Paulo',
        password: 'secret'
      })

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/auth/login`)
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({
        name: 'Congregação Central',
        city: 'São Paulo',
        password: 'secret'
      })
      expect(session).toEqual({
        accessToken: 'jwt-token',
        congregation: { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' }
      })
    })
  })

  describe('publishers', () => {
    const PUBLISHER_JSON = {
      id: 'pub-1',
      name: 'Ana',
      is_active: true,
      access_code: 'ABCD2345',
      access_code_expires_at: '2026-08-09T12:00:00Z',
      activated_at: null
    }
    const PARSED_PUBLISHER = {
      id: 'pub-1',
      name: 'Ana',
      isActive: true,
      accessCode: 'ABCD2345',
      accessCodeExpiresAt: new Date('2026-08-09T12:00:00Z'),
      activatedAt: undefined
    }

    it('listPublishers GETs /admin/users and returns the parsed list', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, [PUBLISHER_JSON]))

      const publishers = await client.listPublishers()

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/users`)
      expect(init.method).toBe('GET')
      expect(publishers).toEqual([PARSED_PUBLISHER])
    })

    it('createPublisher POSTs /admin/users with {name} and returns the parsed publisher', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, PUBLISHER_JSON))

      const publisher = await client.createPublisher('Ana')

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/users`)
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({ name: 'Ana' })
      expect(publisher).toEqual(PARSED_PUBLISHER)
    })

    it('regenerateAccessCode POSTs /admin/users/{id}/access-code', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, PUBLISHER_JSON))

      await client.regenerateAccessCode('pub-1')

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/users/pub-1/access-code`)
      expect(init.method).toBe('POST')
    })

    it('setPublisherActive PATCHes /admin/users/{id} with {is_active}', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, { ...PUBLISHER_JSON, is_active: false })
      )

      await client.setPublisherActive('pub-1', false)

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/users/pub-1`)
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(init.body as string)).toEqual({ is_active: false })
    })

    it('deletePublisher DELETEs /admin/users/{id} and resolves with no value', async () => {
      const { client, fetchImpl } = makeClient(emptyResponse())

      await expect(client.deletePublisher('pub-1')).resolves.toBeUndefined()

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/users/pub-1`)
      expect(init.method).toBe('DELETE')
    })

    // The screen has to tell "still has an open assignment" from any other
    // failure, and the code is the only thing that says which is which.
    it('deletePublisher surfaces a 409 with the code and the status preserved', async () => {
      const { client } = makeClient(
        jsonResponse(409, {
          code: 'publisher_has_open_assignment',
          detail: 'Conclua a designação em vigor antes de apagar o publicador.'
        })
      )

      const error = await client.deletePublisher('pub-1').catch((e) => e)

      expect(error).toBeInstanceOf(ApiErrorException)
      expect(error).toMatchObject({
        statusCode: 409,
        code: 'publisher_has_open_assignment',
        detail: 'Conclua a designação em vigor antes de apagar o publicador.'
      })
    })

    it('parses a publisher whose access code has already been redeemed (no live code, activated)', async () => {
      const { client } = makeClient(
        jsonResponse(200, {
          id: 'pub-2',
          name: 'Beto',
          is_active: true,
          access_code: null,
          access_code_expires_at: null,
          activated_at: '2026-08-01T10:00:00Z'
        })
      )

      const publisher = await client.createPublisher('Beto')

      expect(publisher.accessCode).toBeUndefined()
      expect(publisher.accessCodeExpiresAt).toBeUndefined()
      expect(publisher.activatedAt).toEqual(new Date('2026-08-01T10:00:00Z'))
    })
  })

  describe('territories', () => {
    const TERRITORY_JSON = {
      id: 'terr-1',
      name: 'Setor 1',
      boundary: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
        { lat: 1, lng: 1 }
      ],
      blocks: [
        {
          id: 'block-1',
          number: 1,
          polygon: [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 0.5 },
            { lat: 0.5, lng: 0.5 }
          ],
          last_worked_at: '2026-07-01T09:00:00Z'
        }
      ],
      assigned_user: { id: 'leader-1', name: 'Dirigente' },
      last_work: { user: { id: 'worker-1', name: 'Visitante' }, worked_at: '2026-08-15T10:30:00Z' }
    }
    const PARSED_TERRITORY = {
      id: 'terr-1',
      name: 'Setor 1',
      boundary: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
        { lat: 1, lng: 1 }
      ],
      blocks: [
        {
          id: 'block-1',
          number: 1,
          polygon: [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 0.5 },
            { lat: 0.5, lng: 0.5 }
          ],
          lastWorkedAt: new Date('2026-07-01T09:00:00Z')
        }
      ],
      assignedUser: { id: 'leader-1', name: 'Dirigente' },
      lastWork: {
        publisher: { id: 'worker-1', name: 'Visitante' },
        workedAt: new Date('2026-08-15T10:30:00Z')
      }
    }

    it('listTerritories GETs /admin/territories and returns the parsed list', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, [TERRITORY_JSON]))

      const territories = await client.listTerritories()

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/territories`)
      expect(init.method).toBe('GET')
      expect(territories).toEqual([PARSED_TERRITORY])
    })

    it('listTerritories parses a territory whose blocks field is absent as an empty list', async () => {
      const { client } = makeClient(jsonResponse(200, [{ ...TERRITORY_JSON, blocks: undefined }]))

      const [territory] = await client.listTerritories()

      expect(territory.blocks).toEqual([])
    })

    it('parses last_work independently from the territory leader', async () => {
      const { client } = makeClient(jsonResponse(200, [TERRITORY_JSON]))

      const [territory] = await client.listTerritories()

      expect(territory.assignedUser).toEqual({ id: 'leader-1', name: 'Dirigente' })
      expect(territory.lastWork).toEqual({
        publisher: { id: 'worker-1', name: 'Visitante' },
        workedAt: new Date('2026-08-15T10:30:00Z')
      })
    })

    it('parses assigned_since as the date the open assignment started', async () => {
      const { client } = makeClient(
        jsonResponse(200, [
          { ...TERRITORY_JSON, assigned_since: '2026-10-12T12:00:00Z' },
          { ...TERRITORY_JSON, id: 'free', assigned_since: null }
        ])
      )

      const [assigned, free] = await client.listTerritories()

      expect(assigned.assignedSince).toEqual(new Date('2026-10-12T12:00:00Z'))
      expect(free.assignedSince).toBeUndefined()
    })

    it('keeps last_work absent as undefined', async () => {
      const { client } = makeClient(jsonResponse(200, [{ ...TERRITORY_JSON, last_work: null }]))

      const [territory] = await client.listTerritories()

      expect(territory.lastWork).toBeUndefined()
    })

    it('getTerritory GETs /admin/territories/{id} and returns the parsed territory, blocks included', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, TERRITORY_JSON))

      const territory = await client.getTerritory('terr-1')

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/territories/terr-1`)
      expect(init.method).toBe('GET')
      expect(territory).toEqual(PARSED_TERRITORY)
    })

    it('createTerritory POSTs /admin/territories with {name, boundary} (boundary opened for the wire)', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, TERRITORY_JSON))
      const closedRing = [...VALID_RING, VALID_RING[0]]

      await client.createTerritory({ name: 'Setor 1', boundary: closedRing })

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/territories`)
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({ name: 'Setor 1', boundary: VALID_RING })
    })

    it('createTerritory validates the boundary before sending any request, throwing InvalidPolygonError', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, TERRITORY_JSON))

      await expect(
        client.createTerritory({ name: 'Setor 1', boundary: SELF_INTERSECTING_RING })
      ).rejects.toBeInstanceOf(InvalidPolygonError)
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('updateTerritory PATCHes /admin/territories/{id} sending only the name when boundary is omitted', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, TERRITORY_JSON))

      await client.updateTerritory('terr-1', { name: 'Novo nome' })

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/territories/terr-1`)
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(init.body as string)).toEqual({ name: 'Novo nome' })
    })

    it('updateTerritory sends only the boundary when name is omitted', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, TERRITORY_JSON))

      await client.updateTerritory('terr-1', { boundary: VALID_RING })

      const [, init] = fetchImpl.mock.calls[0]
      expect(JSON.parse(init.body as string)).toEqual({ boundary: VALID_RING })
    })

    it('updateTerritory sends rotation_days when rotationDays is a number', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, TERRITORY_JSON))

      await client.updateTerritory('terr-1', { rotationDays: 60 })

      const [, init] = fetchImpl.mock.calls[0]
      expect(JSON.parse(init.body as string)).toEqual({ rotation_days: 60 })
    })

    it('updateTerritory sends rotation_days: null when rotationDays is explicitly null', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, TERRITORY_JSON))

      await client.updateTerritory('terr-1', { rotationDays: null })

      const [, init] = fetchImpl.mock.calls[0]
      expect(JSON.parse(init.body as string)).toEqual({ rotation_days: null })
    })

    it('updateTerritory omits rotation_days entirely when rotationDays is not in the input', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, TERRITORY_JSON))

      await client.updateTerritory('terr-1', { name: 'Novo nome' })

      const [, init] = fetchImpl.mock.calls[0]
      expect(JSON.parse(init.body as string)).not.toHaveProperty('rotation_days')
    })

    it('updateTerritory validates the boundary before sending any request when boundary is passed', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, TERRITORY_JSON))

      await expect(
        client.updateTerritory('terr-1', { boundary: SELF_INTERSECTING_RING })
      ).rejects.toBeInstanceOf(InvalidPolygonError)
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('deleteTerritory DELETEs /admin/territories/{id}', async () => {
      const { client, fetchImpl } = makeClient(emptyResponse())

      await client.deleteTerritory('terr-1')

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/territories/terr-1`)
      expect(init.method).toBe('DELETE')
    })

    it('listTerritories parses assigned_user into assignedUser when present', async () => {
      const { client } = makeClient(
        jsonResponse(200, [{ ...TERRITORY_JSON, assigned_user: { id: 'pub-1', name: 'Ana' } }])
      )

      const [territory] = await client.listTerritories()

      expect(territory.assignedUser).toEqual({ id: 'pub-1', name: 'Ana' })
    })

    it('listTerritories parses a territory whose assigned_user is absent as undefined', async () => {
      const { client } = makeClient(
        jsonResponse(200, [{ ...TERRITORY_JSON, assigned_user: undefined }])
      )

      const [territory] = await client.listTerritories()

      expect(territory.assignedUser).toBeUndefined()
    })

    it('listTerritories parses the active campaign of a territory, with no assigned user', async () => {
      const { client } = makeClient(
        jsonResponse(200, [
          {
            ...TERRITORY_JSON,
            assigned_user: null,
            campaign: { id: 'camp-1', name: 'Celebração' }
          }
        ])
      )

      const [territory] = await client.listTerritories()

      expect(territory.assignedUser).toBeUndefined()
      expect(territory.campaign).toEqual({ id: 'camp-1', name: 'Celebração' })
    })

    it('listTerritories parses rotation_days into rotationDays', async () => {
      const { client } = makeClient(jsonResponse(200, [{ ...TERRITORY_JSON, rotation_days: 60 }]))

      const [territory] = await client.listTerritories()

      expect(territory.rotationDays).toBe(60)
    })

    it('listTerritories parses a territory whose rotation_days is null as undefined', async () => {
      const { client } = makeClient(jsonResponse(200, [{ ...TERRITORY_JSON, rotation_days: null }]))

      const [territory] = await client.listTerritories()

      expect(territory.rotationDays).toBeUndefined()
    })
  })

  describe('assignments', () => {
    const ASSIGNMENT_JSON = {
      id: 'asg-1',
      user: { id: 'pub-1', name: 'Ana' },
      started_at: '2026-08-01T09:00:00Z',
      completed_at: '2026-08-10T09:00:00Z'
    }
    const PARSED_ASSIGNMENT = {
      id: 'asg-1',
      publisher: { id: 'pub-1', name: 'Ana' },
      startedAt: new Date('2026-08-01T09:00:00Z'),
      completedAt: new Date('2026-08-10T09:00:00Z')
    }

    it('listAssignments GETs /admin/territories/{id}/assignments and returns the parsed list', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, [ASSIGNMENT_JSON]))

      const assignments = await client.listAssignments('terr-1')

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/territories/terr-1/assignments`)
      expect(init.method).toBe('GET')
      expect(assignments).toEqual([PARSED_ASSIGNMENT])
    })

    it('parses a completed_at of null as an open assignment, with completedAt undefined', async () => {
      const { client } = makeClient(jsonResponse(200, [{ ...ASSIGNMENT_JSON, completed_at: null }]))

      const [assignment] = await client.listAssignments('terr-1')

      expect(assignment.completedAt).toBeUndefined()
      expect(assignment.startedAt).toEqual(new Date('2026-08-01T09:00:00Z'))
    })

    const ASSIGNMENT_HISTORY_PAGE_JSON = {
      items: [
        { ...ASSIGNMENT_JSON, territory: { id: 'terr-1', name: 'Centro - N6' } },
        {
          ...ASSIGNMENT_JSON,
          id: 'asg-2',
          completed_at: null,
          territory: { id: 'terr-2', name: 'Vila - N7' }
        }
      ],
      total: 12,
      page: 2,
      page_size: 10
    }

    it('parses a campaign line (user null) with the campaign and no publisher', async () => {
      const { client } = makeClient(
        jsonResponse(200, [
          {
            ...ASSIGNMENT_JSON,
            user: null,
            campaign: { id: 'camp-1', name: 'Celebração' },
            completed_at: null
          }
        ])
      )

      const [assignment] = await client.listAssignments('terr-1')

      expect(assignment.publisher).toBeUndefined()
      expect(assignment.campaign).toEqual({ id: 'camp-1', name: 'Celebração' })
    })

    it('listAllAssignments GETs the history endpoint and parses its page', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, ASSIGNMENT_HISTORY_PAGE_JSON))

      const assignmentPage = await client.listAllAssignments()

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/assignments`)
      expect(init.method).toBe('GET')
      expect(assignmentPage).toEqual({
        items: [
          { ...PARSED_ASSIGNMENT, territory: { id: 'terr-1', name: 'Centro - N6' } },
          {
            ...PARSED_ASSIGNMENT,
            id: 'asg-2',
            completedAt: undefined,
            territory: { id: 'terr-2', name: 'Vila - N7' }
          }
        ],
        total: 12,
        page: 2,
        pageSize: 10
      })
    })

    it('accepts the legacy array response while an Electron client awaits the paginated server deploy', async () => {
      const legacyEntries = ASSIGNMENT_HISTORY_PAGE_JSON.items
      const { client } = makeClient(jsonResponse(200, legacyEntries))

      await expect(client.listAllAssignments()).resolves.toEqual({
        items: [
          { ...PARSED_ASSIGNMENT, territory: { id: 'terr-1', name: 'Centro - N6' } },
          {
            ...PARSED_ASSIGNMENT,
            id: 'asg-2',
            completedAt: undefined,
            territory: { id: 'terr-2', name: 'Vila - N7' }
          }
        ],
        total: 2,
        page: 1,
        pageSize: 50
      })
    })

    it('filters and paginates a legacy array when the deployed server ignores query parameters', async () => {
      const legacyEntries = [
        ...ASSIGNMENT_HISTORY_PAGE_JSON.items,
        {
          ...ASSIGNMENT_JSON,
          id: 'asg-3',
          user: { id: 'pub-2', name: 'Outra pessoa' },
          territory: { id: 'terr-3', name: 'Jardim - N8' }
        }
      ]
      const { client } = makeClient(jsonResponse(200, legacyEntries))

      await expect(
        client.listAllAssignments({ publisherId: 'pub-1', page: 2, pageSize: 1 })
      ).resolves.toEqual({
        items: [
          {
            ...PARSED_ASSIGNMENT,
            id: 'asg-2',
            completedAt: undefined,
            territory: { id: 'terr-2', name: 'Vila - N7' }
          }
        ],
        total: 2,
        page: 2,
        pageSize: 1
      })
    })

    it('serializes defined history filters as ISO-8601 query parameters', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, ASSIGNMENT_HISTORY_PAGE_JSON))

      await client.listAllAssignments({
        fromInstant: new Date('2026-08-01T00:00:00.000Z'),
        toInstant: new Date('2026-08-31T00:00:00.000Z'),
        publisherId: 'publicador com espaço',
        territoryId: 'terr-1',
        page: 2,
        pageSize: 10
      })

      const [url] = fetchImpl.mock.calls[0]
      expect(url).toBe(
        `${BASE_URL}/admin/assignments?from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-31T00%3A00%3A00.000Z&publisher_id=publicador+com+espa%C3%A7o&territory_id=terr-1&page=2&page_size=10`
      )
    })

    it('omits absent history filters instead of serializing empty parameters', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, ASSIGNMENT_HISTORY_PAGE_JSON))

      await client.listAllAssignments({ publisherId: undefined, pageSize: undefined })

      const [url] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/assignments`)
    })

    it('designate POSTs /admin/territories/{id}/assignments with {user_id} and returns the parsed assignment', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(201, { ...ASSIGNMENT_JSON, completed_at: null })
      )

      const assignment = await client.designate('terr-1', 'pub-1')

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/territories/terr-1/assignments`)
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({ user_id: 'pub-1' })
      expect(assignment).toEqual({ ...PARSED_ASSIGNMENT, completedAt: undefined })
    })

    it('completeAssignment POSTs /admin/territories/{id}/assignments/complete with no body', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, ASSIGNMENT_JSON))

      const assignment = await client.completeAssignment('terr-1')

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/territories/terr-1/assignments/complete`)
      expect(init.method).toBe('POST')
      expect(init.body).toBeUndefined()
      expect(assignment).toEqual(PARSED_ASSIGNMENT)
    })

    it('deleteAssignment DELETEs /admin/territories/{id}/assignments/{assignmentId}', async () => {
      const { client, fetchImpl } = makeClient(emptyResponse())

      await client.deleteAssignment('terr-1', 'asg-1')

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/territories/terr-1/assignments/asg-1`)
      expect(init.method).toBe('DELETE')
    })
  })

  describe('campaigns', () => {
    const PERIOD_JSON = {
      id: 'period-1',
      started_at: '2026-10-01T12:00:00Z',
      completed_at: null,
      publishers: [{ id: 'pub-1', name: 'Ana' }]
    }
    const CAMPAIGN_JSON = {
      id: 'camp-1',
      name: 'Celebração',
      created_at: '2026-09-30T12:00:00Z',
      territories: [{ id: 'terr-1', name: 'Centro - N5' }],
      current_designation: PERIOD_JSON,
      designations: [PERIOD_JSON]
    }
    const PARSED_PERIOD = {
      id: 'period-1',
      startedAt: new Date('2026-10-01T12:00:00Z'),
      completedAt: undefined,
      publishers: [{ id: 'pub-1', name: 'Ana' }]
    }
    const PARSED_CAMPAIGN = {
      id: 'camp-1',
      name: 'Celebração',
      createdAt: new Date('2026-09-30T12:00:00Z'),
      territories: [{ id: 'terr-1', name: 'Centro - N5' }],
      currentDesignation: PARSED_PERIOD,
      designations: [PARSED_PERIOD]
    }

    it('listCampaigns GETs /admin/campaigns and parses territories and periods', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, [CAMPAIGN_JSON]))

      const campaigns = await client.listCampaigns()

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/campaigns`)
      expect(init.method).toBe('GET')
      expect(campaigns).toEqual([PARSED_CAMPAIGN])
    })

    it('parses a campaign that is not out with no current designation', async () => {
      const { client } = makeClient(
        jsonResponse(200, [{ ...CAMPAIGN_JSON, current_designation: null, designations: [] }])
      )

      const [campaign] = await client.listCampaigns()

      expect(campaign.currentDesignation).toBeUndefined()
      expect(campaign.designations).toEqual([])
    })

    it('createCampaign POSTs the name and the territory ids', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(201, CAMPAIGN_JSON))

      await client.createCampaign({ name: 'Celebração', territoryIds: ['terr-1'] })

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/campaigns`)
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({
        name: 'Celebração',
        territory_ids: ['terr-1']
      })
    })

    it('updateCampaign PATCHes only the fields given', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, CAMPAIGN_JSON))

      await client.updateCampaign('camp-1', { territoryIds: ['terr-1', 'terr-2'] })

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/campaigns/camp-1`)
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(init.body as string)).toEqual({ territory_ids: ['terr-1', 'terr-2'] })
    })

    it.each([
      [
        'designateCampaign',
        'POST',
        '/admin/campaigns/camp-1/designations',
        (client: ReturnType<typeof createApiClient>) =>
          client.designateCampaign('camp-1', ['pub-1'])
      ],
      [
        'setCampaignPublishers',
        'PUT',
        '/admin/campaigns/camp-1/designations/current/publishers',
        (client: ReturnType<typeof createApiClient>) =>
          client.setCampaignPublishers('camp-1', ['pub-1'])
      ]
    ])('%s sends the publishers as user_ids to %s %s', async (_name, method, path, call) => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, CAMPAIGN_JSON))

      const campaign = await call(client)

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}${path}`)
      expect(init.method).toBe(method)
      expect(JSON.parse(init.body as string)).toEqual({ user_ids: ['pub-1'] })
      expect(campaign).toEqual(PARSED_CAMPAIGN)
    })

    it('completeCampaign POSTs .../designations/current/complete with no body', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, CAMPAIGN_JSON))

      await client.completeCampaign('camp-1')

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/campaigns/camp-1/designations/current/complete`)
      expect(init.method).toBe('POST')
      expect(init.body).toBeUndefined()
    })

    it('deleteCampaign surfaces the 409 campaign_active with the server message', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(409, {
          code: 'campaign_active',
          detail: 'Conclua a campanha antes de apagá-la.'
        })
      )

      const error = await client.deleteCampaign('camp-1').catch((e) => e)

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/campaigns/camp-1`)
      expect(init.method).toBe('DELETE')
      expect(error).toBeInstanceOf(ApiErrorException)
      expect(error).toMatchObject({
        statusCode: 409,
        code: 'campaign_active',
        detail: 'Conclua a campanha antes de apagá-la.'
      })
    })
  })

  describe('blocks', () => {
    const BLOCK_JSON = {
      id: 'block-1',
      number: 3,
      polygon: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.5 },
        { lat: 0.5, lng: 0.5 }
      ],
      last_worked_at: null
    }
    const PARSED_BLOCK = {
      id: 'block-1',
      number: 3,
      polygon: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.5 },
        { lat: 0.5, lng: 0.5 }
      ],
      lastWorkedAt: undefined
    }

    it('createBlock POSTs /admin/territories/{id}/blocks with polygon and number', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, BLOCK_JSON))

      const block = await client.createBlock({
        territoryId: 'terr-1',
        polygon: VALID_RING,
        number: 3
      })

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/territories/terr-1/blocks`)
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({ number: 3, polygon: VALID_RING })
      expect(block).toEqual(PARSED_BLOCK)
    })

    it('createBlock omits number from the body when left out, asking the server to assign one', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, BLOCK_JSON))

      await client.createBlock({ territoryId: 'terr-1', polygon: VALID_RING })

      const [, init] = fetchImpl.mock.calls[0]
      expect(JSON.parse(init.body as string)).toEqual({ polygon: VALID_RING })
    })

    it('createBlock validates the polygon before sending any request, throwing InvalidPolygonError', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, BLOCK_JSON))

      await expect(
        client.createBlock({ territoryId: 'terr-1', polygon: SELF_INTERSECTING_RING })
      ).rejects.toBeInstanceOf(InvalidPolygonError)
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('parses status_override into statusOverride when the admin forced a status', async () => {
      const { client } = makeClient(
        jsonResponse(200, { ...BLOCK_JSON, status_override: 'overdue' })
      )

      const block = await client.updateBlock('block-1', { number: 7 })

      expect(block.statusOverride).toBe('overdue')
    })

    it('parses a status_override of null as undefined, leaving the status automatic', async () => {
      const { client } = makeClient(jsonResponse(200, { ...BLOCK_JSON, status_override: null }))

      const block = await client.updateBlock('block-1', { number: 7 })

      expect(block.statusOverride).toBeUndefined()
    })

    it('parses a block with no status_override at all as undefined', async () => {
      const { client } = makeClient(jsonResponse(200, BLOCK_JSON))

      const block = await client.updateBlock('block-1', { number: 7 })

      expect(block.statusOverride).toBeUndefined()
    })

    it('updateBlock PATCHes /admin/blocks/{id} sending only the number when polygon is omitted', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, BLOCK_JSON))

      await client.updateBlock('block-1', { number: 7 })

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/blocks/block-1`)
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(init.body as string)).toEqual({ number: 7 })
    })

    it('updateBlock sends only the polygon when number is omitted', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, BLOCK_JSON))

      await client.updateBlock('block-1', { polygon: VALID_RING })

      const [, init] = fetchImpl.mock.calls[0]
      expect(JSON.parse(init.body as string)).toEqual({ polygon: VALID_RING })
    })

    it('updateBlock sends status_override: null when statusOverride is explicitly null', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, BLOCK_JSON))

      await client.updateBlock('block-1', { statusOverride: null })

      const [, init] = fetchImpl.mock.calls[0]
      expect(JSON.parse(init.body as string)).toEqual({ status_override: null })
    })

    it('updateBlock sends the forced status as status_override', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, BLOCK_JSON))

      await client.updateBlock('block-1', { statusOverride: 'never' })

      const [, init] = fetchImpl.mock.calls[0]
      expect(JSON.parse(init.body as string)).toEqual({ status_override: 'never' })
    })

    it('updateBlock omits status_override entirely when statusOverride is not in the input', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, BLOCK_JSON))

      await client.updateBlock('block-1', { number: 7 })

      const [, init] = fetchImpl.mock.calls[0]
      expect(JSON.parse(init.body as string)).not.toHaveProperty('status_override')
    })

    it('updateBlock validates the polygon before sending any request when polygon is passed', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, BLOCK_JSON))

      await expect(
        client.updateBlock('block-1', { polygon: SELF_INTERSECTING_RING })
      ).rejects.toBeInstanceOf(InvalidPolygonError)
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('deleteBlock DELETEs /admin/blocks/{id}', async () => {
      const { client, fetchImpl } = makeClient(emptyResponse())

      await client.deleteBlock('block-1')

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/blocks/block-1`)
      expect(init.method).toBe('DELETE')
    })
  })

  describe('work logs', () => {
    const WORK_LOG_JSON = {
      id: 'log-1',
      block_id: 'block-1',
      user: { id: 'pub-1', name: 'Ana' },
      worked_at: '2026-08-01T09:00:00Z',
      created_at: '2026-08-01T09:05:00Z'
    }
    const PARSED_WORK_LOG = {
      id: 'log-1',
      blockId: 'block-1',
      publisher: { id: 'pub-1', name: 'Ana' },
      workedAt: new Date('2026-08-01T09:00:00Z'),
      createdAt: new Date('2026-08-01T09:05:00Z')
    }

    it('listWorkLogs GETs /admin/blocks/{id}/work-logs and returns the parsed list', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, [WORK_LOG_JSON]))

      const logs = await client.listWorkLogs('block-1')

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/blocks/block-1/work-logs`)
      expect(init.method).toBe('GET')
      expect(logs).toEqual([PARSED_WORK_LOG])
    })

    it('markBlockWorked POSTs /admin/blocks/{id}/worked with the publisher and an ISO date', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, WORK_LOG_JSON))

      const log = await client.markBlockWorked('block-1', {
        userId: 'pub-1',
        workedAt: new Date('2026-08-01T09:00:00Z')
      })

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/blocks/block-1/worked`)
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({
        user_id: 'pub-1',
        worked_at: '2026-08-01T09:00:00.000Z'
      })
      expect(log).toEqual(PARSED_WORK_LOG)
    })

    it('deleteWorkLog DELETEs /admin/work-logs/{id}', async () => {
      const { client, fetchImpl } = makeClient(emptyResponse())

      await client.deleteWorkLog('log-1')

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe(`${BASE_URL}/admin/work-logs/log-1`)
      expect(init.method).toBe('DELETE')
    })
  })

  describe('error responses', () => {
    it('throws before returning anything when the status is >= 400', async () => {
      const { client } = makeClient(jsonResponse(404, { code: 'not_found', detail: 'Sumiu.' }))

      await expect(client.listTerritories()).rejects.toBeInstanceOf(ApiErrorException)
    })

    it('maps a {code, detail} error body to ApiErrorException with those exact fields', async () => {
      const { client } = makeClient(
        jsonResponse(409, {
          code: 'territory_overlap',
          detail: 'A quadra 12 ficou fora da nova demarcação.'
        })
      )

      const error = await client.listTerritories().catch((e) => e)

      expect(error).toBeInstanceOf(ApiErrorException)
      expect(error).toMatchObject({
        statusCode: 409,
        code: 'territory_overlap',
        detail: 'A quadra 12 ficou fora da nova demarcação.'
      })
    })

    it.each([
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [404, 'not_found'],
      [409, 'conflict'],
      [429, 'rate_limit_exceeded'],
      [500, 'error']
    ])(
      'derives code %j -> %j from the status when a {detail} body has no code',
      async (status, expectedCode) => {
        const { client } = makeClient(jsonResponse(status, { detail: 'Mensagem crua do FastAPI.' }))

        const error = await client.listTerritories().catch((e) => e)

        expect(error).toBeInstanceOf(ApiErrorException)
        expect(error).toMatchObject({
          statusCode: status,
          code: expectedCode,
          detail: 'Mensagem crua do FastAPI.'
        })
      }
    )

    it('maps a {detail: [...]} array (FastAPI 422) to a fixed invalid_request error', async () => {
      const { client } = makeClient(
        jsonResponse(422, { detail: [{ loc: ['body', 'name'], msg: 'field required' }] })
      )

      const error = await client.listTerritories().catch((e) => e)

      expect(error).toBeInstanceOf(ApiErrorException)
      expect(error).toMatchObject({
        statusCode: 422,
        code: 'invalid_request',
        detail: 'O aplicativo enviou dados em formato inválido.'
      })
    })

    it('throws NetworkException when the error body is not valid JSON', async () => {
      const { client } = makeClient(textResponse(502, '<html>bad gateway</html>'))

      await expect(client.listTerritories()).rejects.toBeInstanceOf(NetworkException)
    })

    it('throws NetworkException when the error body is valid JSON but matches none of the known shapes', async () => {
      const { client } = makeClient(jsonResponse(500, { unexpected: 'shape' }))

      await expect(client.listTerritories()).rejects.toBeInstanceOf(NetworkException)
    })

    it('throws NetworkException when a success response body is non-empty but not valid JSON', async () => {
      const { client } = makeClient(textResponse(200, 'not json at all'))

      await expect(client.listTerritories()).rejects.toBeInstanceOf(NetworkException)
    })

    it('throws NetworkException when fetch itself rejects', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      })
      const client = createApiClient({ baseUrl: BASE_URL, appKey: APP_KEY, fetchImpl })

      await expect(client.listTerritories()).rejects.toBeInstanceOf(NetworkException)
    })

    it('throws NetworkException when fetch itself throws synchronously', async () => {
      const fetchImpl = vi.fn(() => {
        throw new Error('boom')
      })
      const client = createApiClient({
        baseUrl: BASE_URL,
        appKey: APP_KEY,
        fetchImpl: fetchImpl as unknown as FetchImpl
      })

      await expect(client.listTerritories()).rejects.toBeInstanceOf(NetworkException)
    })
  })

  describe('empty success bodies', () => {
    it('resolves a DELETE with an empty body without trying to parse JSON', async () => {
      const { client } = makeClient(emptyResponse())

      await expect(client.deleteTerritory('terr-1')).resolves.toBeUndefined()
    })
  })
})
