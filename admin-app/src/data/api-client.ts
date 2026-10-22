// The one place the admin app talks to the server -- the `/auth/*` and
// `/admin/*` subset this app needs, ported from `admin/src/main/api-client.ts`
// on the desktop, whose paths and bodies these reproduce exactly.
//
// Two things are injected so no caller has to remember them: the `X-App-Key`
// header, sent on every request, and the bearer token, which `session.ts`
// (Task 06) sets after login and clears on sign-out. `fetch` itself is
// injected too, so every test drives a fake and none of them touches the
// network.
//
// The two failures a caller has to tell apart:
//
// - `ApiError` -- the server answered and said no. Carries the status, so
//   `isUnauthorized` can send the session off to renew a twelve-hour JWT.
// - `NetworkError` -- nothing came back at all. Deliberately *not* an
//   `ApiError`: no response is not a 401, and re-authenticating over a dead
//   connection would just fail twice and blame the admin's password.
//
// Wire format notes, both of which differ from what the domain models hold:
// the API writes coordinates as named `{"lat": …, "lng": …}` objects rather
// than GeoJSON pairs (see `parseRing`), and neither `BlockOut` nor
// `AssignmentOut` carries the id of the territory it belongs to -- that comes
// from the request that asked for it.

import Config from 'react-native-config';
import type {
  Assignment,
  AssignmentHistoryFilters,
  AssignmentHistoryPage,
  AssignmentWithTerritory,
  Block,
  BlockStatusOverride,
  Campaign,
  CampaignBrief,
  CampaignDesignation,
  Congregation,
  LatLng,
  LastWorkSummary,
  Publisher,
  PublisherBrief,
  Territory,
  WorkLog,
} from '../domain/models';

/** The server answered, and said no. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }
}

/** The request never reached a response worth reading. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export { ApiError as ApiErrorException, NetworkError as NetworkException };

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

/** The shape of React Native's global `fetch`, restated so tests can fake it. */
export type FetchImpl = (url: string, init: FetchRequestInit) => Promise<FetchResponseLike>;

const APP_KEY_HEADER = 'X-App-Key';

/** What `POST /auth/login` answers with. */
export interface AdminSession {
  readonly accessToken: string;
  readonly congregation: Congregation;
}

export interface AssignmentUpdatePayload {
  readonly publisherId?: string;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly clearCompletedAt?: boolean;
}

export interface ApiClient {
  login(credentials: { name: string; city: string; password: string }): Promise<AdminSession>;
  setToken(token: string | null): void;
  listTerritories(): Promise<Territory[]>;
  getTerritory(territoryId: string): Promise<Territory>;
  listTerritoriesWithBlocks(): Promise<Territory[]>;
  listPublishers(): Promise<Publisher[]>;
  listAssignments(territoryId: string): Promise<Assignment[]>;
  listAllAssignments(filters?: AssignmentHistoryFilters): Promise<AssignmentHistoryPage>;
  designate(territoryId: string, publisherId: string): Promise<Assignment>;
  updateAssignment(
    territoryId: string,
    assignmentId: string,
    payload: AssignmentUpdatePayload,
  ): Promise<Assignment>;
  completeAssignment(territoryId: string): Promise<Assignment>;
  deleteAssignment(territoryId: string, assignmentId: string): Promise<void>;
  listWorkLogs(blockId: string): Promise<WorkLog[]>;
  markWorked(blockId: string, publisherId: string, workedAt: Date): Promise<WorkLog>;
  deleteWorkLog(logId: string): Promise<void>;
  /** Read-only: managing campaigns stays on the desktop admin. */
  listCampaigns(): Promise<Campaign[]>;
  getCampaign(campaignId: string): Promise<Campaign>;
}

export interface CreateApiClientOptions {
  readonly baseUrl?: string;
  readonly appKey?: string;
  readonly fetchImpl?: FetchImpl;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A stable `code` for the error responses that do not carry one of their own. */
function codeForStatus(status: number): string {
  switch (status) {
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 429:
      return 'rate_limit_exceeded';
    default:
      return 'error';
  }
}

/**
 * Turns a `status >= 400` response into the `ApiError` the caller sees.
 *
 * Always an `ApiError`, never a `NetworkError`, however unreadable the body
 * is: the server did answer, and the status is the part that matters most
 * here. A 401 whose body is an HTML error page from a proxy still has to
 * arrive as `isUnauthorized`, or `session.run` would give up on a token that
 * only needed renewing.
 */
function errorFrom(status: number, text: string): ApiError {
  const generic = `O servidor respondeu ${status} sem explicar o motivo.`;

  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    return new ApiError(status, generic, codeForStatus(status));
  }

  // The contract every deliberate error of this API follows.
  if (isRecord(decoded) && typeof decoded.code === 'string' && typeof decoded.detail === 'string') {
    return new ApiError(status, decoded.detail, decoded.code);
  }

