/**
 * `App.tsx` is the only place the publisher's screens are actually wired
 * into `@react-navigation/native-stack`, and the only place session
 * restoration happens (spec 0005, Task 26). Every collaborator it touches --
 * `ApiClient`, `session-store.ts`, `territory-cache.ts` -- is injected via
 * the `dependencies` prop, the same "fake the injected collaborator"
 * approach `ActivationScreen.test.tsx` and `DashboardScreen.test.tsx` use,
 * so no test here ever touches the OS keychain, `AsyncStorage` or a real
 * `fetch`.
 *
 * Three native/ESM modules still have to load successfully just because
 * `App.tsx` imports them for its *default* dependencies (used when a test
 * does not override a given one) -- `react-native-config` (mocked the same
 * way `api-client.test.ts` mocks it, so `ApiErrorException`/`NetworkException`
 * stay the real classes App.tsx checks with `instanceof`), `react-native-keychain`
 * (automocked like `session-store.test.ts`) and
 * `@react-native-async-storage/async-storage` (mocked with the same in-memory
 * fake `territory-cache.test.ts` uses).
 */
jest.mock('react-native-config', () => ({
  __esModule: true,
  default: { API_BASE_URL: 'https://territory.example.test', APP_KEY: 'the-app-key' },
}))
jest.mock('react-native-keychain')
/** `MapScreen` generates a work-log id with `uuid`, which ships ESM-only. */
jest.mock('uuid', () => ({ v4: jest.fn(() => 'fake-uuid') }))
/**
 * `MapScreen` (Task 25, via `TerritoryMapView.tsx`) imports
 * `react-native-geolocation-service` for `watchPosition`/`clearWatch`. Its
 * `main` entry (`js/index.js`) ships ESM `import` syntax with no build step
 * of its own, which the project's `transformIgnorePatterns` doesn't cover --
 * there is no location hardware in a Jest process to talk to anyway, so this
 * stands in with the two methods `TerritoryMapView` actually calls.
 */
jest.mock('react-native-geolocation-service', () => ({
  __esModule: true,
  default: {
    watchPosition: jest.fn(() => 1),
    clearWatch: jest.fn(),
    requestAuthorization: jest.fn(),
  },
}))
/**
 * `TerritoryMapView.tsx` (Task 25) imports the real MapLibre native bridge,
 * which ships some of its TypeScript sources unbuilt inside its
 * "commonjs" output (native-component codegen specs meant for Metro, not a
 * plain `require`) -- Jest cannot parse those at all, mocking (rather than
 * transform-allowlisting) is the only option, and none of the four
 * navigation scenarios below ever mounts `MapScreen` in the first place, so
 * a trivial stand-in is enough for the module to import cleanly.
 */
jest.mock('@maplibre/maplibre-react-native', () => {
  const stubComponent = (name: string) => {
    function Stub(props: { children?: unknown }) {
      return props.children ?? null
    }
    Stub.displayName = name
    return Stub
  }
  return {
    __esModule: true,
    Camera: stubComponent('Camera'),
    GeoJSONSource: stubComponent('GeoJSONSource'),
    Layer: stubComponent('Layer'),
    Map: stubComponent('Map'),
    Marker: stubComponent('Marker'),
    RasterSource: stubComponent('RasterSource'),
    TransformRequestManager: { addHeader: jest.fn() },
  }
})
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {}
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => (key in store ? store[key] : null)),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key]
      }),
      clear: jest.fn(async () => {
        store = {}
      }),
    },
  }
})
/**
 * `ActivationScreen` (Task 22) builds its own `ApiClient` internally via
 * `createApiClient()` rather than taking one by prop -- it is not part of
 * this module's `AppDependencies`. The activation-flow test below needs to
 * control what that internal client's `activate` resolves to without ever
 * reaching a real `fetch`, so `createApiClient` itself is mocked here, real
 * exception classes and all other exports kept intact via `requireActual`
 * (the same "keep the real error hierarchy, fake the transport" split
 * `api-client.test.ts` relies on for `ApiErrorException`/`NetworkException`).
 */
