// Every test here injects a fake `fetch`. None of them touches the network,
// and none of them depends on `react-native-config` having real values -- the
// base URL and the app key are passed in explicitly, so what the assertions
// compare against is spelled out in the file rather than imported from a mock.

import {
  ApiError,
  NetworkError,
  createApiClient,
  type FetchImpl,
  type FetchResponseLike,
} from './api-client';

const BASE_URL = 'https://territory.example.test';
const APP_KEY = 'the-app-key';

/** A `FetchResponseLike` whose body is the given raw text. */
function textResponse(status: number, text: string): FetchResponseLike {
  return { status, text: async () => text };
}

/** A `FetchResponseLike` whose body is `body`, JSON-encoded. */
function jsonResponse(status: number, body: unknown): FetchResponseLike {
  return textResponse(status, JSON.stringify(body));
}

/** A `FetchImpl` fake that answers each call with the next queued response. */
function queueFetch(...responses: FetchResponseLike[]): FetchImpl & jest.Mock {
  let index = 0;
  return jest.fn(async () => responses[Math.min(index++, responses.length - 1)]);
}

function makeClient(...responses: FetchResponseLike[]): {
  client: ReturnType<typeof createApiClient>;
  fetchImpl: FetchImpl & jest.Mock;
} {
  const fetchImpl = queueFetch(...responses);
  const client = createApiClient({ fetchImpl, baseUrl: BASE_URL, appKey: APP_KEY });
  return { client, fetchImpl };
}