  // FastAPI's own 422, whose `detail` is a list of field errors rather than a
  // sentence -- it means this client sent a malformed body, a bug here and not
  // something the admin can act on.
  if (isRecord(decoded) && Array.isArray(decoded.detail)) {
    return new ApiError(status, 'O aplicativo enviou dados em formato inválido.', 'invalid_request');
  }

  // A bare `{"detail": "…"}`: FastAPI's own `HTTPException`, most commonly an
  // expired JWT.
  if (isRecord(decoded) && typeof decoded.detail === 'string') {
    return new ApiError(status, decoded.detail, codeForStatus(status));
  }

  return new ApiError(status, generic, codeForStatus(status));
}

function parseCongregation(json: Record<string, unknown>): Congregation {
  return {
    id: json.id as string,
    name: json.name as string,
    city: json.city as string,
  };
}

/**
 * Reads a ring the way the API writes one: a list of named `{"lat": …, "lng": …}`
 * objects (`RingOut` in `server/app/schemas/geo.py`), in both directions.
 *
 * Deliberately *not* `toLatLngList` from `domain/models`: that one reads a
 * GeoJSON ring, whose positions are bare `[lng, lat]` pairs in the opposite
 * order. The API never speaks GeoJSON -- it names the members precisely so a
 * client cannot swap them -- so running the GeoJSON reader over this payload
 * would silently produce `{lat: undefined, lng: undefined}`. `toLatLngList`
 * and `toGeoJsonRing` belong on the MapLibre side, which does want GeoJSON.
 */
function parseRing(json: unknown): LatLng[] {
  const points = (json as { lat: number; lng: number }[] | null | undefined) ?? [];
  return points.map(point => ({ lat: point.lat, lng: point.lng }));
}

/** The API spells "no value" as JSON `null`; the domain keeps it as `null`. */
function parseOptionalDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : new Date(value as string);
}

function parsePublisherBrief(json: Record<string, unknown>): PublisherBrief {
  return { id: json.id as string, name: json.name as string };
}

function parseLastWork(json: Record<string, unknown>): LastWorkSummary {
  return {
    publisher: parsePublisherBrief(json.user as Record<string, unknown>),
    workedAt: new Date(json.worked_at as string),
  };
}

/**
 * `BlockOut` carries no `territory_id` -- the block is always read through the
 * territory that owns it, so the id comes from that context rather than from
 * the wire.
 */
function parseBlock(json: Record<string, unknown>, territoryId: string): Block {
  return {
    id: json.id as string,
    territoryId,
    number: json.number as number,
    polygon: parseRing(json.polygon),
    lastWorkedAt: parseOptionalDate(json.last_worked_at),
    statusOverride: (json.status_override as BlockStatusOverride | null | undefined) ?? null,
  };
}

function parsePublisher(json: Record<string, unknown>): Publisher {
  return {
    id: json.id as string,
    name: json.name as string,
    accessCode: (json.access_code as string | null | undefined) ?? null,
    accessCodeExpiresAt: parseOptionalDate(json.access_code_expires_at),
    activatedAt: parseOptionalDate(json.activated_at),
    isActive: json.is_active as boolean,
  };
}

/**
 * One row of the S-13 card. Like `BlockOut`, `AssignmentOut` carries no
 * `territory_id` -- the card is always read through the territory in the URL,
 * so the id comes from the argument that asked for it.
 *
 * A `completed_at` of `null` is the whole point of the record: it marks the
 * assignment still in force, the one that lets that publisher mark blocks.
 */
function parseAssignment(json: Record<string, unknown>, territoryId: string): Assignment {
  const user = json.user as Record<string, unknown> | null | undefined;
  return {
    id: json.id as string,
    territoryId,
    publisher: user ? parsePublisherBrief(user) : null,
    campaign: parseOptionalCampaignBrief(json.campaign),
    startedAt: new Date(json.started_at as string),
    completedAt: parseOptionalDate(json.completed_at),
  };
}

/**
 * A campaign named inside another resource (`CampaignBriefOut`): on a card
 * line it replaces the `user`, and on a territory it says which active
 * campaign holds it. Absent and `null` both mean "no campaign".
 */
function parseOptionalCampaignBrief(value: unknown): CampaignBrief | null {
  if (!isRecord(value)) {
    return null;
  }
  return { id: value.id as string, name: value.name as string };
}

function parseCampaignDesignation(json: Record<string, unknown>): CampaignDesignation {
  const publishers = (json.publishers as Record<string, unknown>[] | undefined) ?? [];
  return {
    id: json.id as string,
    startedAt: new Date(json.started_at as string),
    completedAt: parseOptionalDate(json.completed_at),
    publishers: publishers.map(parsePublisherBrief),
  };
}

