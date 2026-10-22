// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS, type BlockUpdateInput } from '../shared/ipc-contract'
import type {
  Assignment,
  AssignmentHistoryPage,
  AssignmentHistoryQuery,
  AssignmentWithTerritory,
  Territory,
  WorkLog
} from '../shared/models'
import type { ApiClient } from './api-client'
import type { Session } from './session'
import type { Geocoder } from './geocode'
import { registerIpcHandlers, type SaveDialog } from './ipc-handlers'
import { ApiErrorException } from '../shared/api-errors'
import { createSession } from './session'
import type { CredentialsStore } from './credentials-store'

/**
 * `ipcMain` is the only Electron binding this file reaches, and it does not
 * exist outside a running Electron process. Capturing the registrations in a
 * plain map is what lets the test invoke a handler directly, with no window
 * and no IPC round trip.
 */
const registered = new Map<string, (...args: unknown[]) => Promise<unknown>>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      listener: (event: unknown, ...args: unknown[]) => Promise<unknown>
    ) => {
      registered.set(channel, (...args: unknown[]) => listener({}, ...args))
    }
  }
}))

function fakeSession(): Session {
  return {
    isConfigured: vi.fn(),
    configure: vi.fn(),
    // The real one signs in and retries once on 401; neither matters here, so
    // it just runs the action.
    run: vi.fn(<T>(action: () => Promise<T>) => action()),
    signOut: vi.fn(),
    congregation: null
  } as unknown as Session
}

const TERRITORY: Territory = {
  id: 'terr-1',
  name: 'Centro - N6',
  boundary: [],
  blocks: []
}

const ASSIGNMENT: Assignment = {
  id: 'assign-1',
  publisher: { id: 'pub-1', name: 'João' },
  startedAt: new Date(Date.UTC(2026, 0, 10))
}

const ASSIGNMENT_WITH_TERRITORY: AssignmentWithTerritory = {
  ...ASSIGNMENT,
  territory: { id: TERRITORY.id, name: TERRITORY.name }
}

const ASSIGNMENT_HISTORY_PAGE: AssignmentHistoryPage = {
  items: [ASSIGNMENT_WITH_TERRITORY],
  total: 1,
  page: 1,
  pageSize: 50
}

const WORK_LOG: WorkLog = {
  id: 'log-1',
  blockId: 'block-1',
  publisher: { id: 'pub-1', name: 'João' },
  workedAt: new Date(Date.UTC(2026, 7, 1, 9)),
  createdAt: new Date(Date.UTC(2026, 7, 1, 9, 5))
}

function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listTerritories: vi.fn(async () => [TERRITORY]),
    markBlockWorked: vi.fn(async () => WORK_LOG),
    getTerritory: vi.fn(async () => TERRITORY),
    listAssignments: vi.fn(async () => [ASSIGNMENT]),
    listAllAssignments: vi.fn(async () => ASSIGNMENT_HISTORY_PAGE),
    ...overrides
  } as unknown as ApiClient
}

const fakeGeocoder = { geocodeCity: vi.fn() } as unknown as Geocoder

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = registered.get(channel)
  if (handler === undefined) throw new Error(`no handler registered for ${channel}`)
  return handler(...args)
}

let workDir: string

beforeEach(() => {
  registered.clear()
  workDir = mkdtempSync(join(tmpdir(), 'territory-export-'))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe('export:assignments', () => {
  it('returns null and writes nothing when the admin cancels the save dialog', async () => {
    const chosenPath = join(workDir, 'designacoes.xlsx')
    const dialog: SaveDialog = {
      showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: chosenPath }))
    }
    registerIpcHandlers({ session: fakeSession(), api: fakeApi(), geocoder: fakeGeocoder, dialog })

    await expect(invoke(IPC_CHANNELS.exportAssignments)).resolves.toBeNull()
    expect(existsSync(chosenPath)).toBe(false)
  })

  it('writes the workbook and returns the chosen path when the admin confirms', async () => {
    const chosenPath = join(workDir, 'designacoes.xlsx')
    const dialog: SaveDialog = {
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: chosenPath }))
    }
    registerIpcHandlers({ session: fakeSession(), api: fakeApi(), geocoder: fakeGeocoder, dialog })

    await expect(invoke(IPC_CHANNELS.exportAssignments)).resolves.toBe(chosenPath)
    expect(existsSync(chosenPath)).toBe(true)
  })

  it('suggests a dated file name ending in .xlsx and filters to that extension', async () => {
    const showSaveDialog: SaveDialog['showSaveDialog'] = vi.fn(async () => ({
      canceled: true,
      filePath: undefined
    }))
    registerIpcHandlers({
      session: fakeSession(),
      api: fakeApi(),
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog }
    })

    await invoke(IPC_CHANNELS.exportAssignments)

    expect(showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringMatching(/^designacoes-\d{4}-\d{2}-\d{2}\.xlsx$/),
        filters: [{ name: 'Planilha do Excel', extensions: ['xlsx'] }]
      })
    )
  })
})

