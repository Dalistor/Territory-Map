/**
 * Where the admin's credentials live between runs.
 *
 * The app logs in on its own, so it has to keep the password itself and not
 * just a token — the admin JWT lasts twelve hours and something has to renew
 * it without asking. That is the price of never showing a login screen, and
 * it is why this goes through `safeStorage` (backed by the OS keychain —
 * DPAPI on Windows, Keychain on macOS, libsecret on Linux) instead of a
 * plain JSON file on disk.
 *
 * Nothing here is ever logged, not even in an error message.
 */

import * as nodeFs from 'node:fs/promises'

export interface Credentials {
  readonly name: string
  readonly city: string
  readonly password: string
}

/** The subset of Electron's `safeStorage` this module needs, injectable for tests. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

/** The subset of `node:fs/promises` this module needs, injectable for tests. */
export interface CredentialsFsLike {
  readFile(path: string): Promise<Buffer>
  writeFile(path: string, data: Buffer): Promise<void>
  rm(path: string, options?: { force?: boolean }): Promise<void>
}

export interface CreateCredentialsStoreOptions {
  safeStorage: SafeStorageLike
  getFilePath: () => string
  fs?: CredentialsFsLike
}

export interface CredentialsStore {
  read(): Promise<Credentials | null>
  write(credentials: Credentials): Promise<void>
  clear(): Promise<void>
}

function isCredentials(value: unknown): value is Credentials {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.name === 'string' &&
    typeof record.city === 'string' &&
    typeof record.password === 'string'
  )
}

export function createCredentialsStore(options: CreateCredentialsStoreOptions): CredentialsStore {
  const { safeStorage, getFilePath, fs = nodeFs } = options

  return {
    async write(credentials: Credentials): Promise<void> {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          'Encryption is not available on this device (OS keychain unreachable) — refusing to store credentials in plain text.'
        )
      }
      const plainText = JSON.stringify(credentials)
      const encrypted = safeStorage.encryptString(plainText)
      await fs.writeFile(getFilePath(), encrypted)
    },

    async read(): Promise<Credentials | null> {
      let encrypted: Buffer
      try {
        encrypted = await fs.readFile(getFilePath())
      } catch {
        // Most commonly ENOENT (never configured yet). Any other read
        // failure is treated the same way: no readable credentials means
        // the admin has to configure again, not crash.
        return null
      }

      const plainText = safeStorage.decryptString(encrypted)
      let parsed: unknown
      try {
        parsed = JSON.parse(plainText)
      } catch {
        // Corrupted/truncated file. All-or-nothing, same as a missing field:
        // a broken record does not count as configured.
        return null
      }
      return isCredentials(parsed) ? parsed : null
    },

    async clear(): Promise<void> {
      try {
        // `force: true` already makes Node's own fs.rm a no-op instead of
        // throwing on a missing path; injected fakes are expected to honor
        // the same contract. The surrounding try/catch is the safety net for
        // fakes (or real filesystem errors) that do not.
        await fs.rm(getFilePath(), { force: true })
      } catch {
        // Nothing was stored, or removal failed for some other reason —
        // either way `clear` must not throw: the caller's intent (no
        // credentials left) is already satisfied or unrecoverable.
      }
    }
  }
}
