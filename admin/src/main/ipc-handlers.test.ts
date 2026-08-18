// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../shared/ipc-contract'
import type { Assignment, Territory } from '../shared/models'
import type { ApiClient } from './api-client'
import type { Session } from './session'
import type { Geocoder } from './geocode'
import { registerIpcHandlers, type SaveDialog } from './ipc-handlers'

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

function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listTerritories: vi.fn(async () => [TERRITORY]),
    getTerritory: vi.fn(async () => TERRITORY),
    listAssignments: vi.fn(async () => [ASSIGNMENT]),
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
