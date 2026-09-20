// The single source of truth for the IPC boundary between the main process
// (which owns the session, the credentials and every call to the server) and
// the renderer (which only ever sees `window.api`, never `ipcRenderer`
// directly). Three things are defined here so they cannot drift apart:
//   - `IPC_CHANNELS`, the channel name for every operation — a typo here is a
//     compile error instead of a handler that silently never fires.
//   - `IpcApi`, the exact shape `window.api` exposes. `main/ipc-handlers.ts`
//     registers one `ipcMain.handle` per entry, and `preload/index.ts`
//     implements this interface by forwarding each call to `ipcRenderer
//     .invoke`. Both files are checked against this one type, so the two
//     sides of the bridge cannot go out of sync silently.
//   - `SerializedIpcError`, the plain shape every thrown error takes before
//     crossing the bridge (see the comment on it below for why).
//
// Grouped by namespace (`session`, `territories`, ...) because that is how
// the renderer calls it — `window.api.territories.create(...)`, not a flat
// method bag.

import type {
  Assignment,
  AssignmentHistoryPage,
  AssignmentHistoryQuery,
  Block,
  BlockStatusOverride,
  Congregation,
  Publisher,
  Territory,
  WorkLog
} from './models'
import type { LatLng } from './geo'

/**
 * Identical in shape to `main/credentials-store.ts`'s `Credentials`, but
 * redeclared here rather than imported from it: `shared/` is depended on by
 * `main/` and `preload/`, never the other way around, so it cannot import
 * from `main/`.
 */
export interface SessionCredentials {
  readonly name: string
  readonly city: string
  readonly password: string
}

export interface TerritoryCreateInput {
  readonly name: string
  readonly boundary: LatLng[]
}

export interface TerritoryUpdateInput {
  readonly name?: string
  readonly boundary?: LatLng[]
  /**
   * Left out entirely leaves the rotation as it is; `null` puts the territory
   * back on the clients' default rotation. The two are deliberately different
   * requests, all the way down to the body the main process sends.
   */
  readonly rotationDays?: number | null
}

export interface BlockCreateInput {
  readonly territoryId: string
  readonly polygon: LatLng[]
  /** Left out asks the server for the lowest free integer. */
  readonly number?: number
}

export interface BlockUpdateInput {
  readonly number?: number
  readonly polygon?: LatLng[]
  /**
   * Left out entirely leaves the forced status as it is; `null` gives the
   * block back to the automatic colour, derived from the work records. The
   * two are deliberately different requests, same contract `rotationDays`
   * follows on the territory.
   */
  readonly statusOverride?: BlockStatusOverride | null
}

/**
 * What every error becomes before it crosses the IPC boundary.
 *
 * Electron's `ipcMain.handle`/`ipcRenderer.invoke` bridge does not preserve
 * `Error` subclasses — only `message` reliably survives the trip. Without
 * this shape, the renderer would see every failure (`ApiErrorException`,
 * `NetworkException`, `CredentialsRejectedException`) as the same generic
 * `Error`, with no way to tell a validation conflict from a dropped
 * connection from an expired password. `main/ipc-handlers.ts` serializes into
 * this shape and JSON-encodes it into the error it throws, so the fields
 * survive the trip as text and can be recovered on the other side.
 */
export interface SerializedIpcError {
  readonly name: string
  readonly message: string
  readonly code?: string
  readonly statusCode?: number
}

/** One constant per IPC channel. Values are the wire names; never construct
 * a channel string by hand elsewhere. */
