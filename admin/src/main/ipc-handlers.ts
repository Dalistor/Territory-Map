// Wires every IPC channel in `shared/ipc-contract.ts` to the session (Task
// 06) and the API client (Task 04). No business rule lives here — each
// handler is a one-line call into `session.run(...)` with the matching
// `api-client` operation. The only thing genuinely done in this file, beyond
// fan-out and delegation, is error serialization (see `serializeError`
// below), because that is an IPC-boundary concern, not a domain one.

import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  IPC_CHANNELS,
  type AssignmentUpdateInput,
  type BlockCreateInput,
  type BlockUpdateInput,
  type S13TImportPreview,
  type S13TImportResult,
  type S13TOptions,
  type SessionCredentials,
  type TerritoryCreateInput,
  type TerritoryUpdateInput,
  type SerializedIpcError
} from '../shared/ipc-contract'
import {
  getServiceYear,
  territoryNumber,
  type AssignmentHistoryQuery,
  type Territory
} from '../shared/models'
import { ApiErrorException } from '../shared/api-errors'
import type { ApiClient } from './api-client'
import type { Session } from './session'
import type { Geocoder } from './geocode'
import { buildAssignmentsWorkbook, buildS13TWorkbook } from './excel-export'
import { buildS13TDocx, parseS13TDocx } from './docx-handler'

/**
 * The slice of Electron's `dialog` this file uses. Narrowing it to these methods
 * is what lets the tests hand in a stub and never open a real window --
 * `session`, `api` and `geocoder` are injected for the same reason.
 */
export interface SaveDialog {
  showSaveDialog(options: {
    title?: string
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[]
  }): Promise<{ canceled: boolean; filePath?: string }>
  showOpenDialog?(options: {
    title?: string
    filters?: { name: string; extensions: string[] }[]
    properties?: ('openFile' | 'multiSelections')[]
  }): Promise<{ canceled: boolean; filePaths: string[] }>
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
  handle(IPC_CHANNELS.assignmentsListAll, (query?: AssignmentHistoryQuery) =>
    session.run(() => api.listAllAssignments(query))
  )
  handle(IPC_CHANNELS.assignmentsDesignate, (territoryId: string, publisherId: string) =>
    session.run(() => api.designate(territoryId, publisherId))
  )
  handle(
    IPC_CHANNELS.assignmentsUpdate,
    (territoryId: string, assignmentId: string, input: AssignmentUpdateInput) =>
      session.run(() =>
        api.updateAssignment(territoryId, assignmentId, {
          ...(input.publisherId !== undefined && { publisherId: input.publisherId }),
          ...(input.startedAt !== undefined && {
            startedAt: input.startedAt instanceof Date ? input.startedAt : new Date(input.startedAt)
          }),
          ...(input.completedAt !== undefined && {
            completedAt:
              input.completedAt instanceof Date ? input.completedAt : new Date(input.completedAt)
          }),
          ...(input.clearCompletedAt !== undefined && {
            clearCompletedAt: input.clearCompletedAt
          })
        })
      )
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
  handle(IPC_CHANNELS.publishersDelete, (publisherId: string) =>
    session.run(() => api.deletePublisher(publisherId))
  )
  handle(IPC_CHANNELS.publishersRename, (publisherId: string, name: string) =>
    session.run(() => api.renamePublisher(publisherId, name))
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

  handle(IPC_CHANNELS.exportS13T, async (options?: S13TOptions): Promise<string | null> => {
    if (options?.format === 'docx') {
      return exportS13TDocxHandler(options)
    }

    const targetServiceYear = options?.serviceYear ?? getServiceYear()

    const rows = await session.run(async () => {
      const territories = await listTerritoriesWithBlocks()
      return Promise.all(
        territories.map(async (territory) => ({
          territory,
          assignments: await api.listAssignments(territory.id)
        }))
      )
    })

    const workbook = buildS13TWorkbook({
      congregation: session.congregation,
      serviceYear: targetServiceYear,
      territories: rows
    })

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exportar Formulário S-13-T (Excel)',
      defaultPath: `S-13_T-${targetServiceYear}.xlsx`,
      filters: [{ name: 'Planilha do Excel', extensions: ['xlsx'] }]
    })
    if (canceled || filePath === undefined || filePath === '') return null

    await workbook.xlsx.writeFile(filePath)
    return filePath
  })

