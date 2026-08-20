// Wires every IPC channel in `shared/ipc-contract.ts` to the session (Task
// 06) and the API client (Task 04). No business rule lives here — each
// handler is a one-line call into `session.run(...)` with the matching
// `api-client` operation. The only thing genuinely done in this file, beyond
// fan-out and delegation, is error serialization (see `serializeError`
// below), because that is an IPC-boundary concern, not a domain one.

import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  IPC_CHANNELS,
  type BlockCreateInput,
  type BlockUpdateInput,
  type SessionCredentials,
  type TerritoryCreateInput,
  type TerritoryUpdateInput,
  type SerializedIpcError
} from '../shared/ipc-contract'
import type { Territory } from '../shared/models'
import { ApiErrorException } from '../shared/api-errors'
import type { ApiClient } from './api-client'
import type { Session } from './session'
import type { Geocoder } from './geocode'
import { buildAssignmentsWorkbook } from './excel-export'

/**
 * The slice of Electron's `dialog` this file uses. Narrowing it to one method
 * is what lets the tests hand in a stub and never open a real window --
 * `session`, `api` and `geocoder` are injected for the same reason.
 */
export interface SaveDialog {
  showSaveDialog(options: {
    title?: string
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[]
  }): Promise<{ canceled: boolean; filePath?: string }>
}

export interface RegisterIpcHandlersOptions {
  readonly session: Session
  readonly api: ApiClient
  readonly geocoder: Geocoder
  readonly dialog: SaveDialog
}

/** `designacoes-2026-08-18.xlsx` — the name the save dialog opens with. */
function suggestedFileName(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `designacoes-${year}-${month}-${day}.xlsx`
}

/**
 * Reduces any thrown value to the plain shape `shared/ipc-contract.ts`
 * documents. `ApiErrorException` carries `code`/`statusCode` that the
 * renderer needs to tell a validation conflict from an expired token; every
 * other `Error` (including `NetworkException` and
 * `CredentialsRejectedException`) keeps its `name`/`message`, which is all
 * the renderer needs to distinguish those from an `ApiErrorException`.
 */
function serializeError(error: unknown): SerializedIpcError {
  if (error instanceof ApiErrorException) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode
    }
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }
  return { name: 'Error', message: String(error) }
}

/**
 * Registers one `ipcMain.handle` for `channel`, running `fn` with whatever
 * arguments the renderer sent (via the preload's `ipcRenderer.invoke`).
 *
 * `ipcMain.handle` only relays a thrown `Error`'s `message` across the
 * bridge, dropping the subclass and any extra fields. JSON-encoding the full
 * `SerializedIpcError` into that `message` is what lets the far side recover
 * `name`/`code`/`statusCode` instead of seeing every failure as an
 * indistinguishable generic `Error`.
 */
function handle<Args extends unknown[], Result>(
  channel: string,
  fn: (...args: Args) => Promise<Result>
): void {
  ipcMain.handle(channel, async (_event: IpcMainInvokeEvent, ...args: Args): Promise<Result> => {
    try {
      return await fn(...args)
    } catch (error) {
      throw new Error(JSON.stringify(serializeError(error)))
    }
  })
}

