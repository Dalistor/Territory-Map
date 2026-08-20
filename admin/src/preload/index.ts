// The only file allowed to touch `ipcRenderer` directly. It implements
// `IpcApi` (`shared/ipc-contract.ts`) by forwarding each method to
// `ipcRenderer.invoke` on the matching channel, and exposes the result as
// `window.api` through `contextBridge` — the renderer never sees
// `ipcRenderer`, only this typed surface.

import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type BlockCreateInput,
  type BlockUpdateInput,
  type IpcApi,
  type SessionCredentials,
  type TerritoryCreateInput,
  type TerritoryUpdateInput
} from '../shared/ipc-contract'

// Custom APIs for renderer
const api: IpcApi = {
  session: {
    isConfigured: () => ipcRenderer.invoke(IPC_CHANNELS.sessionIsConfigured),
    configure: (credentials: SessionCredentials) =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionConfigure, credentials),
    signOut: () => ipcRenderer.invoke(IPC_CHANNELS.sessionSignOut),
    getCongregation: () => ipcRenderer.invoke(IPC_CHANNELS.sessionGetCongregation)
  },
  territories: {
    listWithBlocks: () => ipcRenderer.invoke(IPC_CHANNELS.territoriesListWithBlocks),
    create: (input: TerritoryCreateInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.territoriesCreate, input),
    update: (territoryId: string, input: TerritoryUpdateInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.territoriesUpdate, territoryId, input),
    delete: (territoryId: string) => ipcRenderer.invoke(IPC_CHANNELS.territoriesDelete, territoryId)
  },
  blocks: {
    create: (input: BlockCreateInput) => ipcRenderer.invoke(IPC_CHANNELS.blocksCreate, input),
    update: (blockId: string, input: BlockUpdateInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.blocksUpdate, blockId, input),
    delete: (blockId: string) => ipcRenderer.invoke(IPC_CHANNELS.blocksDelete, blockId)
  },
  publishers: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.publishersList),
    create: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.publishersCreate, name),
    regenerateCode: (publisherId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.publishersRegenerateCode, publisherId),
    setActive: (publisherId: string, isActive: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.publishersSetActive, publisherId, isActive)
  },
  assignments: {
    listFor: (territoryId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.assignmentsListFor, territoryId),
    listAll: () => ipcRenderer.invoke(IPC_CHANNELS.assignmentsListAll),
    designate: (territoryId: string, publisherId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.assignmentsDesignate, territoryId, publisherId),
    complete: (territoryId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.assignmentsComplete, territoryId),
    delete: (territoryId: string, assignmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.assignmentsDelete, territoryId, assignmentId)
  },
  exports: {
    assignments: () => ipcRenderer.invoke(IPC_CHANNELS.exportAssignments)
  },
  workLogs: {
    listFor: (blockId: string) => ipcRenderer.invoke(IPC_CHANNELS.workLogsListFor, blockId),
    delete: (logId: string) => ipcRenderer.invoke(IPC_CHANNELS.workLogsDelete, logId),
    markWorked: (blockId: string, publisherId: string, workedAt: Date) =>
      ipcRenderer.invoke(IPC_CHANNELS.workLogsMarkWorked, blockId, publisherId, workedAt)
  },
  geo: {
    geocodeCity: (city: string) => ipcRenderer.invoke(IPC_CHANNELS.geoGeocodeCity, city)
  }
}

// Use `contextBridge` to expose `window.api` to the renderer only if context
// isolation is enabled (it always is -- `sandbox: true`, `contextIsolation:
// true` in `main/index.ts`), otherwise fall back to a plain global.
//
// This is the only Electron API the renderer gets: no `window.electron`,
// because nothing in the app ever called it -- `@electron-toolkit/preload`
// was scaffold leftover from Task 01 that Tasks 02-20 never ended up using.
// Worse than dead weight: `require("@electron-toolkit/preload")` reaches a
// third-party npm package that electron-vite does not bundle into this
// file, and a sandboxed preload's module loader only allows a short list of
// built-ins (`electron`, `events`, `timers`, `url`) -- not arbitrary
// `node_modules` packages. That import throws at the top of the script,
// before either `contextBridge` call below ever runs, which is why
// `window.api` never existed at all.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