describe('export:s13t', () => {
  it('returns null and writes nothing when the admin cancels the save dialog', async () => {
    const chosenPath = join(workDir, 'S-13_T-2026.xlsx')
    const dialog: SaveDialog = {
      showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: chosenPath }))
    }
    registerIpcHandlers({ session: fakeSession(), api: fakeApi(), geocoder: fakeGeocoder, dialog })

    await expect(
      invoke(IPC_CHANNELS.exportS13T, { serviceYear: 2026, format: 'xlsx' })
    ).resolves.toBeNull()
    expect(existsSync(chosenPath)).toBe(false)
  })

  it('writes the S-13-T workbook and returns the chosen path when the admin confirms', async () => {
    const chosenPath = join(workDir, 'S-13_T-2026.xlsx')
    const dialog: SaveDialog = {
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: chosenPath }))
    }
    registerIpcHandlers({ session: fakeSession(), api: fakeApi(), geocoder: fakeGeocoder, dialog })

    await expect(
      invoke(IPC_CHANNELS.exportS13T, { serviceYear: 2026, format: 'xlsx' })
    ).resolves.toBe(chosenPath)
    expect(existsSync(chosenPath)).toBe(true)
  })

  it('suggests S-13_T-<year>.xlsx as default file name when format is xlsx', async () => {
    const showSaveDialog: SaveDialog['showSaveDialog'] = vi.fn(async () => ({
      canceled: true,
      filePath: undefined
    }))
    registerIpcHandlers({
      session: fakeSession(),
      api: fakeApi(),
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog }
    })

    await invoke(IPC_CHANNELS.exportS13T, { serviceYear: 2026, format: 'xlsx' })

    expect(showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: 'S-13_T-2026.xlsx',
        filters: [{ name: 'Planilha do Excel', extensions: ['xlsx'] }]
      })
    )
  })
})

describe('export:s13tDocx', () => {
  it('writes the S-13-T docx document and returns the chosen path when the admin confirms', async () => {
    const chosenPath = join(workDir, 'S-13_T-2026.docx')
    const dialog: SaveDialog = {
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: chosenPath }))
    }
    registerIpcHandlers({ session: fakeSession(), api: fakeApi(), geocoder: fakeGeocoder, dialog })

    await expect(invoke(IPC_CHANNELS.exportS13TDocx, { serviceYear: 2026 })).resolves.toBe(
      chosenPath
    )
    expect(existsSync(chosenPath)).toBe(true)
  })

  it('suggests S-13_T-<year>.docx as default file name', async () => {
    const showSaveDialog: SaveDialog['showSaveDialog'] = vi.fn(async () => ({
      canceled: true,
      filePath: undefined
    }))
    registerIpcHandlers({
      session: fakeSession(),
      api: fakeApi(),
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog }
    })

    await invoke(IPC_CHANNELS.exportS13T, { serviceYear: 2026, format: 'docx' })

    expect(showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: 'S-13_T-2026.docx',
        filters: [{ name: 'Documento Word', extensions: ['docx'] }]
      })
    )
  })
})