export const IPC_CHANNELS = {
  sessionIsConfigured: 'session:isConfigured',
  sessionConfigure: 'session:configure',
  sessionSignOut: 'session:signOut',
  sessionGetCongregation: 'session:getCongregation',
  territoriesListWithBlocks: 'territories:listWithBlocks',
  territoriesCreate: 'territories:create',
  territoriesUpdate: 'territories:update',
  territoriesDelete: 'territories:delete',
  blocksCreate: 'blocks:create',
  blocksUpdate: 'blocks:update',
  blocksDelete: 'blocks:delete',
  publishersList: 'publishers:list',
  publishersCreate: 'publishers:create',
  publishersRegenerateCode: 'publishers:regenerateCode',
  publishersRename: 'publishers:rename',
  publishersSetActive: 'publishers:setActive',
  publishersDelete: 'publishers:delete',
  assignmentsListFor: 'assignments:listFor',
  assignmentsListAll: 'assignments:listAll',
  assignmentsDesignate: 'assignments:designate',
  assignmentsComplete: 'assignments:complete',
  assignmentsDelete: 'assignments:delete',
  exportAssignments: 'export:assignments',
  exportS13T: 'export:s13t',
  exportS13TDocx: 'export:s13tDocx',
  importS13TSelectAndPreview: 'import:s13tSelectAndPreview',
  importS13TExecute: 'import:s13tExecute',
  workLogsListFor: 'workLogs:listFor',
  workLogsDelete: 'workLogs:delete',
  workLogsMarkWorked: 'workLogs:markWorked',
  geoGeocodeCity: 'geo:geocodeCity'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

export interface S13TOptions {
  /** Target service year (e.g. 2026). If omitted, defaults to the current service year. */
  readonly serviceYear?: number
  /** Format to export: 'docx' (default Word template) or 'xlsx' */
  readonly format?: 'docx' | 'xlsx'
}

export interface S13TParsedAssignment {
  readonly publisherName: string
  readonly startedAt?: string | null
  readonly completedAt?: string | null
}

export interface S13TParsedTerritoryItem {
  readonly territoryNumberOrName: string
  readonly matchedTerritoryId?: string | null
  readonly lastCompletedDate?: string | null
  readonly assignments: readonly S13TParsedAssignment[]
}

export interface S13TImportPreview {
  readonly fileName: string
  readonly serviceYear?: number | null
  readonly congregationName?: string | null
  readonly territories: readonly S13TParsedTerritoryItem[]
  readonly totalTerritoriesFound: number
  readonly matchedTerritoriesCount: number
  readonly totalAssignmentsCount: number
}

export interface S13TImportResult {
  readonly importedAssignmentsCount: number
  readonly importedPublishersCount: number
  readonly errors: readonly string[]
}

/**
 * The full shape of `window.api`. `main/ipc-handlers.ts` must register a
 * handler for every entry, and `preload/index.ts` must implement every entry
 * by forwarding to `ipcRenderer.invoke` — both are type-checked against this
 * interface, so an operation added here and forgotten on either side fails to
 * compile rather than failing silently at runtime.
 */
export interface IpcApi {
  readonly session: {
    isConfigured(): Promise<boolean>
    configure(credentials: SessionCredentials): Promise<Congregation>
    signOut(): Promise<void>
    /**
     * The congregation of the session already configured on this computer --
     * `null` if nothing has authenticated yet. `session:configure` only
     * returns the congregation the one time it is called (the first login);
     * this is how the app recovers it on every later launch, when the
     * session signs itself in silently from stored credentials instead
     * (`App.tsx`, Task 13).
     */
    getCongregation(): Promise<Congregation | null>
  }
  readonly territories: {
    /** Lists territories and fetches each one's detail (with blocks) — the
     * same fan-out the old `ApiTerritoryRepository.listWithBlocks` did. */
    listWithBlocks(): Promise<Territory[]>
    create(input: TerritoryCreateInput): Promise<Territory>
    update(territoryId: string, input: TerritoryUpdateInput): Promise<Territory>
    delete(territoryId: string): Promise<void>
  }
  readonly blocks: {
    create(input: BlockCreateInput): Promise<Block>
    update(blockId: string, input: BlockUpdateInput): Promise<Block>
    delete(blockId: string): Promise<void>
  }
  readonly publishers: {
    list(): Promise<Publisher[]>
    create(name: string): Promise<Publisher>
    /** Mints a new code, invalidating whatever the publisher had before. */
    regenerateCode(publisherId: string): Promise<Publisher>
    /**
     * Corrects the publisher's name from here on.
     *
     * Only this record changes. The work logs and assignments already written
     * keep the name copied into them at the time, which is what makes the
     * history readable after someone is renamed or removed.
     */
    rename(publisherId: string, name: string): Promise<Publisher>
    /** Sends the desired state; the caller decides, the API never flips it. */
    setActive(publisherId: string, isActive: boolean): Promise<Publisher>
    /**
     * Removes the publisher for good. The work logs and the assignments they
     * produced stay, each keeping the name it recorded -- so the history is
     * still readable afterwards. Refused with a 409 while the publisher still
     * holds an open assignment.
     */
    delete(publisherId: string): Promise<void>
  }
  readonly assignments: {
    /** The territory's whole history, open assignment included. */
    listFor(territoryId: string): Promise<Assignment[]>
    /** One filtered page of the congregation's assignment history, most recent first. */
    listAll(query?: AssignmentHistoryQuery): Promise<AssignmentHistoryPage>
    /** Opens a new assignment; the server closes whatever was open before. */
    designate(territoryId: string, publisherId: string): Promise<Assignment>
    /** Closes the open assignment, freeing the territory for someone else. */
    complete(territoryId: string): Promise<Assignment>
    /** Erases one history line — the admin correcting a wrong record. */
    delete(territoryId: string, assignmentId: string): Promise<void>
  }
  readonly exports: {
    /**
     * Writes the assignments spreadsheet and resolves with the path it was
     * saved to, or `null` when the admin dismissed the save dialog.
     */
    assignments(): Promise<string | null>
    /**
     * Writes the official S-13-T congregation assignment record sheet and
     * resolves with the path it was saved to, or `null` when dismissed.
     */
    s13t(options?: S13TOptions): Promise<string | null>
    s13tDocx(options?: S13TOptions): Promise<string | null>
  }
  readonly imports: {
    s13tSelectAndPreview(): Promise<S13TImportPreview | null>
    s13tExecute(preview: S13TImportPreview): Promise<S13TImportResult>
  }
  readonly workLogs: {
    listFor(blockId: string): Promise<WorkLog[]>
    /** Removing a log recomputes the block's `lastWorkedAt` on the server. */
    delete(logId: string): Promise<void>
    /**
     * Records that a publisher worked the block on a given date. The admin
     * names whoever did the work -- unlike the Android app, this is not
     * limited to the territory's current assignment.
     */
    markWorked(blockId: string, publisherId: string, workedAt: Date): Promise<WorkLog>
  }
  readonly geo: {
    /**
     * A rough centre point for a city name (via OSM's Nominatim), or `null`
     * when nothing matched or the lookup failed -- used only to give the map
     * a sensible starting point when there is no territory yet to anchor on.
     * Never routes through `session` -- it is not a call to this app's own
     * server, so there is no token to attach and no 401 to retry.
     */
    geocodeCity(city: string): Promise<LatLng | null>
  }
}
