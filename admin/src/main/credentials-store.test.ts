import { describe, expect, it, vi } from 'vitest'
import {
  createCredentialsStore,
  type Credentials,
  type CredentialsFsLike,
  type SafeStorageLike
} from './credentials-store'

/**
 * Fakes standing in for the two things this module depends on: Electron's
 * `safeStorage` (OS keychain-backed encryption) and the filesystem. Neither
 * is real here — no disk write, no Electron runtime — which is the point:
 * the store's logic (validation, all-or-nothing reads, never logging the
 * password) is what is under test, not Node's fs or Electron's keychain.
 */
function fakeSafeStorage(available = true): SafeStorageLike & {
  isEncryptionAvailable: ReturnType<typeof vi.fn<() => boolean>>
  encryptString: ReturnType<typeof vi.fn<(plainText: string) => Buffer>>
  decryptString: ReturnType<typeof vi.fn<(encrypted: Buffer) => string>>
} {
  return {
    isEncryptionAvailable: vi.fn<() => boolean>(() => available),
    // A reversible, obviously-not-real "encryption": base64 with a marker
    // prefix. Good enough to prove the module round-trips through it (and
    // that the plain text never reaches disk unobscured), without needing
    // Electron's real keychain in the test process.
    encryptString: vi.fn<(plainText: string) => Buffer>((plainText) =>
      Buffer.from(`enc:${Buffer.from(plainText, 'utf-8').toString('base64')}`, 'utf-8')
    ),
    decryptString: vi.fn<(encrypted: Buffer) => string>((encrypted) => {
      const text = encrypted.toString('utf-8')
      if (!text.startsWith('enc:')) throw new Error('bad ciphertext')
      return Buffer.from(text.slice('enc:'.length), 'base64').toString('utf-8')
    })
  }
}

/** A `CredentialsFsLike` fake with no state — good for tests that only assert on call arguments. */
function fakeFs(overrides: Partial<CredentialsFsLike> = {}): CredentialsFsLike {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
    ...overrides
  }
}

/** A `CredentialsFsLike` fake backed by an in-memory Map — for tests that chain write/read/clear. */
function inMemoryFs(): CredentialsFsLike {
  const disk = new Map<string, Buffer>()
  return {
    readFile: vi.fn(async (path: string) => {
      const data = disk.get(path)
      if (!data) throw enoentError()
      return data
    }),
    writeFile: vi.fn(async (path: string, data: Buffer) => {
      disk.set(path, data)
    }),
    rm: vi.fn(async (path: string) => {
      disk.delete(path)
    })
  }
}

function enoentError(): NodeJS.ErrnoException {
  return Object.assign(new Error('no such file or directory'), { code: 'ENOENT' })
}

const FILE_PATH = '/fake/userData/credentials.enc'

const VALID_CREDENTIALS: Credentials = {
  name: 'Congregação Central',
  city: 'São Paulo',
  password: 'super-secret-pw'
}