describe('import:s13t', () => {
  it('returns null when file selection is canceled', async () => {
    const dialog: SaveDialog = {
      showSaveDialog: vi.fn(),
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] }))
    }
    registerIpcHandlers({ session: fakeSession(), api: fakeApi(), geocoder: fakeGeocoder, dialog })

    await expect(invoke(IPC_CHANNELS.importS13TSelectAndPreview)).resolves.toBeNull()
  })

  it('executes import creating publishers and assignments', async () => {
    const designate = vi.fn().mockResolvedValue(ASSIGNMENT)
    const complete = vi.fn().mockResolvedValue(ASSIGNMENT)
    const createPublisher = vi.fn().mockResolvedValue({ id: 'pub-2', name: 'Maria' })
    const listPublishers = vi.fn().mockResolvedValue([{ id: 'pub-1', name: 'João' }])

    const api = fakeApi({
      designate,
      completeAssignment: complete,
      createPublisher,
      listPublishers
    })

    registerIpcHandlers({
      session: fakeSession(),
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    const preview = {
      fileName: 'S-13_T-2026.docx',
      serviceYear: 2026,
      totalTerritoriesFound: 1,
      matchedTerritoriesCount: 1,
      totalAssignmentsCount: 2,
      territories: [
        {
          territoryNumberOrName: 'Centro - N6',
          matchedTerritoryId: 'terr-1',
          assignments: [
            { publisherName: 'João', startedAt: '10/01/2026', completedAt: '15/02/2026' },
            { publisherName: 'Maria', startedAt: '01/03/2026', completedAt: null }
          ]
        }
      ]
    }

    const result = await invoke(IPC_CHANNELS.importS13TExecute, preview)
    expect(result).toEqual({
      importedAssignmentsCount: 2,
      importedPublishersCount: 1,
      errors: []
    })

    expect(createPublisher).toHaveBeenCalledWith('Maria')
    expect(designate).toHaveBeenCalledTimes(2)
    expect(complete).toHaveBeenCalledTimes(1)
  })
})

