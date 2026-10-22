// The one place the main process talks to the server, ported from
// `packages/core/lib/api/api_client.dart` -- only the subset the admin uses
// (no `/app/activate`, no `/app/blocks/{id}/worked`, both future Android app
// concerns). Two things are injected so no caller has to remember them: the
// `X-App-Key` header, sent on every request, and the bearer token, which the
// session (Task 06) sets after login and clears on sign-out.
//
// The server is the only authority on the geometric rules -- `validateRing`
// here is a courtesy that keeps an impossible drawing from leaving the
// machine at all, not a second opinion on what PostGIS decides.

import { type LatLng, ringFromJson, ringToJson, validateRing } from '../shared/geo'
import { ApiErrorException, NetworkException } from '../shared/api-errors'
import type {
  AssignmentUpdateInput,
  CampaignCreateInput,
  CampaignUpdateInput
} from '../shared/ipc-contract'
import type {
  AdminSession,
  Assignment,
  AssignmentHistoryPage,
  AssignmentHistoryQuery,
  AssignmentWithTerritory,
  Block,
  BlockStatusOverride,
  Campaign,
  CampaignBrief,
  CampaignDesignation,
  Congregation,
  LastWorkSummary,
  Publisher,
  PublisherBrief,
  Territory,
  WorkLog
} from '../shared/models'

/** Not the DOM lib's `RequestInit` -- just the subset this module builds and sends. */
export interface FetchRequestInit {
  readonly method: string
  readonly headers: Readonly<Record<string, string>>
  readonly body?: string
}

/** Not the DOM lib's `Response` -- just the subset this module reads. */
export interface FetchResponseLike {
  readonly status: number
  text(): Promise<string>
}

/**
 * The shape of Node's global `fetch`, restated locally so this file compiles
 * under `tsconfig.node.json` (no DOM lib) without assuming a particular
 * ambient declaration is present, and so tests can inject a trivial fake
 * instead of a real `Response`.
 */
export type FetchImpl = (url: string, init: FetchRequestInit) => Promise<FetchResponseLike>

const APP_KEY_HEADER = 'X-App-Key'

export interface CreateApiClientOptions {
  readonly baseUrl: string
  readonly appKey: string
  /** Defaults to the Node global `fetch`. Tests inject a fake here instead. */
  readonly fetchImpl?: FetchImpl
}

export interface ApiClient {
  login(credentials: { name: string; city: string; password: string }): Promise<AdminSession>
  /** `null` sends no `Authorization` header from then on. */
  setToken(token: string | null): void

  listPublishers(): Promise<Publisher[]>
  createPublisher(name: string): Promise<Publisher>
  /** Mints a new code, which invalidates whatever the publisher had before. */
  regenerateAccessCode(publisherId: string): Promise<Publisher>
  /** Revokes or restores access. The work log is kept either way. */
  renamePublisher(publisherId: string, name: string): Promise<Publisher>
  setPublisherActive(publisherId: string, isActive: boolean): Promise<Publisher>
  deletePublisher(publisherId: string): Promise<void>

  listTerritories(): Promise<Territory[]>
  /** The detail endpoint, which is the one that carries the blocks. */
  getTerritory(territoryId: string): Promise<Territory>
  createTerritory(input: { name: string; boundary: LatLng[] }): Promise<Territory>
  /**
   * Only the keys actually present in `input` reach the wire. That matters
   * for `rotationDays`, where leaving it out and passing `null` are different
   * requests: the first does not touch the column, the second puts the
   * territory back on the default rotation.
   */
  updateTerritory(
    territoryId: string,
    input: { name?: string; boundary?: LatLng[]; rotationDays?: number | null }
  ): Promise<Territory>
  deleteTerritory(territoryId: string): Promise<void>