export function registerIpcHandlers({
  session,
  api,
  geocoder,
  dialog
}: RegisterIpcHandlersOptions): void {
  // The list endpoint does not carry blocks, so the detail of each territory
  // has to be fetched separately. Shared by the `territoriesListWithBlocks`
  // handler and the spreadsheet export below.
  async function listTerritoriesWithBlocks(): Promise<Territory[]> {
    const territories = await api.listTerritories()
    return Promise.all(territories.map((territory) => api.getTerritory(territory.id)))
  }

  handle(IPC_CHANNELS.sessionIsConfigured, () => session.isConfigured())
  handle(IPC_CHANNELS.sessionConfigure, (credentials: SessionCredentials) =>
    session.configure(credentials)
  )
  handle(IPC_CHANNELS.sessionSignOut, () => session.signOut())
  // Local state, not an API call -- no `session.run()` here, same as
  // `sessionIsConfigured` above.
  handle(IPC_CHANNELS.sessionGetCongregation, () => Promise.resolve(session.congregation))

  handle(IPC_CHANNELS.territoriesListWithBlocks, () => session.run(listTerritoriesWithBlocks))
  handle(IPC_CHANNELS.territoriesCreate, (input: TerritoryCreateInput) =>
    session.run(() => api.createTerritory(input))
  )
  handle(IPC_CHANNELS.territoriesUpdate, (territoryId: string, input: TerritoryUpdateInput) =>
    session.run(() => api.updateTerritory(territoryId, input))
  )
  handle(IPC_CHANNELS.territoriesDelete, (territoryId: string) =>
    session.run(() => api.deleteTerritory(territoryId))
  )

  handle(IPC_CHANNELS.assignmentsListFor, (territoryId: string) =>
    session.run(() => api.listAssignments(territoryId))
  )
  handle(IPC_CHANNELS.assignmentsListAll, () => session.run(() => api.listAllAssignments()))
  handle(IPC_CHANNELS.assignmentsDesignate, (territoryId: string, publisherId: string) =>
    session.run(() => api.designate(territoryId, publisherId))
  )
  handle(IPC_CHANNELS.assignmentsComplete, (territoryId: string) =>
    session.run(() => api.completeAssignment(territoryId))
  )
  handle(IPC_CHANNELS.assignmentsDelete, (territoryId: string, assignmentId: string) =>
    session.run(() => api.deleteAssignment(territoryId, assignmentId))
  )

  handle(IPC_CHANNELS.blocksCreate, (input: BlockCreateInput) =>
    session.run(() => api.createBlock(input))
  )
  handle(IPC_CHANNELS.blocksUpdate, (blockId: string, input: BlockUpdateInput) =>
    session.run(() => api.updateBlock(blockId, input))
  )
  handle(IPC_CHANNELS.blocksDelete, (blockId: string) =>
    session.run(() => api.deleteBlock(blockId))
  )

  handle(IPC_CHANNELS.publishersList, () => session.run(() => api.listPublishers()))
  handle(IPC_CHANNELS.publishersCreate, (name: string) =>
    session.run(() => api.createPublisher(name))
  )
  handle(IPC_CHANNELS.publishersRegenerateCode, (publisherId: string) =>
    session.run(() => api.regenerateAccessCode(publisherId))
  )
  handle(IPC_CHANNELS.publishersSetActive, (publisherId: string, isActive: boolean) =>
    session.run(() => api.setPublisherActive(publisherId, isActive))
  )

  handle(IPC_CHANNELS.workLogsListFor, (blockId: string) =>
    session.run(() => api.listWorkLogs(blockId))
  )
  handle(IPC_CHANNELS.workLogsDelete, (logId: string) =>
    session.run(() => api.deleteWorkLog(logId))
  )
  handle(IPC_CHANNELS.workLogsMarkWorked, (blockId: string, publisherId: string, workedAt: Date) =>
    session.run(() => api.markBlockWorked(blockId, { userId: publisherId, workedAt }))
  )

  handle(IPC_CHANNELS.exportAssignments, async (): Promise<string | null> => {
    const rows = await session.run(async () => {
      const territories = await listTerritoriesWithBlocks()
      // One extra request per territory. It is an N+1, and deliberately left
      // as one: a congregation has dozens of territories, not thousands, and
      // the server has no bulk endpoint for the histories. Adding one would
      // cost a route and a schema to save a handful of local requests on an
      // action the admin runs a few times a year.
      return Promise.all(
        territories.map(async (territory) => ({
          territory,
          assignments: await api.listAssignments(territory.id)
        }))
      )
    })

    const workbook = buildAssignmentsWorkbook(rows)

    // Asked for only after the data is in hand: a dialog that opens and then
    // fails on a network error would have made the admin pick a path for
    // nothing.
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exportar designações',
      defaultPath: suggestedFileName(new Date()),
      filters: [{ name: 'Planilha do Excel', extensions: ['xlsx'] }]
    })
    if (canceled || filePath === undefined || filePath === '') return null

    await workbook.xlsx.writeFile(filePath)
    return filePath
  })

  // Not a call to this app's own server -- no `session.run()`, same as
  // `sessionIsConfigured`/`sessionGetCongregation` above.
  handle(IPC_CHANNELS.geoGeocodeCity, (city: string) => geocoder.geocodeCity(city))
}
