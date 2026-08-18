// Electron app lifecycle: loads `admin/.env`, builds the real `api-client`
// (Task 04) and `credentials-store` (Task 05) with the real `safeStorage`
// and `app.getPath('userData')`, wires them into a `session` (Task 06),
// registers the IPC handlers (this task's `ipc-handlers.ts`) against it, and
// opens the window. No business rule lives here — this file only assembles
// the pieces the other tasks already built and tested.

import { app, shell, BrowserWindow, dialog, safeStorage } from 'electron'
import { join } from 'path'
import { config as loadEnv } from 'dotenv'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createApiClient } from './api-client'
import { createCredentialsStore } from './credentials-store'
import { createSession } from './session'
import { registerIpcHandlers } from './ipc-handlers'
import { createGeocoder } from './geocode'

/**
 * Where `API_BASE_URL`/`APP_KEY` are read from, which is not the same place in
 * the two ways this app runs:
 *
 * - **dev** (`npm run dev`): `<admin>/.env`, reached from the bundled
 *   `<admin>/out/main` — electron-vite bundles the main process to `out/` in
 *   both modes, so `__dirname` is stable regardless of the working directory.
 * - **packaged**: `Contents/Resources/.env`, copied there at build time by
 *   `extraResources` in `electron-builder.yml`. Deliberately *outside* the
 *   asar, so the file stays editable after install: pointing an installed copy
 *   at another server is a text edit, not a rebuild. It is still inside the
 *   bundle and therefore extractable — the same thing CLAUDE.md already says
 *   about `APP_KEY` shipping inside the binary, which is why the key is a
 *   shutter against scanners and never authentication.
 *
 * Before this, the packaged app looked for `app.asar/.env` — a path that
 * cannot exist, since `.env` is excluded from the asar — so it threw below and
 * died before opening a window.
 */
const envPath = app.isPackaged ? join(process.resourcesPath, '.env') : join(__dirname, '../../.env')

loadEnv({ path: envPath })

/** Fails fast and says exactly what to do, instead of shipping a window that
 * takes 401s on every request because `APP_KEY`/`API_BASE_URL` were empty. */
function requireEnv(name: 'API_BASE_URL' | 'APP_KEY'): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing ${name} in ${envPath} — copy admin/.env.example to admin/.env and fill it in ` +
        'before packaging (the file is copied into the app bundle at build time).'
    )
  }
  return value
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    // Window icon for Linux and Windows (taskbar/window chrome, incl. dev).
    // On macOS `BrowserWindow.icon` has no effect: the dev dock shows
    // Electron's own icon, and the packaged app gets its icon from
    // electron-builder (`build/icon.png`). Known limitation, not worth a
    // workaround.
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The renderer only ever reaches the main process through
      // `window.api` (contextBridge) — never Node, never raw `ipcRenderer`.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.territorymap.admin')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const api = createApiClient({
    baseUrl: requireEnv('API_BASE_URL'),
    appKey: requireEnv('APP_KEY')
  })
  const credentialsStore = createCredentialsStore({
    safeStorage,
    getFilePath: () => join(app.getPath('userData'), 'credentials.enc')
  })
  const session = createSession({ api, store: credentialsStore })
  const geocoder = createGeocoder()
  registerIpcHandlers({ session, api, geocoder, dialog })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
