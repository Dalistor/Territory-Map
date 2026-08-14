// The only file allowed to touch `ipcRenderer` directly. It implements
// `IpcApi` (`shared/ipc-contract.ts`) by forwarding each method to
// `ipcRenderer.invoke` on the matching channel, and exposes the result as
// `window.api` through `contextBridge` — the renderer never sees
// `ipcRenderer`, only this typed surface.

import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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
  workLogs: {
    listFor: (blockId: string) => ipcRenderer.invoke(IPC_CHANNELS.workLogsListFor, blockId),
    delete: (logId: string) => ipcRenderer.invoke(IPC_CHANNELS.workLogsDelete, logId)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