  /** The territory's whole assignment history, most recent first. */
  listAssignments(territoryId: string): Promise<Assignment[]>
  /** One filtered page of the congregation's assignment history, most recent first. */
  listAllAssignments(query?: AssignmentHistoryQuery): Promise<AssignmentHistoryPage>
  /** Opens a new assignment; the server closes whatever was open before. */
  designate(territoryId: string, userId: string): Promise<Assignment>
  /** Updates an existing assignment (active or past). */
  updateAssignment(
    territoryId: string,
    assignmentId: string,
    input: AssignmentUpdateInput
  ): Promise<Assignment>
  /** Closes the open assignment, freeing the territory for someone else. */
  completeAssignment(territoryId: string): Promise<Assignment>
  /** Erases one history line -- the admin correcting a wrong record. */
  deleteAssignment(territoryId: string, assignmentId: string): Promise<void>

  /** Every campaign of the congregation, active or not, ordered by name. */
  listCampaigns(): Promise<Campaign[]>
  createCampaign(input: CampaignCreateInput): Promise<Campaign>
  /** Only the keys present in `input` reach the wire; the server refuses an empty body. */
  updateCampaign(campaignId: string, input: CampaignUpdateInput): Promise<Campaign>
  /** 409 `campaign_active` while the campaign is out. */
  deleteCampaign(campaignId: string): Promise<void>
  /** Opens a period for these publishers, replacing every territory's dirigente. */
  designateCampaign(campaignId: string, userIds: string[]): Promise<Campaign>
  /** Replaces the publishers of the open period. */
  setCampaignPublishers(campaignId: string, userIds: string[]): Promise<Campaign>
  /** Closes the open period and every S-13 line it holds. */
  completeCampaign(campaignId: string): Promise<Campaign>

  /** `number` left out asks the server for the lowest free integer. */
  createBlock(input: { territoryId: string; polygon: LatLng[]; number?: number }): Promise<Block>
  /**
   * Same key-presence contract `updateTerritory` uses: `statusOverride` left
   * out does not touch the forced status, while `null` puts the block back on
   * the automatic colour.
   */
  updateBlock(
    blockId: string,
    input: {
      number?: number
      polygon?: LatLng[]
      statusOverride?: BlockStatusOverride | null
    }
  ): Promise<Block>
  deleteBlock(blockId: string): Promise<void>

  listWorkLogs(blockId: string): Promise<WorkLog[]>
  /**
   * Registers work on a block on behalf of a publisher. Unlike the Android
   * app's own marking, this one is not bound to the territory's assignment --
   * the admin records what happened, whoever it happened with.
   */
  markBlockWorked(blockId: string, input: { userId: string; workedAt: Date }): Promise<WorkLog>
  /** Removing a log recomputes the block's `last_worked_at` on the server. */
  deleteWorkLog(logId: string): Promise<void>
}

