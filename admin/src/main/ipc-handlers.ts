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
import { ApiErrorException } from '../shared/api-errors'
import type { ApiClient } from './api-client'
import type { Session } from './session'
import type { Geocoder } from './geocode'

export interface RegisterIpcHandlersOptions {
  readonly session: Session
  readonly api: ApiClient
  readonly geocoder: Geocoder
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

export function registerIpcHandlers({ session, api, geocoder }: RegisterIpcHandlersOptions): void {
  handle(IPC_CHANNELS.sessionIsConfigured, () => session.isConfigured())
  handle(IPC_CHANNELS.sessionConfigure, (credentials: SessionCredentials) =>
    session.configure(credentials)
  )
  handle(IPC_CHANNELS.sessionSignOut, () => session.signOut())
  // Local state, not an API call -- no `session.run()` here, same as
  // `sessionIsConfigured` above.
  handle(IPC_CHANNELS.sessionGetCongregation, () => Promise.resolve(session.congregation))

  handle(IPC_CHANNELS.territoriesListWithBlocks, () =>
    session.run(async () => {
      // Same fan-out as the old `ApiTerritoryRepository.listWithBlocks`: the
      // list endpoint does not carry blocks, so the detail of each territory
      // has to be fetched separately.
      const territories = await api.listTerritories()
      return Promise.all(territories.map((territory) => api.getTerritory(territory.id)))
    })
  )
  handle(IPC_CHANNELS.territoriesCreate, (input: TerritoryCreateInput) =>
    session.run(() => api.createTerritory(input))
  )
  handle(IPC_CHANNELS.territoriesUpdate, (territoryId: string, input: TerritoryUpdateInput) =>
    session.run(() => api.updateTerritory(territoryId, input))
  )
  handle(IPC_CHANNELS.territoriesDelete, (territoryId: string) =>
    session.run(() => api.deleteTerritory(territoryId))
  )
  handle(IPC_CHANNELS.territoriesAssign, (territoryId: string, userId: string | null) =>
    session.run(() => api.assignTerritory(territoryId, userId))
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

  // Not a call to this app's own server -- no `session.run()`, same as
  // `sessionIsConfigured`/`sessionGetCongregation` above.
  handle(IPC_CHANNELS.geoGeocodeCity, (city: string) => geocoder.geocodeCity(city))
}