  async function exportS13TDocxHandler(options?: S13TOptions): Promise<string | null> {
    const targetServiceYear = options?.serviceYear ?? getServiceYear()

    const rows = await session.run(async () => {
      const territories = await listTerritoriesWithBlocks()
      return Promise.all(
        territories.map(async (territory) => ({
          territory,
          assignments: await api.listAssignments(territory.id)
        }))
      )
    })

    const docxBuffer = await buildS13TDocx({
      congregation: session.congregation,
      serviceYear: targetServiceYear,
      territories: rows
    })

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exportar Formulário S-13-T (Word)',
      defaultPath: `S-13_T-${targetServiceYear}.docx`,
      filters: [{ name: 'Documento Word', extensions: ['docx'] }]
    })
    if (canceled || filePath === undefined || filePath === '') return null

    await writeFile(filePath, docxBuffer)
    return filePath
  }

  handle(IPC_CHANNELS.exportS13TDocx, exportS13TDocxHandler)

  handle(IPC_CHANNELS.importS13TSelectAndPreview, async (): Promise<S13TImportPreview | null> => {
    if (!dialog.showOpenDialog) {
      throw new Error('showOpenDialog is not available')
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Selecionar arquivo S-13-T',
      filters: [{ name: 'Documentos Word', extensions: ['docx'] }],
      properties: ['openFile']
    })

    if (canceled || filePaths.length === 0 || !filePaths[0]) {
      return null
    }

    const filePath = filePaths[0]
    const fileBuffer = await readFile(filePath)
    const parsed = await parseS13TDocx(fileBuffer)

    const territories = await session.run(async () => listTerritoriesWithBlocks())

    let matchedCount = 0
    let totalAssignments = 0

    const previewTerritories = parsed.territories.map((parsedTerr) => {
      const parsedNum = territoryNumber(parsedTerr.territoryNumberOrName)
      const matched = territories.find((t) => {
        if (parsedNum !== null && territoryNumber(t.name) === parsedNum) {
          return true
        }
        return t.name.trim().toLowerCase() === parsedTerr.territoryNumberOrName.trim().toLowerCase()
      })

      if (matched) {
        matchedCount++
      }
      totalAssignments += parsedTerr.assignments.length

      return {
        territoryNumberOrName: parsedTerr.territoryNumberOrName,
        matchedTerritoryId: matched ? matched.id : null,
        lastCompletedDate: parsedTerr.lastCompletedDate,
        assignments: parsedTerr.assignments
      }
    })

    return {
      fileName: basename(filePath),
      serviceYear: parsed.serviceYear,
      congregationName: parsed.congregationName,
      territories: previewTerritories,
      totalTerritoriesFound: parsed.territories.length,
      matchedTerritoriesCount: matchedCount,
      totalAssignmentsCount: totalAssignments
    }
  })

  handle(
    IPC_CHANNELS.importS13TExecute,
    async (preview: S13TImportPreview): Promise<S13TImportResult> => {
      return session.run(async () => {
        const existingPublishers = await api.listPublishers()
        const publisherMap = new Map<string, string>()

        for (const pub of existingPublishers) {
          publisherMap.set(pub.name.trim().toLowerCase(), pub.id)
        }

        let importedAssignments = 0
        let importedPublishers = 0
        const errors: string[] = []

        for (const terr of preview.territories) {
          if (!terr.matchedTerritoryId) {
            continue
          }

          for (const asg of terr.assignments) {
            const pubName = asg.publisherName.trim()
            if (!pubName) continue

            const lower = pubName.toLowerCase()
            let publisherId = publisherMap.get(lower)

            if (!publisherId) {
              try {
                const created = await api.createPublisher(pubName)
                publisherId = created.id
                publisherMap.set(lower, created.id)
                importedPublishers++
              } catch (err) {
                errors.push(`Erro ao criar publicador ${pubName}: ${String(err)}`)
                continue
              }
            }

            try {
              await api.designate(terr.matchedTerritoryId, publisherId)
              if (asg.completedAt) {
                await api.completeAssignment(terr.matchedTerritoryId)
              }
              importedAssignments++
            } catch (err) {
              errors.push(
                `Erro ao designar território ${terr.territoryNumberOrName} para ${pubName}: ${String(err)}`
              )
            }
          }
        }

        return {
          importedAssignmentsCount: importedAssignments,
          importedPublishersCount: importedPublishers,
          errors
        }
      })
    }
  )

  // Not a call to this app's own server -- no `session.run()`, same as
  // `sessionIsConfigured`/`sessionGetCongregation` above.
  handle(IPC_CHANNELS.geoGeocodeCity, (city: string) => geocoder.geocodeCity(city))
}