/** A stable `code` for the error responses that do not carry one of their own. */
function codeForStatus(status: number): string {
  switch (status) {
    case 401:
      return 'unauthorized'
    case 403:
      return 'forbidden'
    case 404:
      return 'not_found'
    case 409:
      return 'conflict'
    case 429:
      return 'rate_limit_exceeded'
    default:
      return 'error'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Turns a `status >= 400` response body into the exception the caller sees. */
function errorFrom(status: number, text: string): ApiErrorException | NetworkException {
  let decoded: unknown
  try {
    decoded = JSON.parse(text)
  } catch {
    return new NetworkException(`O servidor respondeu ${status} sem explicar o motivo.`)
  }

  if (isRecord(decoded) && typeof decoded.code === 'string' && typeof decoded.detail === 'string') {
    return new ApiErrorException(status, decoded.code, decoded.detail)
  }

  // FastAPI's own 422, whose `detail` is a list of field errors rather than a
  // sentence -- it means the client sent a malformed body, a bug here and not
  // something the admin can act on.
  if (isRecord(decoded) && Array.isArray(decoded.detail)) {
    return new ApiErrorException(
      status,
      'invalid_request',
      'O aplicativo enviou dados em formato inválido.'
    )
  }

  // A bare `{"detail": "…"}`: FastAPI's own `HTTPException`, most commonly an
  // expired JWT. It has to arrive as a recognisable status so the caller can
  // react (Task 06 sends the admin back to the login screen on 401).
  if (isRecord(decoded) && typeof decoded.detail === 'string') {
    return new ApiErrorException(status, codeForStatus(status), decoded.detail)
  }

  return new NetworkException(`O servidor respondeu ${status} sem explicar o motivo.`)
}

function parseCongregation(json: Record<string, unknown>): Congregation {
  return { id: json.id as string, name: json.name as string, city: json.city as string }
}

function parseAdminSession(json: Record<string, unknown>): AdminSession {
  return {
    accessToken: json.access_token as string,
    congregation: parseCongregation(json.congregation as Record<string, unknown>)
  }
}

function parseOptionalDate(value: unknown): Date | undefined {
  return value === null || value === undefined ? undefined : new Date(value as string)
}

function parsePublisher(json: Record<string, unknown>): Publisher {
  return {
    id: json.id as string,
    name: json.name as string,
    isActive: json.is_active as boolean,
    accessCode: (json.access_code as string | null) ?? undefined,
    accessCodeExpiresAt: parseOptionalDate(json.access_code_expires_at),
    activatedAt: parseOptionalDate(json.activated_at)
  }
}

function parsePublisherBrief(json: Record<string, unknown>): PublisherBrief {
  return { id: json.id as string, name: json.name as string }
}

function parseCampaignBrief(json: Record<string, unknown>): CampaignBrief {
  return { id: json.id as string, name: json.name as string }
}

/** `null`, absent or an object: only the object names a campaign. */
function parseOptionalCampaignBrief(value: unknown): CampaignBrief | undefined {
  return isRecord(value) ? parseCampaignBrief(value) : undefined
}

function parseLastWork(json: Record<string, unknown>): LastWorkSummary {
  return {
    publisher: parsePublisherBrief(json.user as Record<string, unknown>),
    workedAt: new Date(json.worked_at as string)
  }
}

function parseBlock(json: Record<string, unknown>): Block {
  return {
    id: json.id as string,
    number: json.number as number,
    polygon: ringFromJson(json.polygon as { lat: number; lng: number }[]),
    lastWorkedAt: parseOptionalDate(json.last_worked_at),
    // Absent and explicitly `null` are the same answer -- nothing was forced,
    // so the colour comes from the work records -- and both collapse to
    // `undefined`, the treatment `last_worked_at` already gets.
    statusOverride: (json.status_override as BlockStatusOverride | null | undefined) ?? undefined
  }
}

function parseTerritory(json: Record<string, unknown>): Territory {
  const blocks = (json.blocks as Record<string, unknown>[] | undefined) ?? []
  const assignedUserJson = json.assigned_user as Record<string, unknown> | null | undefined
  const lastWorkJson = json.last_work as Record<string, unknown> | null | undefined
  return {
    id: json.id as string,
    name: json.name as string,
    boundary: ringFromJson(json.boundary as { lat: number; lng: number }[]),
    blocks: blocks.map(parseBlock),
    assignedUser: assignedUserJson ? parsePublisherBrief(assignedUserJson) : undefined,
    campaign: parseOptionalCampaignBrief(json.campaign),
    // Absent and explicitly `null` mean the same thing -- the territory uses
    // the clients' default rotation -- so both collapse to `undefined`, the
    // same treatment `parseBlock` gives `last_worked_at`.
    rotationDays: (json.rotation_days as number | null | undefined) ?? undefined,
    lastWork: lastWorkJson ? parseLastWork(lastWorkJson) : undefined,
    assignedSince: parseOptionalDate(json.assigned_since)
  }
}

/**
 * One row of the S-13 card. `completed_at` arriving as `null` is the whole
 * point of the record -- it marks the assignment that is still open -- so it
 * becomes `undefined` here rather than an invalid `Date`, matching how
 * `parseBlock` treats `last_worked_at`. A campaign's line arrives with
 * `user: null` and a `campaign` instead; either side left null becomes
 * `undefined`.
 */
function parseAssignment(json: Record<string, unknown>): Assignment {
  return {
    id: json.id as string,
    publisher: isRecord(json.user) ? parsePublisherBrief(json.user) : undefined,
    campaign: parseOptionalCampaignBrief(json.campaign),
    startedAt: new Date(json.started_at as string),
    completedAt: parseOptionalDate(json.completed_at)
  }
}

/**
 * The same row, plus the territory it belongs to. The general listing has no
 * territory in the URL to fall back on, so each record has to name its own --
 * everything else, dates included, is whatever `parseAssignment` already does.
 */
function parseAssignmentWithTerritory(json: Record<string, unknown>): AssignmentWithTerritory {
  const territory = json.territory as Record<string, unknown>
  return {
    ...parseAssignment(json),
    territory: { id: territory.id as string, name: territory.name as string }
  }
}

function parseAssignmentHistoryPage(
  json: unknown,
  query: AssignmentHistoryQuery = {}
): AssignmentHistoryPage {
  if (Array.isArray(json)) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 50
    const filtered = json
      .map((entry) => parseAssignmentWithTerritory(entry as Record<string, unknown>))
      .filter((assignment) => {
        if (query.publisherId !== undefined && assignment.publisher?.id !== query.publisherId) {
          return false
        }
        if (query.territoryId !== undefined && assignment.territory.id !== query.territoryId) {
          return false
        }
        if (query.fromInstant !== undefined) {
          const completedAt = assignment.completedAt
          if (completedAt !== undefined && completedAt < query.fromInstant) return false
        }
        if (query.toInstant !== undefined && assignment.startedAt >= query.toInstant) return false
        return true
      })
    const first = (page - 1) * pageSize
    return {
      items: filtered.slice(first, first + pageSize),
      total: filtered.length,
      page,
      pageSize
    }
  }

  const page = json as Record<string, unknown>
  return {
    items: (page.items as Record<string, unknown>[]).map(parseAssignmentWithTerritory),
    total: page.total as number,
    page: page.page as number,
    pageSize: page.page_size as number
  }
}

function assignmentHistoryPath(query: AssignmentHistoryQuery): string {
  const parameters = new URLSearchParams()
  if (query.fromInstant !== undefined) parameters.set('from', query.fromInstant.toISOString())
  if (query.toInstant !== undefined) parameters.set('to', query.toInstant.toISOString())
  if (query.publisherId !== undefined) parameters.set('publisher_id', query.publisherId)
  if (query.territoryId !== undefined) parameters.set('territory_id', query.territoryId)
  if (query.page !== undefined) parameters.set('page', String(query.page))
  if (query.pageSize !== undefined) parameters.set('page_size', String(query.pageSize))

  const encodedParameters = parameters.toString()
  return encodedParameters === '' ? '/admin/assignments' : `/admin/assignments?${encodedParameters}`
}

function parseCampaignDesignation(json: Record<string, unknown>): CampaignDesignation {
  return {
    id: json.id as string,
    startedAt: new Date(json.started_at as string),
    completedAt: parseOptionalDate(json.completed_at),
    publishers: (json.publishers as Record<string, unknown>[]).map(parsePublisherBrief)
  }
}

function parseCampaign(json: Record<string, unknown>): Campaign {
  const current = json.current_designation
  return {
    id: json.id as string,
    name: json.name as string,
    createdAt: new Date(json.created_at as string),
    territories: (json.territories as Record<string, unknown>[]).map((territory) => ({
      id: territory.id as string,
      name: territory.name as string
    })),
    currentDesignation: isRecord(current) ? parseCampaignDesignation(current) : undefined,
    designations: (json.designations as Record<string, unknown>[]).map(parseCampaignDesignation)
  }
}

function parseWorkLog(json: Record<string, unknown>): WorkLog {
  return {
    id: json.id as string,
    blockId: json.block_id as string,
    publisher: parsePublisherBrief(json.user as Record<string, unknown>),
    workedAt: new Date(json.worked_at as string),
    createdAt: new Date(json.created_at as string)
  }
}

export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const { baseUrl, appKey } = options
  const fetchImpl: FetchImpl =
    options.fetchImpl ?? (globalThis as unknown as { fetch: FetchImpl }).fetch

  let token: string | null = null

  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { [APP_KEY_HEADER]: appKey }
    if (token !== null) {
      headers['Authorization'] = `Bearer ${token}`
    }
    const init: FetchRequestInit =
      body === undefined
        ? { method, headers }
        : {
            method,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          }

    let response: FetchResponseLike
    let text: string
    try {
      response = await fetchImpl(`${baseUrl}${path}`, init)
      text = await response.text()
    } catch {
      throw new NetworkException('Não foi possível falar com o servidor. Verifique a conexão.')
    }

    if (response.status >= 400) {
      throw errorFrom(response.status, text)
    }
    if (text === '') return undefined

    try {
      return JSON.parse(text)
    } catch {
      throw new NetworkException('O servidor respondeu algo que não é JSON.')
    }
  }

  async function list<T>(path: string, parse: (json: Record<string, unknown>) => T): Promise<T[]> {
    const json = (await request('GET', path)) as Record<string, unknown>[]
    return json.map(parse)
  }

  return {
    async login({ name, city, password }) {
      const json = await request('POST', '/auth/login', { name, city, password })
      return parseAdminSession(json as Record<string, unknown>)
    },

    setToken(value) {
      token = value
    },

    listPublishers: () => list('/admin/users', parsePublisher),

    async createPublisher(name) {
      const json = await request('POST', '/admin/users', { name })
      return parsePublisher(json as Record<string, unknown>)
    },

    async regenerateAccessCode(publisherId) {
      const json = await request('POST', `/admin/users/${publisherId}/access-code`)
      return parsePublisher(json as Record<string, unknown>)
    },

    async deletePublisher(publisherId) {
      await request('DELETE', `/admin/users/${publisherId}`)
    },

    async renamePublisher(publisherId, name) {
      const json = await request('PATCH', `/admin/users/${publisherId}`, { name })
      return parsePublisher(json as Record<string, unknown>)
    },

    async setPublisherActive(publisherId, isActive) {
      const json = await request('PATCH', `/admin/users/${publisherId}`, { is_active: isActive })
      return parsePublisher(json as Record<string, unknown>)
    },

    listTerritories: () => list('/admin/territories', parseTerritory),

    async getTerritory(territoryId) {
      const json = await request('GET', `/admin/territories/${territoryId}`)
      return parseTerritory(json as Record<string, unknown>)
    },

    async createTerritory({ name, boundary }) {
      validateRing(boundary)
      const json = await request('POST', '/admin/territories', {
        name,
        boundary: ringToJson(boundary)
      })
      return parseTerritory(json as Record<string, unknown>)
    },

    async updateTerritory(territoryId, input) {
      const { name, boundary } = input
      if (boundary !== undefined) validateRing(boundary)
      const json = await request('PATCH', `/admin/territories/${territoryId}`, {
        ...(name !== undefined && { name }),
        ...(boundary !== undefined && { boundary: ringToJson(boundary) }),
        // Keyed on the property being there at all, not on its value: the
        // server tells "not sent" from "sent as null" by which keys arrived,
        // and `null` is how the admin clears a custom rotation.
        ...('rotationDays' in input && { rotation_days: input.rotationDays ?? null })
      })
      return parseTerritory(json as Record<string, unknown>)
    },

    async deleteTerritory(territoryId) {
      await request('DELETE', `/admin/territories/${territoryId}`)
    },

    listAssignments: (territoryId) =>
      list(`/admin/territories/${territoryId}/assignments`, parseAssignment),

    async listAllAssignments(query = {}) {
      const json = await request('GET', assignmentHistoryPath(query))
      return parseAssignmentHistoryPage(json, query)
    },

    async designate(territoryId, userId) {
      const json = await request('POST', `/admin/territories/${territoryId}/assignments`, {
        user_id: userId
      })
      return parseAssignment(json as Record<string, unknown>)
    },

    async updateAssignment(territoryId, assignmentId, input) {
      const json = await request(
        'PATCH',
        `/admin/territories/${territoryId}/assignments/${assignmentId}`,
        {
          ...(input.publisherId !== undefined && { user_id: input.publisherId }),
          ...(input.startedAt !== undefined && { started_at: input.startedAt.toISOString() }),
          ...(input.completedAt !== undefined && {
            completed_at: input.completedAt.toISOString()
          }),
          ...(input.clearCompletedAt !== undefined && {
            clear_completed_at: input.clearCompletedAt
          })
        }
      )
      return parseAssignment(json as Record<string, unknown>)
    },

    async completeAssignment(territoryId) {
      const json = await request('POST', `/admin/territories/${territoryId}/assignments/complete`)
      return parseAssignment(json as Record<string, unknown>)
    },

    async deleteAssignment(territoryId, assignmentId) {
      await request('DELETE', `/admin/territories/${territoryId}/assignments/${assignmentId}`)
    },

    listCampaigns: () => list('/admin/campaigns', parseCampaign),

    async createCampaign({ name, territoryIds }) {
      const json = await request('POST', '/admin/campaigns', {
        name,
        territory_ids: territoryIds
      })
      return parseCampaign(json as Record<string, unknown>)
    },

    async updateCampaign(campaignId, { name, territoryIds }) {
      const json = await request('PATCH', `/admin/campaigns/${campaignId}`, {
        ...(name !== undefined && { name }),
        ...(territoryIds !== undefined && { territory_ids: territoryIds })
      })
      return parseCampaign(json as Record<string, unknown>)
    },

    async deleteCampaign(campaignId) {
      await request('DELETE', `/admin/campaigns/${campaignId}`)
    },

    async designateCampaign(campaignId, userIds) {
      const json = await request('POST', `/admin/campaigns/${campaignId}/designations`, {
        user_ids: userIds
      })
      return parseCampaign(json as Record<string, unknown>)
    },

    async setCampaignPublishers(campaignId, userIds) {
      const json = await request(
        'PUT',
        `/admin/campaigns/${campaignId}/designations/current/publishers`,
        { user_ids: userIds }
      )
      return parseCampaign(json as Record<string, unknown>)
    },

    async completeCampaign(campaignId) {
      const json = await request(
        'POST',
        `/admin/campaigns/${campaignId}/designations/current/complete`
      )
      return parseCampaign(json as Record<string, unknown>)
    },

    async createBlock({ territoryId, polygon, number }) {
      validateRing(polygon)
      const json = await request('POST', `/admin/territories/${territoryId}/blocks`, {
        ...(number !== undefined && { number }),
        polygon: ringToJson(polygon)
      })
      return parseBlock(json as Record<string, unknown>)
    },

    async updateBlock(blockId, input) {
      const { number, polygon } = input
      if (polygon !== undefined) validateRing(polygon)
      const json = await request('PATCH', `/admin/blocks/${blockId}`, {
        ...(number !== undefined && { number }),
        ...(polygon !== undefined && { polygon: ringToJson(polygon) }),
        // Keyed on the property being there at all, not on its value: the
        // server tells "not sent" from "sent as null" by which keys arrived,
        // and `null` is how the admin gives the block back to the automatic
        // colour. The `?? null` keeps an explicit `undefined` from being
        // dropped by `JSON.stringify` and read as "not sent".
        ...('statusOverride' in input && { status_override: input.statusOverride ?? null })
      })
      return parseBlock(json as Record<string, unknown>)
    },

    async deleteBlock(blockId) {
      await request('DELETE', `/admin/blocks/${blockId}`)
    },

    listWorkLogs: (blockId) => list(`/admin/blocks/${blockId}/work-logs`, parseWorkLog),

    async markBlockWorked(blockId, { userId, workedAt }) {
      const json = await request('POST', `/admin/blocks/${blockId}/worked`, {
        user_id: userId,
        worked_at: workedAt.toISOString()
      })
      return parseWorkLog(json as Record<string, unknown>)
    },

    async deleteWorkLog(logId) {
      await request('DELETE', `/admin/work-logs/${logId}`)
    }
  }
}