describe('createCredentialsStore', () => {
  describe('write', () => {
    it('encrypts the credentials with safeStorage.encryptString before writing to disk', async () => {
      const safeStorage = fakeSafeStorage()
      const fs = fakeFs()
      const store = createCredentialsStore({ safeStorage, getFilePath: () => FILE_PATH, fs })

      await store.write(VALID_CREDENTIALS)

      expect(safeStorage.encryptString).toHaveBeenCalledTimes(1)
      const plainTextPassedToEncrypt = safeStorage.encryptString.mock.calls[0][0] as string
      expect(JSON.parse(plainTextPassedToEncrypt)).toEqual(VALID_CREDENTIALS)

      expect(fs.writeFile).toHaveBeenCalledTimes(1)
      const [writtenPath, writtenData] = vi.mocked(fs.writeFile).mock.calls[0]
      expect(writtenPath).toBe(FILE_PATH)
      // What actually hits disk must be the encrypted buffer, never plain text.
      expect(Buffer.isBuffer(writtenData)).toBe(true)
      expect((writtenData as Buffer).toString('utf-8')).not.toContain(VALID_CREDENTIALS.password)
    })

    it('throws instead of writing when encryption is not available on this device', async () => {
      const safeStorage = fakeSafeStorage(false)
      const fs = fakeFs()
      const store = createCredentialsStore({ safeStorage, getFilePath: () => FILE_PATH, fs })

      await expect(store.write(VALID_CREDENTIALS)).rejects.toThrow()
      expect(fs.writeFile).not.toHaveBeenCalled()
      expect(safeStorage.encryptString).not.toHaveBeenCalled()
    })
  })

  describe('read', () => {
    it('returns null when the file does not exist', async () => {
      const safeStorage = fakeSafeStorage()
      const fs = fakeFs({
        readFile: vi.fn(async () => {
          throw enoentError()
        })
      })
      const store = createCredentialsStore({ safeStorage, getFilePath: () => FILE_PATH, fs })

      await expect(store.read()).resolves.toBeNull()
    })

    it('returns the decoded credentials when everything is present and valid', async () => {
      const safeStorage = fakeSafeStorage()
      const encryptedOnDisk = safeStorage.encryptString(JSON.stringify(VALID_CREDENTIALS))
      const fs = fakeFs({ readFile: vi.fn(async () => encryptedOnDisk) })
      const store = createCredentialsStore({ safeStorage, getFilePath: () => FILE_PATH, fs })

      await expect(store.read()).resolves.toEqual(VALID_CREDENTIALS)
      expect(fs.readFile).toHaveBeenCalledWith(FILE_PATH)
    })

    it('returns null when the decrypted content is not valid JSON', async () => {
      const safeStorage = fakeSafeStorage()
      const notJson = safeStorage.encryptString('this is not json{{{')
      const fs = fakeFs({ readFile: vi.fn(async () => notJson) })
      const store = createCredentialsStore({ safeStorage, getFilePath: () => FILE_PATH, fs })

      await expect(store.read()).resolves.toBeNull()
    })

    it('returns null when the JSON is missing a required field (partial record)', async () => {
      const safeStorage = fakeSafeStorage()
      const partial = safeStorage.encryptString(
        JSON.stringify({ name: 'Congregação Central', city: 'São Paulo' })
      )
      const fs = fakeFs({ readFile: vi.fn(async () => partial) })
      const store = createCredentialsStore({ safeStorage, getFilePath: () => FILE_PATH, fs })

      await expect(store.read()).resolves.toBeNull()
    })

    it('returns null when the decrypted content is valid JSON but not an object (e.g. null)', async () => {
      const safeStorage = fakeSafeStorage()
      const nullJson = safeStorage.encryptString('null')
      const fs = fakeFs({ readFile: vi.fn(async () => nullJson) })
      const store = createCredentialsStore({ safeStorage, getFilePath: () => FILE_PATH, fs })

      await expect(store.read()).resolves.toBeNull()
    })
  })

  describe('clear', () => {
    it('removes the stored file so a subsequent read returns null', async () => {
      const safeStorage = fakeSafeStorage()
      const fs = fakeFs()
      const store = createCredentialsStore({ safeStorage, getFilePath: () => FILE_PATH, fs })

      await store.clear()

      expect(fs.rm).toHaveBeenCalledWith(FILE_PATH, expect.objectContaining({ force: true }))
    })

    it('does not throw when nothing was ever stored', async () => {
      const safeStorage = fakeSafeStorage()
      const fs = fakeFs({
        rm: vi.fn(async () => {
          throw enoentError()
        })
      })
      const store = createCredentialsStore({ safeStorage, getFilePath: () => FILE_PATH, fs })

      await expect(store.clear()).resolves.toBeUndefined()
    })

    it('behaves end to end: write, then clear, then read returns null', async () => {
      // In-memory filesystem, not a mock of individual calls — this
      // exercises write -> clear -> read as the real module would chain them.
      const safeStorage = fakeSafeStorage()
      const fs = inMemoryFs()
      const store = createCredentialsStore({ safeStorage, getFilePath: () => FILE_PATH, fs })

      await store.write(VALID_CREDENTIALS)
      await expect(store.read()).resolves.toEqual(VALID_CREDENTIALS)

      await store.clear()

      await expect(store.read()).resolves.toBeNull()
    })
  })

  describe('never logs the password', () => {
    it('does not log the password across write, read, and a failed write', async () => {
      const consoleMethods = ['log', 'warn', 'error', 'info', 'debug'] as const
      const consoleSpies = consoleMethods.map((method) =>
        vi.spyOn(console, method).mockImplementation(() => {})
      )

      const fs = inMemoryFs()
      const store = createCredentialsStore({
        safeStorage: fakeSafeStorage(),
        getFilePath: () => FILE_PATH,
        fs
      })

      await store.write(VALID_CREDENTIALS)
      await store.read()

      const unavailableStore = createCredentialsStore({
        safeStorage: fakeSafeStorage(false),
        getFilePath: () => FILE_PATH,
        fs
      })
      let thrown: Error | undefined
      try {
        await unavailableStore.write(VALID_CREDENTIALS)
      } catch (error) {
        thrown = error as Error
      }

      expect(thrown?.message).not.toContain(VALID_CREDENTIALS.password)

      for (const spy of consoleSpies) {
        for (const call of spy.mock.calls) {
          for (const arg of call) {
            expect(String(arg)).not.toContain(VALID_CREDENTIALS.password)
          }
        }
        spy.mockRestore()
      }
    })
  })
})
