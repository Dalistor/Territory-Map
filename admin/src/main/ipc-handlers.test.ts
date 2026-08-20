// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../shared/ipc-contract'
import type { Assignment, AssignmentWithTerritory, Territory, WorkLog } from '../shared/models'
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
    listAllAssignments: vi.fn(async () => [ASSIGNMENT_WITH_TERRITORY]),
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

describe('assignments:listAll', () => {
  it('returns the whole congregation history through the session', async () => {
    const api = fakeApi()
    const session = fakeSession()
    registerIpcHandlers({
      session,
      api,
      geocoder: fakeGeocoder,
      dialog: { showSaveDialog: vi.fn() }
    })

    await expect(invoke(IPC_CHANNELS.assignmentsListAll)).resolves.toEqual([
      ASSIGNMENT_WITH_TERRITORY
    ])
    expect(api.listAllAssignments).toHaveBeenCalledOnce()
    expect(session.run).toHaveBeenCalledOnce()
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