const CONGREGATION_JSON = { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' };

describe('createApiClient', () => {
  describe('login', () => {
    it('POSTs /auth/login with name, city and password, and returns the token and congregation', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, { access_token: 'jwt-123', congregation: CONGREGATION_JSON }),
      );

      const result = await client.login({
        name: 'Congregação Central',
        city: 'São Paulo',
        password: 'senha-secreta',
      });

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/auth/login`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({
        name: 'Congregação Central',
        city: 'São Paulo',
        password: 'senha-secreta',
      });
      expect(result).toEqual({
        accessToken: 'jwt-123',
        congregation: { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' },
      });
    });
  });

  describe('listTerritories', () => {
    it('GETs /admin/territories and reads the boundary as {lat, lng}, the order the API speaks', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, [
          {
            id: 'terr-1',
            name: 'Setor 1',
            boundary: [
              { lat: -23.5, lng: -46.6 },
              { lat: -23.4, lng: -46.5 },
              { lat: -23.6, lng: -46.4 },
            ],
            assigned_user: null,
            rotation_days: null,
            last_work: null,
          },
        ]),
      );

      const territories = await client.listTerritories();

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/admin/territories`);
      expect(init.method).toBe('GET');
      expect(territories).toHaveLength(1);
      expect(territories[0].boundary).toEqual([
        { lat: -23.5, lng: -46.6 },
        { lat: -23.4, lng: -46.5 },
        { lat: -23.6, lng: -46.4 },
      ]);
    });

    it('reads a territory with no publisher as assignedPublisher null', async () => {
      const { client } = makeClient(
        jsonResponse(200, [
          { id: 'terr-1', name: 'Setor 1', boundary: [], assigned_user: null, rotation_days: null },
        ]),
      );

      const [territory] = await client.listTerritories();

      expect(territory.assignedPublisher).toBeNull();
      expect(territory.rotationDays).toBeNull();
      expect(territory.blocks).toEqual([]);
    });

    it('parses last_work independently from the territory leader', async () => {
      const { client } = makeClient(
        jsonResponse(200, [
          {
            id: 'terr-1',
            name: 'Setor 1',
            boundary: [],
            assigned_user: { id: 'leader-1', name: 'Dirigente' },
            last_work: {
              user: { id: 'worker-1', name: 'Visitante' },
              worked_at: '2026-08-15T10:30:00Z',
            },
            rotation_days: null,
          },
        ]),
      );

      const [territory] = await client.listTerritories();

      expect(territory.assignedPublisher).toEqual({ id: 'leader-1', name: 'Dirigente' });
      expect(territory.lastWork).toEqual({
        publisher: { id: 'worker-1', name: 'Visitante' },
        workedAt: new Date('2026-08-15T10:30:00Z'),
      });
    });

    it('keeps last_work null when the territory has no recorded work', async () => {
      const { client } = makeClient(
        jsonResponse(200, [
          { id: 'terr-1', name: 'Setor 1', boundary: [], assigned_user: null, last_work: null },
        ]),
      );

      const [territory] = await client.listTerritories();

      expect(territory.lastWork).toBeNull();
    });

    it('reads a payload with no ring at all as an empty ring, rather than crashing on it', async () => {
      const { client } = makeClient(
        jsonResponse(200, [{ id: 'terr-1', name: 'Setor 1', assigned_user: null }]),
      );

      const [territory] = await client.listTerritories();

      expect(territory.boundary).toEqual([]);
    });

    it('reads a territory with a publisher as {id, name}', async () => {
      const { client } = makeClient(
        jsonResponse(200, [
          {
            id: 'terr-1',
            name: 'Setor 1',
            boundary: [],
            assigned_user: { id: 'user-1', name: 'Ana' },
            rotation_days: 90,
          },
        ]),
      );

      const [territory] = await client.listTerritories();

      expect(territory.assignedPublisher).toEqual({ id: 'user-1', name: 'Ana' });
      expect(territory.rotationDays).toBe(90);
    });
  });

  describe('getTerritory', () => {
    const BLOCK_JSON = {
      id: 'block-1',
      number: 7,
      polygon: [
        { lat: -23.5, lng: -46.6 },
        { lat: -23.4, lng: -46.5 },
        { lat: -23.6, lng: -46.4 },
      ],
      last_worked_at: '2026-07-01T09:00:00Z',
      status_override: 'overdue',
    };

    it('GETs the detail endpoint and nests the blocks, each carrying its territory id', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, {
          id: 'terr-1',
          name: 'Setor 1',
          boundary: [],
          assigned_user: null,
          rotation_days: null,
          blocks: [BLOCK_JSON],
        }),
      );

      const territory = await client.getTerritory('terr-1');

      const [url] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/admin/territories/terr-1`);
      expect(territory.blocks).toEqual([
        {
          id: 'block-1',
          territoryId: 'terr-1',
          number: 7,
          polygon: [
            { lat: -23.5, lng: -46.6 },
            { lat: -23.4, lng: -46.5 },
            { lat: -23.6, lng: -46.4 },
          ],
          lastWorkedAt: new Date('2026-07-01T09:00:00Z'),
          statusOverride: 'overdue',
        },
      ]);
    });

    it('reads a block that was never worked and never forced as two nulls', async () => {
      const { client } = makeClient(
        jsonResponse(200, {
          id: 'terr-1',
          name: 'Setor 1',
          boundary: [],
          assigned_user: null,
          rotation_days: null,
          blocks: [{ id: 'block-1', number: 1, polygon: [], last_worked_at: null, status_override: null }],
        }),
      );

      const territory = await client.getTerritory('terr-1');

      expect(territory.blocks[0].lastWorkedAt).toBeNull();
      expect(territory.blocks[0].statusOverride).toBeNull();
    });
  });

  describe('listTerritoriesWithBlocks', () => {
    it('makes one listing request plus one detail request per territory, and nests the blocks', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, [
          { id: 'terr-1', name: 'Setor 1', boundary: [], assigned_user: null, rotation_days: null },
          { id: 'terr-2', name: 'Setor 2', boundary: [], assigned_user: null, rotation_days: null },
        ]),
        jsonResponse(200, {
          id: 'terr-1',
          name: 'Setor 1',
          boundary: [],
          assigned_user: null,
          rotation_days: null,
          blocks: [{ id: 'block-1', number: 1, polygon: [], last_worked_at: null, status_override: null }],
        }),
        jsonResponse(200, {
          id: 'terr-2',
          name: 'Setor 2',
          boundary: [],
          assigned_user: null,
          rotation_days: null,
          blocks: [
            { id: 'block-2', number: 2, polygon: [], last_worked_at: null, status_override: null },
            { id: 'block-3', number: 3, polygon: [], last_worked_at: null, status_override: null },
          ],
        }),
      );

      const territories = await client.listTerritoriesWithBlocks();

      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(fetchImpl.mock.calls.map(call => call[0])).toEqual([
        `${BASE_URL}/admin/territories`,
        `${BASE_URL}/admin/territories/terr-1`,
        `${BASE_URL}/admin/territories/terr-2`,
      ]);
      expect(territories.map(territory => territory.blocks.length)).toEqual([1, 2]);
      expect(territories.map(territory => territory.id)).toEqual(['terr-1', 'terr-2']);
    });
  });

  describe('listPublishers', () => {
    it('GETs /admin/users and reads the dates, keeping an absent code as null', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, [
          {
            id: 'user-1',
            name: 'Ana',
            access_code: 'ABCD2345',
            access_code_expires_at: '2026-08-24T10:00:00Z',
            activated_at: null,
            is_active: true,
          },
          {
            id: 'user-2',
            name: 'Bruno',
            access_code: null,
            access_code_expires_at: null,
            activated_at: '2026-08-01T12:00:00Z',
            is_active: false,
          },
        ]),
      );

      const publishers = await client.listPublishers();

      expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE_URL}/admin/users`);
      expect(publishers).toEqual([
        {
          id: 'user-1',
          name: 'Ana',
          accessCode: 'ABCD2345',
          accessCodeExpiresAt: new Date('2026-08-24T10:00:00Z'),
          activatedAt: null,
          isActive: true,
        },
        {
          id: 'user-2',
          name: 'Bruno',
          accessCode: null,
          accessCodeExpiresAt: null,
          activatedAt: new Date('2026-08-01T12:00:00Z'),
          isActive: false,
        },
      ]);
    });
  });

  describe('listAssignments', () => {
    it('GETs the S-13 card, reading the open row as completedAt null', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, [
          {
            id: 'assign-1',
            user: { id: 'user-1', name: 'Ana' },
            started_at: '2026-08-01T12:00:00Z',
            completed_at: null,
          },
          {
            id: 'assign-2',
            user: { id: 'user-2', name: 'Bruno' },
            started_at: '2026-04-01T12:00:00Z',
            completed_at: '2026-07-31T12:00:00Z',
          },
        ]),
      );

      const assignments = await client.listAssignments('terr-1');

      expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE_URL}/admin/territories/terr-1/assignments`);
      expect(assignments).toEqual([
        {
          id: 'assign-1',
          territoryId: 'terr-1',
          publisher: { id: 'user-1', name: 'Ana' },
          startedAt: new Date('2026-08-01T12:00:00Z'),
          completedAt: null,
        },
        {
          id: 'assign-2',
          territoryId: 'terr-1',
          publisher: { id: 'user-2', name: 'Bruno' },
          startedAt: new Date('2026-04-01T12:00:00Z'),
          completedAt: new Date('2026-07-31T12:00:00Z'),
        },
      ]);
    });
  });

  describe('designate', () => {
    it('POSTs the chosen publisher as user_id and returns the new open assignment', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(201, {
          id: 'assign-1',
          user: { id: 'user-1', name: 'Ana' },
          started_at: '2026-08-23T12:00:00Z',
          completed_at: null,
        }),
      );

      const assignment = await client.designate('terr-1', 'user-1');

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/admin/territories/terr-1/assignments`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ user_id: 'user-1' });
      expect(assignment.territoryId).toBe('terr-1');
      expect(assignment.completedAt).toBeNull();
    });
  });

  describe('completeAssignment', () => {
    it('POSTs to /complete and returns the row now carrying a completion date', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, {
          id: 'assign-1',
          user: { id: 'user-1', name: 'Ana' },
          started_at: '2026-08-01T12:00:00Z',
          completed_at: '2026-08-23T12:00:00Z',
        }),
      );

      const assignment = await client.completeAssignment('terr-1');

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/admin/territories/terr-1/assignments/complete`);
      expect(init.method).toBe('POST');
      expect(assignment.completedAt).toEqual(new Date('2026-08-23T12:00:00Z'));
    });
  });

  describe('deleteAssignment', () => {
    it('DELETEs the row and resolves on a 204 without trying to read a body', async () => {
      const { client, fetchImpl } = makeClient(textResponse(204, ''));

      await expect(client.deleteAssignment('terr-1', 'assign-1')).resolves.toBeUndefined();

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/admin/territories/terr-1/assignments/assign-1`);
      expect(init.method).toBe('DELETE');
    });
  });

  describe('listWorkLogs', () => {
    it('GETs the block history and reads who worked it and when', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, [
          {
            id: 'log-1',
            block_id: 'block-1',
            user: { id: 'user-1', name: 'Ana' },
            worked_at: '2026-08-20T14:00:00Z',
            created_at: '2026-08-20T14:05:00Z',
          },
        ]),
      );

      const logs = await client.listWorkLogs('block-1');

      expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE_URL}/admin/blocks/block-1/work-logs`);
      expect(logs).toEqual([
        {
          id: 'log-1',
          blockId: 'block-1',
          publisher: { id: 'user-1', name: 'Ana' },
          workedAt: new Date('2026-08-20T14:00:00Z'),
        },
      ]);
    });
  });

  describe('markWorked', () => {
    const WORK_LOG_JSON = {
      id: 'log-1',
      block_id: 'block-1',
      user: { id: 'user-1', name: 'Ana' },
      worked_at: '2026-08-20T14:00:00Z',
      created_at: '2026-08-20T14:05:00Z',
    };

    it('POSTs user_id and worked_at in ISO 8601 to the block', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(201, WORK_LOG_JSON));

      const log = await client.markWorked(
        'block-1',
        'user-1',
        new Date('2026-08-20T14:00:00Z'),
      );

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/admin/blocks/block-1/worked`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({
        user_id: 'user-1',
        worked_at: '2026-08-20T14:00:00.000Z',
      });
      expect(log.id).toBe('log-1');
    });

    it('sends no client-side log id -- the server mints that one', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(201, WORK_LOG_JSON));

      await client.markWorked('block-1', 'user-1', new Date('2026-08-20T14:00:00Z'));

      const [, init] = fetchImpl.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body).not.toHaveProperty('log_id');
      expect(body).not.toHaveProperty('id');
      expect(Object.keys(body).sort()).toEqual(['user_id', 'worked_at']);
    });
  });

  describe('deleteWorkLog', () => {
    it('DELETEs /admin/work-logs/{logId} with the app key, and resolves on a 204 without reading a body', async () => {
      const { client, fetchImpl } = makeClient(textResponse(204, ''));

      await expect(client.deleteWorkLog('log-1')).resolves.toBeUndefined();

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/admin/work-logs/log-1`);
      expect(init.method).toBe('DELETE');
      expect(init.headers['X-App-Key']).toBe(APP_KEY);
    });

    it('sends Authorization: Bearer <token> once a token has been set', async () => {
      const { client, fetchImpl } = makeClient(textResponse(204, ''));
      client.setToken('jwt-123');

      await client.deleteWorkLog('log-1');

      const [, init] = fetchImpl.mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer jwt-123');
    });

    it('throws an ApiError with the message from the body on a 404', async () => {
      const { client } = makeClient(
        jsonResponse(404, { code: 'not_found', detail: 'Registro não encontrado.' }),
      );

      const error = await client.deleteWorkLog('log-nope').catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(404);
      expect((error as ApiError).isUnauthorized).toBe(false);
      expect((error as ApiError).message).toBe('Registro não encontrado.');
    });

    it('throws an ApiError whose isUnauthorized is true on a 401, so the session can renew the JWT', async () => {
      const { client } = makeClient(
        jsonResponse(401, { code: 'unauthorized', detail: 'Token expirado.' }),
      );

      const error = await client.deleteWorkLog('log-1').catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).isUnauthorized).toBe(true);
    });

    it('throws NetworkError, not ApiError, when fetch itself rejects', async () => {
      const fetchImpl: FetchImpl = jest.fn(async () => {
        throw new Error('connection refused');
      });
      const client = createApiClient({ fetchImpl, baseUrl: BASE_URL, appKey: APP_KEY });

      const error = await client.deleteWorkLog('log-1').catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(NetworkError);
      expect(error).not.toBeInstanceOf(ApiError);
    });
  });

  describe('configuration', () => {
    // The values below are the ones jest.setup.js fakes for react-native-config;
    // in a build they come from admin-app/.env.
    it('falls back to API_BASE_URL and APP_KEY from the build config when none are passed', async () => {
      const fetchImpl = queueFetch(jsonResponse(200, []));
      const client = createApiClient({ fetchImpl });

      await client.listTerritories();

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('http://localhost:8000/admin/territories');
      expect(init.headers['X-App-Key']).toBe('test-app-key');
    });
  });

  describe('errors', () => {
    it('throws an ApiError whose isUnauthorized is true on a 401', async () => {
      const { client } = makeClient(
        jsonResponse(401, { code: 'unauthorized', detail: 'Token expirado.' }),
      );

      const error = await client.listTerritories().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(401);
      expect((error as ApiError).isUnauthorized).toBe(true);
    });

    it('throws an ApiError whose isUnauthorized is false on a 409, carrying the message the API sent', async () => {
      const { client } = makeClient(
        jsonResponse(409, {
          code: 'publisher_has_open_assignment',
          detail: 'Conclua a designação em vigor antes de apagar o publicador.',
        }),
      );

      const error = await client.listTerritories().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(409);
      expect((error as ApiError).isUnauthorized).toBe(false);
      expect((error as ApiError).code).toBe('publisher_has_open_assignment');
      expect((error as ApiError).message).toBe(
        'Conclua a designação em vigor antes de apagar o publicador.',
      );
    });

    it('reads a bare FastAPI {detail: "…"} body as the message', async () => {
      const { client } = makeClient(jsonResponse(401, { detail: 'Not authenticated' }));

      const error = await client.listTerritories().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).message).toBe('Not authenticated');
      expect((error as ApiError).isUnauthorized).toBe(true);
    });

    it('falls back to a generic Portuguese message when the error body explains nothing', async () => {
      const { client } = makeClient(textResponse(500, '<html>Bad Gateway</html>'));

      const error = await client.listTerritories().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(500);
      expect((error as ApiError).message).toContain('500');
      expect((error as ApiError).message).toMatch(/servidor/i);
    });

    it('reports FastAPI 422 field errors as a message the admin can read', async () => {
      const { client } = makeClient(
        jsonResponse(422, { detail: [{ loc: ['body', 'user_id'], msg: 'field required' }] }),
      );

      const error = await client.listTerritories().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(422);
      expect((error as ApiError).message).toMatch(/inválid/i);
    });

    it.each([
      [403, 'forbidden'],
      [404, 'not_found'],
      [409, 'conflict'],
      [429, 'rate_limit_exceeded'],
      [500, 'error'],
    ])('names the code of a %i whose body carries none', async (status, expectedCode) => {
      const { client } = makeClient(jsonResponse(status, { detail: 'algo deu errado' }));

      const error = await client.listTerritories().catch((caught: unknown) => caught);

      expect((error as ApiError).code).toBe(expectedCode);
      expect((error as ApiError).isUnauthorized).toBe(false);
    });

    it('falls back to the generic message when the body is JSON but says nothing recognizable', async () => {
      const { client } = makeClient(jsonResponse(503, {}));

      const error = await client.listTerritories().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(503);
      expect((error as ApiError).message).toContain('503');
    });

    it('throws NetworkError, not ApiError, when fetch itself rejects', async () => {
      const fetchImpl = jest.fn(async () => {
        throw new TypeError('Network request failed');
      }) as unknown as FetchImpl & jest.Mock;
      const client = createApiClient({ fetchImpl, baseUrl: BASE_URL, appKey: APP_KEY });

      const error = await client.listTerritories().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(NetworkError);
      // Being an ApiError would make the session retry the login on something
      // that never reached the server at all.
      expect(error).not.toBeInstanceOf(ApiError);
      expect((error as NetworkError).message).toMatch(/conex/i);
    });

    it('throws NetworkError when a 2xx body is not the JSON this client can read', async () => {
      const { client } = makeClient(textResponse(200, 'não é JSON'));

      const error = await client.listTerritories().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(NetworkError);
      expect(error).not.toBeInstanceOf(ApiError);
    });
  });

  describe('headers', () => {
    it('sends X-App-Key on every request', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, []));

      await client.listTerritories();

      const [, init] = fetchImpl.mock.calls[0];
      expect(init.headers['X-App-Key']).toBe(APP_KEY);
    });

    it('sends no Authorization header before setToken', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, []));

      await client.listTerritories();

      const [, init] = fetchImpl.mock.calls[0];
      expect(init.headers.Authorization).toBeUndefined();
    });

    it('sends Authorization: Bearer <token> after setToken', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, []));

      client.setToken('abc');
      await client.listTerritories();

      const [, init] = fetchImpl.mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer abc');
    });

    it('drops the Authorization header again after setToken(null)', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, []));

      client.setToken('abc');
      client.setToken(null);
      await client.listTerritories();

      const [, init] = fetchImpl.mock.calls[0];
      expect(init.headers.Authorization).toBeUndefined();
    });
  });
});
