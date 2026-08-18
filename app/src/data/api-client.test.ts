jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    API_BASE_URL: 'https://territory.example.test',
    APP_KEY: 'the-app-key',
  },
}));

import {
  createApiClient,
  ApiErrorException,
  NetworkException,
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

/** A `FetchImpl` fake that always answers the same response, capturing every call. */
function fakeFetch(response: FetchResponseLike): FetchImpl & jest.Mock {
  return jest.fn(async () => response);
}

function makeClient(response: FetchResponseLike): {
  client: ReturnType<typeof createApiClient>;
  fetchImpl: FetchImpl & jest.Mock;
} {
  const fetchImpl = fakeFetch(response);
  const client = createApiClient({ fetchImpl });
  return { client, fetchImpl };
}

const CONGREGATION_JSON = { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' };

describe('createApiClient', () => {
  describe('activate', () => {
    it('POSTs /app/activate with { access_code } and returns the parsed result', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, {
          token: 'app-token',
          user: { id: 'user-1', name: 'Ana' },
          congregation: CONGREGATION_JSON,
        }),
      );

      const result = await client.activate('ABCD2345');

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/app/activate`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ access_code: 'ABCD2345' });
      expect(result).toEqual({
        token: 'app-token',
        user: { id: 'user-1', name: 'Ana' },
        congregation: { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' },
      });
    });

    it('sends the X-App-Key header, and no Authorization header (no token yet)', async () => {
      const { client, fetchImpl } = makeClient(
        jsonResponse(200, {
          token: 'app-token',
          user: { id: 'user-1', name: 'Ana' },
          congregation: CONGREGATION_JSON,
        }),
      );

      await client.activate('ABCD2345');

      const [, init] = fetchImpl.mock.calls[0];
      expect(init.headers['X-App-Key']).toBe(APP_KEY);
      expect(init.headers.Authorization).toBeUndefined();
    });
  });

  describe('listTerritories', () => {
    const TERRITORY_JSON = {
      id: 'terr-1',
      name: 'Setor 1',
      boundary: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
        { lat: 1, lng: 1 },
      ],
      blocks: [
        {
          id: 'block-1',
          number: 1,
          polygon: [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 0.5 },
            { lat: 0.5, lng: 0.5 },
          ],
          last_worked_at: '2026-07-01T09:00:00Z',
        },
      ],
      assigned_user: { id: 'user-1', name: 'Ana' },
    };
    const PARSED_TERRITORY = {
      id: 'terr-1',
      name: 'Setor 1',
      boundary: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
        { lat: 1, lng: 1 },
      ],
      blocks: [
        {
          id: 'block-1',
          number: 1,
          polygon: [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 0.5 },
            { lat: 0.5, lng: 0.5 },
          ],
          lastWorkedAt: new Date('2026-07-01T09:00:00Z'),
        },
      ],
      assignedUser: { id: 'user-1', name: 'Ana' },
    };

    it('GETs /app/territories with Authorization: Bearer <token> and returns the parsed list', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, [TERRITORY_JSON]));

      const territories = await client.listTerritories('app-token');

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/app/territories`);
      expect(init.method).toBe('GET');
      expect(init.headers.Authorization).toBe('Bearer app-token');
      expect(init.headers['X-App-Key']).toBe(APP_KEY);
      expect(territories).toEqual([PARSED_TERRITORY]);
    });

    it('parses a territory with no assigned_user and no blocks as undefined/empty', async () => {
      const { client } = makeClient(
        jsonResponse(200, [{ ...TERRITORY_JSON, assigned_user: null, blocks: undefined }]),
      );

      const [territory] = await client.listTerritories('app-token');

      expect(territory.assignedUser).toBeUndefined();
      expect(territory.blocks).toEqual([]);
    });

    it('parses a block that has never been worked (last_worked_at: null) as lastWorkedAt: undefined', async () => {
      const neverWorkedBlock = { ...TERRITORY_JSON.blocks[0], last_worked_at: null };
      const { client } = makeClient(
        jsonResponse(200, [{ ...TERRITORY_JSON, blocks: [neverWorkedBlock] }]),
      );

      const [territory] = await client.listTerritories('app-token');

      expect(territory.blocks[0].lastWorkedAt).toBeUndefined();
    });
  });

  describe('listWorkedTerritories', () => {
    const WORKED_TERRITORY_JSON = {
      id: 'terr-1',
      name: 'Setor 1',
      last_worked_at: '2026-08-10T09:00:00Z',
    };
    const PARSED_WORKED_TERRITORY = {
      id: 'terr-1',
      name: 'Setor 1',
      lastWorkedAt: new Date('2026-08-10T09:00:00Z'),
    };

    it('GETs /app/worked-territories with Authorization: Bearer <token> and returns the parsed list', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(200, [WORKED_TERRITORY_JSON]));

      const worked = await client.listWorkedTerritories('app-token');

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/app/worked-territories`);
      expect(init.method).toBe('GET');
      expect(init.headers.Authorization).toBe('Bearer app-token');
      expect(worked).toEqual([PARSED_WORKED_TERRITORY]);
    });
  });

  describe('markBlockWorked', () => {
    const WORK_LOG_JSON = {
      id: 'log-1',
      block_id: 'block-1',
      user: { id: 'user-1', name: 'Ana' },
      worked_at: '2026-08-17T09:00:00Z',
      created_at: '2026-08-17T09:05:00Z',
    };
    const WORKED_AT = new Date('2026-08-17T09:00:00Z');

    it('POSTs /app/blocks/{id}/worked with { log_id, worked_at } and the token, and resolves on 201 (new visit)', async () => {
      const { client, fetchImpl } = makeClient(jsonResponse(201, WORK_LOG_JSON));

      await expect(
        client.markBlockWorked('app-token', 'block-1', 'log-1', WORKED_AT),
      ).resolves.toBeUndefined();

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/app/blocks/block-1/worked`);
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer app-token');
      expect(JSON.parse(init.body as string)).toEqual({
        log_id: 'log-1',
        worked_at: WORKED_AT.toISOString(),
      });
    });

    it('resolves on 200 (resend of an already-stored visit) without throwing', async () => {
      const { client } = makeClient(jsonResponse(200, WORK_LOG_JSON));

      await expect(
        client.markBlockWorked('app-token', 'block-1', 'log-1', WORKED_AT),
      ).resolves.toBeUndefined();
    });
  });

  describe('error responses', () => {
    it('maps a non-2xx {code, detail} error body to ApiErrorException with those exact fields', async () => {
      const { client } = makeClient(
        jsonResponse(403, {
          code: 'territory_not_assigned',
          detail: 'Este território não está designado a você.',
        }),
      );

      const error = await client
        .markBlockWorked('app-token', 'block-1', 'log-1', new Date())
        .catch((e) => e);

      expect(error).toBeInstanceOf(ApiErrorException);
      expect(error).toMatchObject({
        statusCode: 403,
        code: 'territory_not_assigned',
        detail: 'Este território não está designado a você.',
      });
    });

    it('rejects with ApiErrorException (not NetworkException) for a non-2xx response', async () => {
      const { client } = makeClient(
        jsonResponse(404, { code: 'not_found', detail: 'Sumiu.' }),
      );

      await expect(client.listTerritories('app-token')).rejects.toBeInstanceOf(
        ApiErrorException,
      );
    });

    it('rejects with NetworkException when a non-2xx body is not valid JSON', async () => {
      const { client } = makeClient(textResponse(502, '<html>bad gateway</html>'));

      await expect(client.listTerritories('app-token')).rejects.toBeInstanceOf(
        NetworkException,
      );
    });

    it('rejects with NetworkException when a non-2xx body is valid JSON but not the {code, detail} shape', async () => {
      const { client } = makeClient(jsonResponse(500, { unexpected: 'shape' }));

      await expect(client.listTerritories('app-token')).rejects.toBeInstanceOf(
        NetworkException,
      );
    });
  });

  describe('network failures', () => {
    it('rejects with NetworkException, not ApiErrorException, when fetch itself rejects', async () => {
      const fetchImpl: FetchImpl = jest.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      });
      const client = createApiClient({ fetchImpl });

      const error = await client.listTerritories('app-token').catch((e) => e);

      expect(error).toBeInstanceOf(NetworkException);
      expect(error).not.toBeInstanceOf(ApiErrorException);
    });

    it('rejects with NetworkException when a success response body is non-empty but not valid JSON', async () => {
      const { client } = makeClient(textResponse(200, 'not json at all'));

      await expect(client.listTerritories('app-token')).rejects.toBeInstanceOf(
        NetworkException,
      );
    });
  });
});
