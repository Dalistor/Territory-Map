// The one place the app talks to the server. Every call injects the
// `X-App-Key` header (read from `react-native-config`, see `app/.env.example`
// for the two variables it reads) and, when a token is passed,
// `Authorization: Bearer <token>`. The server always answers a non-2xx
// response with a `{code, detail}` body (see the root CLAUDE.md, "Chave de
// aplicação" / error contract) -- that becomes `ApiErrorException`. A `fetch`
// that never got a response at all (offline, DNS, refused connection)
// becomes `NetworkException` instead, so a caller (the offline queue) can
// tell "the server rejected this" apart from "try again once there is a
// signal".
//
// Domain shapes (`LatLng`, `PublisherBrief`, `Congregation`, `Block`,
// `Territory`, `WorkedTerritory`, `Session`) come from `../domain/models`
// (spec 0005, Task 17) -- this module only knows how to decode the server's
// wire format (`snake_case`, nullable fields) into them.

import Config from 'react-native-config';
import type {
  Block,
  BlockStatusOverride,
  Congregation,
  LatLng,
  PublisherBrief,
  Session,
  Territory,
  WorkedTerritory,
} from '../domain/models';

/** Base type for everything this client throws. */
export class ApiException extends Error {}

/**
 * The server answered with a `{code, detail}` error body -- the contract
 * every non-2xx response from this API follows.
 */
export class ApiErrorException extends ApiException {
  readonly statusCode: number;
  readonly code: string;
  readonly detail: string;

  constructor(statusCode: number, code: string, detail: string) {
    super(detail);
    this.name = 'ApiErrorException';
    this.statusCode = statusCode;
    this.code = code;
    this.detail = detail;
  }
}

/**
 * The request never reached a response worth parsing -- `fetch` itself
 * rejected or threw (offline, DNS, refused connection), or the body that
 * came back was not the JSON this client knows how to read.
 */
export class NetworkException extends ApiException {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkException';
  }
}

const APP_KEY_HEADER = 'X-App-Key';

/** Not the DOM lib's `RequestInit` -- just the subset this module builds and sends. */
export interface FetchRequestInit {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

/** Not the DOM lib's `Response` -- just the subset this module reads. */
export interface FetchResponseLike {
  readonly status: number;
  text(): Promise<string>;
}

/**
 * The shape of React Native's global `fetch`, restated locally so tests can
 * inject a trivial fake instead of a real `Response`.
 */
export type FetchImpl = (url: string, init: FetchRequestInit) => Promise<FetchResponseLike>;

export interface ApiClient {
  /** `POST /app/activate` -- trades a one-time access code for a permanent app token. */
  activate(accessCode: string): Promise<Session>;
  /** `GET /app/territories` -- the whole congregation map, with blocks nested inside. */
  listTerritories(token: string): Promise<Territory[]>;
  /** `GET /app/worked-territories` -- territories this publisher has worked, most recent first. */
  listWorkedTerritories(token: string): Promise<WorkedTerritory[]>;
  /** `POST /app/blocks/{id}/worked` -- records a visit. Resolves on both 201 (new) and 200 (resend). */
  markBlockWorked(
    token: string,
    blockId: string,
    logId: string,
    workedAt: Date,
  ): Promise<void>;
}

export interface CreateApiClientOptions {
  /** Defaults to the global `fetch` React Native provides. Tests inject a fake here instead. */
  readonly fetchImpl?: FetchImpl;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Turns a `status >= 400` response body into the exception the caller sees. */
function errorFrom(status: number, text: string): ApiErrorException | NetworkException {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    return new NetworkException(`O servidor respondeu ${status} sem explicar o motivo.`);
  }

  if (
    isRecord(decoded) &&
    typeof decoded.code === 'string' &&
    typeof decoded.detail === 'string'
  ) {
    return new ApiErrorException(status, decoded.code, decoded.detail);
  }

  return new NetworkException(`O servidor respondeu ${status} sem explicar o motivo.`);
}

function parseLatLng(json: Record<string, unknown>): LatLng {
  return { lat: json.lat as number, lng: json.lng as number };
}

function parseOptionalDate(value: unknown): Date | undefined {
  return value === null || value === undefined ? undefined : new Date(value as string);
}

/**
 * The counterpart of `parseOptionalDate` for a nullable number: the server
 * spells "no value" as `null` (`rotation_days` on a territory that uses the
 * default rotation), and an older payload may omit the key entirely. Both
 * become `undefined`, the single absent value the domain models use.
 */
function parseOptionalNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : (value as number);
}