/** `CampaignOut`, with its periods kept in the server's newest-first order. */
function parseCampaign(json: Record<string, unknown>): Campaign {
  const territories = (json.territories as Record<string, unknown>[] | undefined) ?? [];
  const designations = (json.designations as Record<string, unknown>[] | undefined) ?? [];
  const current = json.current_designation as Record<string, unknown> | null | undefined;
  return {
    id: json.id as string,
    name: json.name as string,
    createdAt: new Date(json.created_at as string),
    territories: territories.map(territory => ({
      id: territory.id as string,
      name: territory.name as string,
    })),
    currentDesignation: current ? parseCampaignDesignation(current) : null,
    designations: designations.map(parseCampaignDesignation),
  };
}

/** Parses a congregation-wide history row, whose wire representation includes its territory. */
function parseAssignmentWithTerritory(json: Record<string, unknown>): AssignmentWithTerritory {
  const territory = json.territory as Record<string, unknown>;
  return {
    ...parseAssignment(json, territory.id as string),
    territory: { id: territory.id as string, name: territory.name as string },
  };
}

function assignmentHistoryPath(filters: AssignmentHistoryFilters = {}): string {
  const query = new URLSearchParams();
  if (filters.from !== undefined) query.set('from', filters.from.toISOString());
  if (filters.to !== undefined) query.set('to', filters.to.toISOString());
  if (filters.publisherId !== undefined) query.set('publisher_id', filters.publisherId);
  if (filters.territoryId !== undefined) query.set('territory_id', filters.territoryId);
  if (filters.page !== undefined) query.set('page', String(filters.page));
  if (filters.pageSize !== undefined) query.set('page_size', String(filters.pageSize));

  const encoded = query.toString();
  return encoded === '' ? '/admin/assignments' : `/admin/assignments?${encoded}`;
}

