import { ElectronAPI } from '@electron-toolkit/preload'
import type { IpcApi } from '../shared/ipc-contract'

declare global {
  interface Window {
    electron: ElectronAPI
    api: IpcApi
  }
}