describe('assignments:listAll', () => {
  it('forwards the typed query and paginated result through the session', async () => {
    const api = fakeApi()
    const session = fakeSession()
    registerIpcHandlers({
      session,
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    const query: AssignmentHistoryQuery = {
      fromInstant: new Date('2026-08-01T00:00:00.000Z'),
      toInstant: new Date('2026-09-01T00:00:00.000Z'),
      publisherId: 'pub-1',
      territoryId: 'terr-1',
      page: 2,
      pageSize: 10
    }

    await expect(invoke(IPC_CHANNELS.assignmentsListAll, query)).resolves.toEqual(
      ASSIGNMENT_HISTORY_PAGE
    )
    expect(api.listAllAssignments).toHaveBeenCalledWith(query)
    expect(session.run).toHaveBeenCalledOnce()
  })
})

describe('blocks:update', () => {
  it('forwards the forced status to the API client, through the session', async () => {
    const updated = { id: 'block-1', number: 3, polygon: [], statusOverride: 'overdue' as const }
    const api = fakeApi({ updateBlock: vi.fn(async () => updated) })
    const session = fakeSession()
    registerIpcHandlers({
      session,
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    await expect(
      invoke(IPC_CHANNELS.blocksUpdate, 'block-1', {
        statusOverride: 'overdue'
      } satisfies BlockUpdateInput)
    ).resolves.toEqual(updated)
    expect(api.updateBlock).toHaveBeenCalledWith('block-1', { statusOverride: 'overdue' })
    expect(session.run).toHaveBeenCalledOnce()
  })

  it('forwards a null statusOverride untouched, so the block goes back to automatic', async () => {
    const updated = { id: 'block-1', number: 3, polygon: [] }
    const api = fakeApi({ updateBlock: vi.fn(async () => updated) })
    registerIpcHandlers({
      session: fakeSession(),
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    await invoke(IPC_CHANNELS.blocksUpdate, 'block-1', {
      statusOverride: null
    } satisfies BlockUpdateInput)

    expect(api.updateBlock).toHaveBeenCalledWith('block-1', { statusOverride: null })
  })

  it('re-authenticates once and retries when the server answers 401', async () => {
    const credentials = { name: 'Congregação Central', city: 'São Paulo', password: 'pw' }
    const store: CredentialsStore = {
      read: vi.fn(async () => credentials),
      write: vi.fn(),
      clear: vi.fn()
    }
    const updated = { id: 'block-1', number: 3, polygon: [], statusOverride: 'never' as const }
    let attempt = 0
    const api = fakeApi({
      login: vi.fn(async () => ({
        accessToken: 'token',
        congregation: { id: 'cong-1', name: credentials.name, city: credentials.city }
      })),
      setToken: vi.fn(),
      updateBlock: vi.fn(async () => {
        attempt += 1
        if (attempt === 1) throw new ApiErrorException(401, 'unauthorized', 'token expirado')
        return updated
      })
    })
    registerIpcHandlers({
      session: createSession({ api, store }),
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    await expect(
      invoke(IPC_CHANNELS.blocksUpdate, 'block-1', {
        statusOverride: 'never'
      } satisfies BlockUpdateInput)
    ).resolves.toEqual(updated)
    expect(attempt).toBe(2)
    expect(api.login).toHaveBeenCalledTimes(2) // first sign-in + the retry's
  })
})

describe('workLogs:markWorked', () => {
  it('forwards the block, the publisher and the date to the API client, through the session', async () => {
    const api = fakeApi()
    const session = fakeSession()
    const workedAt = new Date(Date.UTC(2026, 7, 1, 9))
    registerIpcHandlers({
      session,
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    await expect(
      invoke(IPC_CHANNELS.workLogsMarkWorked, 'block-1', 'pub-1', workedAt)
    ).resolves.toEqual(WORK_LOG)
    expect(api.markBlockWorked).toHaveBeenCalledWith('block-1', {
      userId: 'pub-1',
      workedAt
    })
    expect(session.run).toHaveBeenCalledOnce()
  })

  it('propagates a rejected marking as a serialized error, code and status included', async () => {
    const api = fakeApi({
      markBlockWorked: vi.fn(async () => {
        throw new ApiErrorException(404, 'not_found', 'Publicador não encontrado.')
      })
    })
    registerIpcHandlers({
      session: fakeSession(),
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    const error = await invoke(
      IPC_CHANNELS.workLogsMarkWorked,
      'block-1',
      'pub-1',
      new Date()
    ).catch((thrown: Error) => thrown)

    expect(JSON.parse((error as Error).message)).toEqual({
      name: 'ApiErrorException',
      message: 'Publicador não encontrado.',
      code: 'not_found',
      statusCode: 404
    })
  })

  // The one handler-level check that the marking really sits inside
  // `session.run`: a real session (not the pass-through fake) turns an
  // expired token into a silent re-login and a second attempt.
  it('re-authenticates once and retries when the server answers 401', async () => {
    const credentials = { name: 'Congregação Central', city: 'São Paulo', password: 'pw' }
    const store: CredentialsStore = {
      read: vi.fn(async () => credentials),
      write: vi.fn(),
      clear: vi.fn()
    }
    let attempt = 0
    const api = fakeApi({
      login: vi.fn(async () => ({
        accessToken: 'token',
        congregation: { id: 'cong-1', name: credentials.name, city: credentials.city }
      })),
      setToken: vi.fn(),
      markBlockWorked: vi.fn(async () => {
        attempt += 1
        if (attempt === 1) throw new ApiErrorException(401, 'unauthorized', 'token expirado')
        return WORK_LOG
      })
    })
    registerIpcHandlers({
      session: createSession({ api, store }),
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    await expect(
      invoke(IPC_CHANNELS.workLogsMarkWorked, 'block-1', 'pub-1', new Date())
    ).resolves.toEqual(WORK_LOG)
    expect(attempt).toBe(2)
    expect(api.login).toHaveBeenCalledTimes(2) // first sign-in + the retry's
  })
})

describe('campaigns', () => {
  it('forwards each campaign channel to its API client call, through the session', async () => {
    const campaign = {
      id: 'camp-1',
      name: 'Celebração',
      createdAt: new Date(),
      territories: [],
      designations: []
    }
    const api = fakeApi({
      listCampaigns: vi.fn(async () => [campaign]),
      createCampaign: vi.fn(async () => campaign),
      updateCampaign: vi.fn(async () => campaign),
      deleteCampaign: vi.fn(async () => undefined),
      designateCampaign: vi.fn(async () => campaign),
      setCampaignPublishers: vi.fn(async () => campaign),
      completeCampaign: vi.fn(async () => campaign)
    })
    const session = fakeSession()
    registerIpcHandlers({
      session,
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    await invoke(IPC_CHANNELS.campaignsList)
    await invoke(IPC_CHANNELS.campaignsCreate, { name: 'Celebração', territoryIds: ['terr-1'] })
    await invoke(IPC_CHANNELS.campaignsUpdate, 'camp-1', { name: 'Outra' })
    await invoke(IPC_CHANNELS.campaignsDelete, 'camp-1')
    await invoke(IPC_CHANNELS.campaignsDesignate, 'camp-1', ['pub-1', 'pub-2'])
    await invoke(IPC_CHANNELS.campaignsSetPublishers, 'camp-1', ['pub-2'])
    await invoke(IPC_CHANNELS.campaignsComplete, 'camp-1')

    expect(api.createCampaign).toHaveBeenCalledWith({
      name: 'Celebração',
      territoryIds: ['terr-1']
    })
    expect(api.updateCampaign).toHaveBeenCalledWith('camp-1', { name: 'Outra' })
    expect(api.deleteCampaign).toHaveBeenCalledWith('camp-1')
    expect(api.designateCampaign).toHaveBeenCalledWith('camp-1', ['pub-1', 'pub-2'])
    expect(api.setCampaignPublishers).toHaveBeenCalledWith('camp-1', ['pub-2'])
    expect(api.completeCampaign).toHaveBeenCalledWith('camp-1')
    expect(session.run).toHaveBeenCalledTimes(7)
  })

  it('propagates a refused designation as a serialized error with the server message', async () => {
    const api = fakeApi({
      designateCampaign: vi.fn(async () => {
        throw new ApiErrorException(
          409,
          'territory_in_campaign',
          'O território Centro - N5 já está na campanha Visitas.'
        )
      })
    })
    registerIpcHandlers({
      session: fakeSession(),
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    const error = await invoke(IPC_CHANNELS.campaignsDesignate, 'camp-1', ['pub-1']).catch(
      (thrown: Error) => thrown
    )

    expect(JSON.parse((error as Error).message)).toEqual({
      name: 'ApiErrorException',
      message: 'O território Centro - N5 já está na campanha Visitas.',
      code: 'territory_in_campaign',
      statusCode: 409
    })
  })
})

describe('publishers:delete', () => {
  it('forwards the publisher id to the API client, through the session', async () => {
    const api = fakeApi({ deletePublisher: vi.fn(async () => undefined) })
    const session = fakeSession()
    registerIpcHandlers({
      session,
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    await expect(invoke(IPC_CHANNELS.publishersDelete, 'pub-1')).resolves.toBeUndefined()
    expect(api.deletePublisher).toHaveBeenCalledWith('pub-1')
    expect(session.run).toHaveBeenCalledOnce()
  })

  it('propagates a refused deletion as a serialized error, code and status included', async () => {
    const api = fakeApi({
      deletePublisher: vi.fn(async () => {
        throw new ApiErrorException(
          409,
          'publisher_has_open_assignment',
          'Conclua a designação em vigor antes de apagar o publicador.'
        )
      })
    })
    registerIpcHandlers({
      session: fakeSession(),
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    const error = await invoke(IPC_CHANNELS.publishersDelete, 'pub-1').catch(
      (thrown: Error) => thrown
    )

    expect(JSON.parse((error as Error).message)).toEqual({
      name: 'ApiErrorException',
      message: 'Conclua a designação em vigor antes de apagar o publicador.',
      code: 'publisher_has_open_assignment',
      statusCode: 409
    })
  })

  it('re-authenticates once and retries when the server answers 401', async () => {
    const credentials = { name: 'Congregação Central', city: 'São Paulo', password: 'pw' }
    const store: CredentialsStore = {
      read: vi.fn(async () => credentials),
      write: vi.fn(),
      clear: vi.fn()
    }
    let attempt = 0
    const api = fakeApi({
      login: vi.fn(async () => ({
        accessToken: 'token',
        congregation: { id: 'cong-1', name: credentials.name, city: credentials.city }
      })),
      setToken: vi.fn(),
      deletePublisher: vi.fn(async () => {
        attempt += 1
        if (attempt === 1) throw new ApiErrorException(401, 'unauthorized', 'token expirado')
      })
    })
    registerIpcHandlers({
      session: createSession({ api, store }),
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    await expect(invoke(IPC_CHANNELS.publishersDelete, 'pub-1')).resolves.toBeUndefined()
    expect(attempt).toBe(2)
    expect(api.login).toHaveBeenCalledTimes(2) // first sign-in + the retry's
  })
})
