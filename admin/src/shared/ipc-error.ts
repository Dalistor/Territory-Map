// Recovers a `SerializedIpcError` from whatever actually crosses the real IPC
// bridge -- which is not the clean `{name, message, code?, statusCode?}`
// shape `main/ipc-handlers.ts` throws.
//
// Electron's `ipcMain.handle`/`ipcRenderer.invoke` only reconstructs a plain
// `Error` on the renderer side, and rewrites its `message` to
// `Error invoking remote method '<channel>': Error: <original message>`. Since
// `ipc-handlers.ts` JSON-encodes the `SerializedIpcError` into that original
// message, what a screen actually receives looks like:
//
//   Error invoking remote method 'session:configure': Error: {"name":"ApiErrorException","message":"Não foi possível entrar.","code":"invalid_credentials","statusCode":401}
//
// Every screen originally read `error.message` verbatim, which showed that
// whole line to the admin instead of "Não foi possível entrar." -- this file
// is the one place that un-mangles it, so no screen has to know the bridge's
// wrapping format itself.
import type { SerializedIpcError } from './ipc-contract'

/** Whatever typed fields a candidate value happens to carry -- no fallback applied yet. */
interface PartialSerializedError {
  readonly name?: string
  readonly message?: string
  readonly code?: string
  readonly statusCode?: number
}

/**
 * Recovers a `SerializedIpcError` from any rejection a screen might see: a
 * real bridged `Error` (JSON embedded in `message`, per the above), a plain
 * `Error` with an ordinary message, or the plain `{name, message}`-shaped
 * object tests fake `window.api` rejections with directly (no real bridge
 * involved, so there is no JSON to unwrap). `name` is preserved whenever the
 * rejection carries one, even if it carries no usable `message` alongside it
 * -- `CredentialsRejectedException` is still identifiable by name alone.
 */
export function parseIpcError(error: unknown, fallbackMessage: string): SerializedIpcError {
  if (error instanceof Error) {
    const jsonStart = error.message.indexOf('{')
    const embedded = jsonStart === -1 ? null : extractFields(error.message.slice(jsonStart))
    if (embedded?.message !== undefined) {
      return {
        name: embedded.name ?? error.name,
        message: embedded.message,
        code: embedded.code,
        statusCode: embedded.statusCode
      }
    }
    // No usable JSON payload inside the message -- it is either an ordinary
    // Error (network failure, a bug) or JSON that parsed but did not carry
    // our shape, and either way the original message is the best text
    // available, not the caller's generic fallback.
    return {
      name: error.name,
      message: error.message.length > 0 ? error.message : fallbackMessage
    }
  }

  if (typeof error === 'object' && error !== null) {
    const fields = extractFields(error)
    if (fields.name !== undefined || fields.message !== undefined) {
      return {
        name: fields.name ?? 'Error',
        message: fields.message ?? fallbackMessage,
        code: fields.code,
        statusCode: fields.statusCode
      }
    }
  }

  return { name: 'Error', message: fallbackMessage }
}

/** `unknown` because this runs on both a raw JSON string and an already-parsed object. */
function extractFields(candidate: unknown): PartialSerializedError {
  const value = typeof candidate === 'string' ? tryJsonParse(candidate) : candidate
  if (typeof value !== 'object' || value === null) return {}

  return {
    name: readString(value, 'name'),
    message: readNonEmptyString(value, 'message'),
    code: readString(value, 'code'),
    statusCode: readNumber(value, 'statusCode')
  }
}

function readString(value: object, key: string): string | undefined {
  if (!(key in value)) return undefined
  const raw = (value as Record<string, unknown>)[key]
  return typeof raw === 'string' ? raw : undefined
}

function readNonEmptyString(value: object, key: string): string | undefined {
  const raw = readString(value, key)
  return raw !== undefined && raw.length > 0 ? raw : undefined
}

function readNumber(value: object, key: string): number | undefined {
  if (!(key in value)) return undefined
  const raw = (value as Record<string, unknown>)[key]
  return typeof raw === 'number' ? raw : undefined
}

function tryJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