function parseAssignmentHistoryPage(
  json: Record<string, unknown> | Record<string, unknown>[],
  filters: AssignmentHistoryFilters = {},
): AssignmentHistoryPage {
  if (Array.isArray(json)) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const filtered = json
      .map(parseAssignmentWithTerritory)
      .filter(assignment => {
        if (filters.publisherId !== undefined && assignment.publisher?.id !== filters.publisherId) {
          return false;
        }
        if (filters.territoryId !== undefined && assignment.territory.id !== filters.territoryId) {
          return false;
        }
        if (filters.from !== undefined) {
          const completedAt = assignment.completedAt;
          if (completedAt !== null && completedAt < filters.from) return false;
        }
        if (filters.to !== undefined && assignment.startedAt >= filters.to) return false;
        return true;
      });
    const first = (page - 1) * pageSize;
    return {
      items: filtered.slice(first, first + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  const items = (json.items as Record<string, unknown>[] | undefined) ?? [];
  return {
    items: items.map(parseAssignmentWithTerritory),
    total: json.total as number,
    page: json.page as number,
    pageSize: json.page_size as number,
  };
}

/**
 * One recorded visit. `created_at` is on the wire but not in the domain model:
 * this app only ever shows when the block was worked, and the moment the
 * record reached the server matters to a late offline sync the admin app does
 * not have.
 */
function parseWorkLog(json: Record<string, unknown>): WorkLog {
  return {
    id: json.id as string,
    blockId: json.block_id as string,
    publisher: parsePublisherBrief(json.user as Record<string, unknown>),
    workedAt: new Date(json.worked_at as string),
  };
}

function parseTerritory(json: Record<string, unknown>): Territory {
  const id = json.id as string;
  const blocks = (json.blocks as Record<string, unknown>[] | undefined) ?? [];
  const assignedUser = json.assigned_user as Record<string, unknown> | null | undefined;
  const lastWork = json.last_work as Record<string, unknown> | null | undefined;
  return {
    id,
    name: json.name as string,
    boundary: parseRing(json.boundary),
    assignedPublisher: assignedUser ? parsePublisherBrief(assignedUser) : null,
    rotationDays: (json.rotation_days as number | null | undefined) ?? null,
    lastWork: lastWork ? parseLastWork(lastWork) : null,
    blocks: blocks.map(block => parseBlock(block, id)),
    campaign: parseOptionalCampaignBrief(json.campaign),
  };
}

export function createApiClient(options: CreateApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? Config.API_BASE_URL ?? '';
  const appKey = options.appKey ?? Config.APP_KEY ?? '';
  const fetchImpl: FetchImpl =
    options.fetchImpl ?? (globalThis as unknown as { fetch: FetchImpl }).fetch;

  let token: string | null = null;

  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { [APP_KEY_HEADER]: appKey };
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
      response = await fetchImpl(`${baseUrl}${path}`, init);
      text = await response.text();
    } catch {
      throw new NetworkError('Não foi possível falar com o servidor. Verifique a conexão.');
    }

    if (response.status >= 400) {
      throw errorFrom(response.status, text);
    }
    // A 204 -- the answer to both deletes -- has no body to read.
    if (text === '') return undefined;

    try {
      return JSON.parse(text);
    } catch {
      throw new NetworkError('O servidor respondeu algo que não é JSON.');
    }
  }

  async function list<T>(
    path: string,
    parse: (json: Record<string, unknown>) => T,
  ): Promise<T[]> {
    const json = (await request('GET', path)) as Record<string, unknown>[];
    return json.map(parse);
  }

  async function getTerritory(territoryId: string): Promise<Territory> {
    const json = await request('GET', `/admin/territories/${territoryId}`);
    return parseTerritory(json as Record<string, unknown>);
  }

  return {
    async login({ name, city, password }) {
      const json = (await request('POST', '/auth/login', {
        name,
        city,
        password,
      })) as Record<string, unknown>;
      return {
        accessToken: json.access_token as string,
        congregation: parseCongregation(json.congregation as Record<string, unknown>),
      };
    },

    setToken(value) {
      token = value;
    },
    listTerritories: () => list('/admin/territories', parseTerritory),

    getTerritory,

    /**
     * The listing endpoint answers without blocks, and every screen in this app
     * needs them, so the two calls are joined here rather than in each screen.
     * One request per territory is fine at this volume -- dozens of territories
     * per congregation -- and they go out in parallel.
     */
    async listTerritoriesWithBlocks() {
      const territories = await list('/admin/territories', parseTerritory);
      return Promise.all(territories.map(territory => getTerritory(territory.id)));
    },
    listPublishers: () => list('/admin/users', parsePublisher),

    listAssignments: territoryId =>
      list(`/admin/territories/${territoryId}/assignments`, json =>
        parseAssignment(json, territoryId),
      ),

    async listAllAssignments(filters) {
      const json = await request('GET', assignmentHistoryPath(filters));
      return parseAssignmentHistoryPage(
        json as Record<string, unknown> | Record<string, unknown>[],
        filters,
      );
    },

    async designate(territoryId, publisherId) {
      const json = await request('POST', `/admin/territories/${territoryId}/assignments`, {
        user_id: publisherId,
      });
      return parseAssignment(json as Record<string, unknown>, territoryId);
    },

    async updateAssignment(territoryId, assignmentId, payload) {
      const json = await request(
        'PATCH',
        `/admin/territories/${territoryId}/assignments/${assignmentId}`,
        {
          ...(payload.publisherId !== undefined && { user_id: payload.publisherId }),
          ...(payload.startedAt !== undefined && {
            started_at: payload.startedAt.toISOString(),
          }),
          ...(payload.completedAt !== undefined && {
            completed_at: payload.completedAt.toISOString(),
          }),
          ...(payload.clearCompletedAt !== undefined && {
            clear_completed_at: payload.clearCompletedAt,
          }),
        },
      );
      return parseAssignment(json as Record<string, unknown>, territoryId);
    },

    async completeAssignment(territoryId) {
      const json = await request(
        'POST',
        `/admin/territories/${territoryId}/assignments/complete`,
      );
      return parseAssignment(json as Record<string, unknown>, territoryId);
    },

    async deleteAssignment(territoryId, assignmentId) {
      await request(
        'DELETE',
        `/admin/territories/${territoryId}/assignments/${assignmentId}`,
      );
    },
    listWorkLogs: blockId => list(`/admin/blocks/${blockId}/work-logs`, parseWorkLog),

    /**
     * No `log_id` in the body, unlike the publisher app's own marking. That id
     * exists to let the server recognise a resend from a phone's offline
     * queue; this app has no queue -- the request either reaches the server or
     * visibly fails -- so the server mints the id, where nothing can collide.
     */
    async markWorked(blockId, publisherId, workedAt) {
      const json = await request('POST', `/admin/blocks/${blockId}/worked`, {
        user_id: publisherId,
        worked_at: workedAt.toISOString(),
      });
      return parseWorkLog(json as Record<string, unknown>);
    },

    /**
     * The record is addressed by its own id, not through the block -- the same
     * path the desktop admin uses. Deleting it makes the server recompute the
     * block's `last_worked_at` from whatever logs are left, so a caller showing
     * the block has to re-read it afterwards.
     */
    async deleteWorkLog(logId) {
      await request('DELETE', `/admin/work-logs/${logId}`);
    },

    listCampaigns: () => list('/admin/campaigns', parseCampaign),

    async getCampaign(campaignId) {
      const json = await request('GET', `/admin/campaigns/${campaignId}`);
      return parseCampaign(json as Record<string, unknown>);
    },
  };
}