function parsePublisherBrief(json: Record<string, unknown>): PublisherBrief {
  return { id: json.id as string, name: json.name as string };
}

function parseCongregation(json: Record<string, unknown>): Congregation {
  return { id: json.id as string, name: json.name as string, city: json.city as string };
}

function parseBlock(json: Record<string, unknown>): Block {
  return {
    id: json.id as string,
    number: json.number as number,
    polygon: ((json.polygon as Record<string, unknown>[] | undefined) ?? []).map(parseLatLng),
    lastWorkedAt: parseOptionalDate(json.last_worked_at),
    // Absent and `null` both mean "nothing was forced, derive the status from
    // the work records" -- the same distinction `rotation_days` makes.
    statusOverride: (json.status_override as BlockStatusOverride | null) ?? undefined,
  };
}

function parseTerritory(json: Record<string, unknown>): Territory {
  const blocks = (json.blocks as Record<string, unknown>[] | undefined) ?? [];
  const assignedUser = json.assigned_user as Record<string, unknown> | null | undefined;
  return {
    id: json.id as string,
    name: json.name as string,
    boundary: ((json.boundary as Record<string, unknown>[] | undefined) ?? []).map(parseLatLng),
    blocks: blocks.map(parseBlock),
    assignedUser: assignedUser ? parsePublisherBrief(assignedUser) : undefined,
    rotationDays: parseOptionalNumber(json.rotation_days),
  };
}

function parseWorkedTerritory(json: Record<string, unknown>): WorkedTerritory {
  return {
    id: json.id as string,
    name: json.name as string,
    lastWorkedAt: new Date(json.last_worked_at as string),
  };
}

function parseSession(json: Record<string, unknown>): Session {
  return {
    token: json.token as string,
    user: parsePublisherBrief(json.user as Record<string, unknown>),
    congregation: parseCongregation(json.congregation as Record<string, unknown>),
  };
}

export function createApiClient(options: CreateApiClientOptions = {}): ApiClient {
  const fetchImpl: FetchImpl =
    options.fetchImpl ?? (globalThis as unknown as { fetch: FetchImpl }).fetch;

  async function request(
    method: string,
    path: string,
    token: string | null,
    body?: unknown,
  ): Promise<unknown> {
    const headers: Record<string, string> = { [APP_KEY_HEADER]: Config.APP_KEY ?? '' };
    if (token !== null) {
      headers.Authorization = `Bearer ${token}`;
    }
    const init: FetchRequestInit =
      body === undefined
        ? { method, headers }
        : {
            method,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          };

    let response: FetchResponseLike;
    let text: string;
    try {
      response = await fetchImpl(`${Config.API_BASE_URL ?? ''}${path}`, init);
      text = await response.text();
    } catch {
      throw new NetworkException('Não foi possível falar com o servidor. Verifique a conexão.');
    }

    if (response.status >= 400) {
      throw errorFrom(response.status, text);
    }
    if (text === '') return undefined;

    try {
      return JSON.parse(text);
    } catch {
      throw new NetworkException('O servidor respondeu algo que não é JSON.');
    }
  }

  return {
    async activate(accessCode) {
      const json = await request('POST', '/app/activate', null, { access_code: accessCode });
      return parseSession(json as Record<string, unknown>);
    },

    async listTerritories(token) {
      const json = (await request('GET', '/app/territories', token)) as Record<
        string,
        unknown
      >[];
      return json.map(parseTerritory);
    },

    async listWorkedTerritories(token) {
      const json = (await request(
        'GET',
        '/app/worked-territories',
        token,
      )) as Record<string, unknown>[];
      return json.map(parseWorkedTerritory);
    },

    async markBlockWorked(token, blockId, logId, workedAt) {
      await request('POST', `/app/blocks/${blockId}/worked`, token, {
        log_id: logId,
        worked_at: workedAt.toISOString(),
      });
    },
  };
}