jest.mock('../data/api-client', () => ({
  ...jest.requireActual('../data/api-client'),
  createApiClient: jest.fn(),
}))

import { fireEvent, render, screen } from '@testing-library/react-native'
import { ApiErrorException, NetworkException, createApiClient, type ApiClient } from '../data/api-client'
import type { Session, Territory } from '../domain/models'
import App, { withOfflineFallback } from './App'

const mockedCreateApiClient = jest.mocked(createApiClient)

const SESSION: Session = {
  token: 'app-token-abc123',
  user: { id: 'user-1', name: 'Ana' },
  congregation: { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' },
}

/** A fake covering every member of `ApiClient` -- same shape as `ActivationScreen.test.tsx`'s. */
function fakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    activate: jest.fn(),
    listTerritories: jest.fn().mockResolvedValue([]),
    listWorkedTerritories: jest.fn().mockResolvedValue([]),
    listWorkHistory: jest.fn().mockResolvedValue([]),
    markBlockWorked: jest.fn(),
    ...overrides,
  }
}

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return { id: 'territory-1', name: 'Setor 5', boundary: [], blocks: [], ...overrides }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('App', () => {
  it('opens the ActivationScreen when there is no saved session', async () => {
    const getSession = jest.fn().mockResolvedValue(null)

    await render(<App dependencies={{ getSession }} />)

    expect(await screen.findByLabelText('Código de acesso')).toBeTruthy()
  })

  it('with a saved session and a reachable server, skips straight to the Dashboard', async () => {
    const listTerritories = jest.fn().mockResolvedValue([])
    const apiClient = fakeApiClient({ listTerritories })
    const getSession = jest.fn().mockResolvedValue(SESSION)
    const saveTerritories = jest.fn().mockResolvedValue(undefined)

    await render(<App dependencies={{ apiClient, getSession, saveTerritories }} />)

    expect(await screen.findByText('Nenhuma quadra trabalhada ainda')).toBeTruthy()
    expect(screen.queryByLabelText('Código de acesso')).toBeNull()
    expect(listTerritories).toHaveBeenCalledWith(SESSION.token)
    expect(saveTerritories).toHaveBeenCalledWith([])
  })

  it('a saved session the server rejects clears it and returns to the ActivationScreen', async () => {
    const listTerritories = jest
      .fn()
      .mockRejectedValue(new ApiErrorException(401, 'invalid_token', 'token revoked'))
    const apiClient = fakeApiClient({ listTerritories })
    const getSession = jest.fn().mockResolvedValue(SESSION)
    const clearSession = jest.fn().mockResolvedValue(undefined)
    const clearCache = jest.fn().mockResolvedValue(undefined)

    await render(<App dependencies={{ apiClient, getSession, clearSession, clearCache }} />)

    expect(await screen.findByLabelText('Código de acesso')).toBeTruthy()
    expect(clearSession).toHaveBeenCalled()
    expect(clearCache).toHaveBeenCalled()
  })

  it('a saved session with no signal at launch opens the Dashboard anyway, using the cached territories', async () => {
    const cachedTerritory = makeTerritory({
      id: 'territory-cached',
      name: 'Setor 9',
      assignedUser: SESSION.user,
    })
    const listTerritories = jest.fn().mockRejectedValue(new NetworkException('sem sinal'))
    const apiClient = fakeApiClient({ listTerritories })
    const getSession = jest.fn().mockResolvedValue(SESSION)
    const getCachedTerritories = jest.fn().mockResolvedValue([cachedTerritory])
    const saveTerritories = jest.fn()
    const clearSession = jest.fn()
    const clearCache = jest.fn()

    await render(
      <App
        dependencies={{
          apiClient,
          getSession,
          getCachedTerritories,
          saveTerritories,
          clearSession,
          clearCache,
        }}
      />,
    )

    expect(await screen.findByText('Setor 9')).toBeTruthy()
    expect(screen.queryByLabelText('Código de acesso')).toBeNull()
    expect(clearSession).not.toHaveBeenCalled()
    expect(clearCache).not.toHaveBeenCalled()
    expect(saveTerritories).not.toHaveBeenCalled()
  })

  it('activating a code with no prior session navigates straight to the Dashboard', async () => {
    const getSession = jest.fn().mockResolvedValue(null)
    const activate = jest.fn().mockResolvedValue(SESSION)
    mockedCreateApiClient.mockReturnValue(fakeApiClient({ activate }))

    await render(<App dependencies={{ getSession }} />)
    await screen.findByLabelText('Código de acesso')

    await fireEvent.changeText(screen.getByLabelText('Código de acesso'), 'ABC123XY')
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText('Nenhuma quadra trabalhada ainda')).toBeTruthy()
    expect(activate).toHaveBeenCalledWith('ABC123XY')
  })

  it('tapping "Ver no mapa" on the Dashboard opens the MapScreen for that territory', async () => {
    const assignedTerritory = makeTerritory({
      id: 'territory-assigned',
      name: 'Setor 7',
      assignedUser: SESSION.user,
    })
    const listTerritories = jest.fn().mockResolvedValue([assignedTerritory])
    const apiClient = fakeApiClient({ listTerritories })
    const getSession = jest.fn().mockResolvedValue(SESSION)

    await render(<App dependencies={{ apiClient, getSession }} />)

    await fireEvent.press(await screen.findByText('Ver no mapa'))

    expect(await screen.findByText('© OpenStreetMap contributors')).toBeTruthy()
  })
})

describe('withOfflineFallback', () => {
  it('passes a successful listTerritories call through untouched', async () => {
    const territories = [makeTerritory()]
    const listTerritories = jest.fn().mockResolvedValue(territories)
    const apiClient = fakeApiClient({ listTerritories })
    const getCachedTerritories = jest.fn()

    const wrapped = withOfflineFallback(apiClient, getCachedTerritories)

    await expect(wrapped.listTerritories('token')).resolves.toBe(territories)
    expect(getCachedTerritories).not.toHaveBeenCalled()
  })

  it('falls back to the cached territories on a NetworkException', async () => {
    const cached = [makeTerritory({ name: 'Cached' })]
    const listTerritories = jest.fn().mockRejectedValue(new NetworkException('offline'))
    const apiClient = fakeApiClient({ listTerritories })
    const getCachedTerritories = jest.fn().mockResolvedValue(cached)

    const wrapped = withOfflineFallback(apiClient, getCachedTerritories)

    await expect(wrapped.listTerritories('token')).resolves.toBe(cached)
  })

  it('rethrows the NetworkException when there is no cache to fall back to', async () => {
    const networkError = new NetworkException('offline')
    const listTerritories = jest.fn().mockRejectedValue(networkError)
    const apiClient = fakeApiClient({ listTerritories })
    const getCachedTerritories = jest.fn().mockResolvedValue(null)

    const wrapped = withOfflineFallback(apiClient, getCachedTerritories)

    await expect(wrapped.listTerritories('token')).rejects.toBe(networkError)
  })

  it('never falls back for an ApiErrorException -- that is a real answer from the server, not a connectivity gap', async () => {
    const apiError = new ApiErrorException(403, 'territory_not_assigned', 'not assigned')
    const listTerritories = jest.fn().mockRejectedValue(apiError)
    const apiClient = fakeApiClient({ listTerritories })
    const getCachedTerritories = jest.fn()

    const wrapped = withOfflineFallback(apiClient, getCachedTerritories)

    await expect(wrapped.listTerritories('token')).rejects.toBe(apiError)
    expect(getCachedTerritories).not.toHaveBeenCalled()
  })
})
