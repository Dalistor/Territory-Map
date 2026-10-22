// Root navigation and session restoration (spec 0005, Task 26). The only
// place `ActivationScreen` (Task 22), `DashboardScreen` (Task 23) and
// `MapScreen` (Task 25) actually get wired into `@react-navigation/native-stack`
// -- each of those screens receives its callbacks/`onOpenMap` as a prop
// precisely so this is the one file that turns them into real navigation.
//
// On launch: no saved session means the publisher has never activated a
// code on this device, so `ActivationScreen` opens directly. A saved
// session is *not* trusted blindly -- it is checked against the server
// (`listTerritories`, the same call `DashboardScreen` needs anyway) because
// the AGENTS.md `token_version` mechanism can have revoked it on the
// backend (a new code redeemed on another device) since the last launch:
//   - the server confirms it (any 2xx) -> skip straight to the Dashboard,
//     and refresh the territory cache with the answer.
//   - the server rejects it (`ApiErrorException`, e.g. a stale
//     `token_version`) -> the token is genuinely dead: wipe the session and
//     the cache and fall back to `ActivationScreen`.
//   - the request never reached the server (`NetworkException`, no signal
//     at launch) -> the token might still be perfectly good, there is
//     simply no way to ask right now. Keep the session and open the
//     Dashboard anyway, via `withOfflineFallback` below, which is what
//     makes its `listTerritories` call fall back to the last cached answer
//     instead of failing the screen.
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  NativeModules,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import Config from 'react-native-config';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  ApiErrorException,
  NetworkException,
  createApiClient,
  type ApiClient,
} from '../data/api-client';
import { clearSession as clearSessionDefault, getSession as getSessionDefault } from '../data/session-store';
import {
  clearCache as clearCacheDefault,
  getCachedCampaigns as getCachedCampaignsDefault,
  getCachedTerritories as getCachedTerritoriesDefault,
  saveCampaigns as saveCampaignsDefault,
  saveTerritories as saveTerritoriesDefault,
} from '../data/territory-cache';
import { fetchLatestRelease as fetchLatestReleaseDefault } from '../data/update-client';
import {
  isUpdateAvailable,
  isUpdateMandatory,
  type AppRelease,
} from '../domain/appUpdate';
import type { Campaign, Session, Territory } from '../domain/models';
import ActivationScreen from './screens/ActivationScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { MapScreen } from './screens/MapScreen';
import { UpdateModal } from './components/UpdateModal';
import { colors } from './theme';

/** Every collaborator this component needs -- swappable for tests, one field at a time. */
export interface AppDependencies {
  readonly apiClient: ApiClient;
  readonly getSession: () => Promise<Session | null>;
  readonly clearSession: () => Promise<void>;
  readonly getCachedTerritories: () => Promise<Territory[] | null>;
  readonly saveTerritories: (territories: Territory[]) => Promise<void>;
  readonly getCachedCampaigns: () => Promise<Campaign[] | null>;
  readonly saveCampaigns: (campaigns: Campaign[]) => Promise<void>;
  readonly clearCache: () => Promise<void>;
  readonly checkForUpdates: () => Promise<AppRelease | null>;
  readonly getAppVersion: () => Promise<{ versionCode: number; versionName: string }>;
  readonly downloadAndInstall: (url: string, appKey: string) => Promise<boolean>;
}

export interface AppProps {
  /** Partial on purpose: a test overrides only what a given scenario touches, the rest defaults to the real module. */
  readonly dependencies?: Partial<AppDependencies>;
}

type RootStackParamList = {
  Activation: undefined;
  Dashboard: undefined;
  Map: { territoryId?: string; campaignId?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Runs `read` and, on a `NetworkException` only, answers with the last
 * cached value instead -- when there is one. Anything else, including an
 * `ApiErrorException` (a real answer from the server), is rethrown.
 */
async function readWithCacheFallback<T>(
  read: () => Promise<T>,
  getCached: () => Promise<T | null>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof NetworkException) {
      const cached = await getCached();
      if (cached !== null) return cached;
    }
    throw error;
  }
}

/**
 * Wraps `listTerritories` and `listCampaigns` so a `NetworkException` falls
 * back to the last cached answer instead of failing the caller --
 * `DashboardScreen` and `MapScreen` both call them on mount, and neither
 * knows (nor should need to know) about the cache; this is the one seam
 * where "no signal" gets absorbed before it reaches them. An
 * `ApiErrorException` is a real answer from the server, not a connectivity
 * gap, so it is never swallowed here.
 */
export function withOfflineFallback(
  apiClient: ApiClient,
  getCachedTerritories: () => Promise<Territory[] | null>,
  getCachedCampaigns: () => Promise<Campaign[] | null> = async () => null,
): ApiClient {
  return {
    ...apiClient,
    listTerritories: (token) =>
      readWithCacheFallback(() => apiClient.listTerritories(token), getCachedTerritories),
    listCampaigns: (token) =>
      readWithCacheFallback(() => apiClient.listCampaigns(token), getCachedCampaigns),
  };
}

/**
 * Refreshes the cached campaign list at launch. Best effort: the token was
 * already proven good by `listTerritories`, so a failure here (no signal
 * mid-launch, a server without the route yet) only means the campaigns stay
 * as last cached -- never a reason to drop the session.
 */
async function refreshCampaignCache(
  apiClient: ApiClient,
  token: string,
  saveCampaigns: (campaigns: Campaign[]) => Promise<void>,
): Promise<void> {
  try {
    await saveCampaigns(await apiClient.listCampaigns(token));
  } catch {
    // Kept as cached; see above.
  }
}

type BootstrapState =
  | { readonly status: 'loading' }
  | { readonly status: 'activation' }
  | { readonly status: 'dashboard'; readonly session: Session };

export default function App({ dependencies }: AppProps): React.JSX.Element {
  const deps = useMemo<AppDependencies>(
    () => ({
      apiClient: dependencies?.apiClient ?? createApiClient(),
      getSession: dependencies?.getSession ?? getSessionDefault,
      clearSession: dependencies?.clearSession ?? clearSessionDefault,
      getCachedTerritories: dependencies?.getCachedTerritories ?? getCachedTerritoriesDefault,
      saveTerritories: dependencies?.saveTerritories ?? saveTerritoriesDefault,
      getCachedCampaigns: dependencies?.getCachedCampaigns ?? getCachedCampaignsDefault,
      saveCampaigns: dependencies?.saveCampaigns ?? saveCampaignsDefault,
      clearCache: dependencies?.clearCache ?? clearCacheDefault,
      checkForUpdates:
        dependencies?.checkForUpdates ?? (() => fetchLatestReleaseDefault('app')),
      getAppVersion:
        dependencies?.getAppVersion ??
        (async () => {
          if (NativeModules.ApkInstaller?.getAppVersion) {
            return await NativeModules.ApkInstaller.getAppVersion();
          }
          return { versionCode: 1, versionName: '1.0.0' };
        }),
      downloadAndInstall:
        dependencies?.downloadAndInstall ??
        (async (url: string, key: string) => {
          if (NativeModules.ApkInstaller?.downloadAndInstall) {
            return await NativeModules.ApkInstaller.downloadAndInstall(url, key);
          }
          return false;
        }),
    }),
    [dependencies],
  );

  const [state, setState] = useState<BootstrapState>({ status: 'loading' });
  const [updateState, setUpdateState] = useState<{
    release: AppRelease | null;
    isMandatory: boolean;
    visible: boolean;
    downloading: boolean;
    downloadProgress: number;
    error: string | null;
  }>({
    release: null,
    isMandatory: false,
    visible: false,
    downloading: false,
    downloadProgress: 0,
    error: null,
  });

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onApkDownloadProgress', (event) => {
      if (typeof event?.progress === 'number') {
        setUpdateState((prev) => ({ ...prev, downloadProgress: event.progress }));
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      // Check updates in background without blocking bootstrap
      deps.checkForUpdates()
        .then(async (release) => {
          if (cancelled || !release) return;
          const localVersion = await deps.getAppVersion();
          if (isUpdateAvailable(localVersion.versionCode, release.versionCode)) {
            setUpdateState((prev) => ({
              ...prev,
              release,
              isMandatory: isUpdateMandatory(localVersion.versionCode, release.minVersionCode),
              visible: true,
            }));
          }
        })
        .catch(() => {
          // Never block user if update check fails
        });

      const session = await deps.getSession();
      if (session === null) {
        if (!cancelled) setState({ status: 'activation' });
        return;
      }

      try {
        const territories = await deps.apiClient.listTerritories(session.token);
        await deps.saveTerritories(territories);
        await refreshCampaignCache(deps.apiClient, session.token, deps.saveCampaigns);
        if (!cancelled) setState({ status: 'dashboard', session });
      } catch (error) {
        if (error instanceof ApiErrorException) {
          await deps.clearSession();
          await deps.clearCache();
          if (!cancelled) setState({ status: 'activation' });
        } else {
          // NetworkException (or anything else transport-shaped): the token
          // is not proven dead, only unreachable. Keep it and let the
          // offline-fallback client above absorb the missing round trip.
          if (!cancelled) setState({ status: 'dashboard', session });
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [deps]);

  const handleStartUpdate = async () => {
    if (!updateState.release) return;
    setUpdateState((prev) => ({ ...prev, downloading: true, downloadProgress: 0, error: null }));
    try {
      const baseUrl = (Config.API_BASE_URL ?? '').replace(/\/+$/, '');
      const rawUrl = updateState.release.downloadUrl;
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${baseUrl}${rawUrl}`;
      await deps.downloadAndInstall(fullUrl, Config.APP_KEY ?? '');
    } catch {
      setUpdateState((prev) => ({
        ...prev,
        downloading: false,
        error: 'Erro ao baixar ou iniciar a instalação da atualização.',
      }));
    }
  };

  const offlineApiClient = useMemo(
    () => withOfflineFallback(deps.apiClient, deps.getCachedTerritories, deps.getCachedCampaigns),
    [deps],
  );

  if (state.status === 'loading') {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.onPrimary,
            headerTitleStyle: { fontWeight: '600' },
            // The blue header extends under the (translucent) status bar, so
            // its icons must flip to light there; the header-less Activation
            // screen keeps the global dark-content set above.
            statusBarStyle: 'light',
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          {state.status === 'activation' ? (
            <Stack.Screen
              name="Activation"
              options={{ headerShown: false, statusBarStyle: 'dark' }}
            >
              {() => (
                <ActivationScreen
                  onActivated={(session) => setState({ status: 'dashboard', session })}
                />
              )}
            </Stack.Screen>
          ) : (
            <>
              <Stack.Screen name="Dashboard" options={{ title: 'Meus territórios' }}>
                {({ navigation }) => (
                  <DashboardScreen
                    session={state.session}
                    apiClient={offlineApiClient}
                    onOpenMap={(territory) =>
                      navigation.navigate('Map', { territoryId: territory.id })
                    }
                    onOpenFullMap={() => navigation.navigate('Map', {})}
                    onOpenCampaign={(campaign) =>
                      navigation.navigate('Map', { campaignId: campaign.id })
                    }
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="Map" options={{ title: 'Mapa' }}>
                {({ route }) => (
                  <MapScreen
                    session={state.session}
                    apiClient={offlineApiClient}
                    initialTerritoryId={route.params?.territoryId}
                    initialCampaignId={route.params?.campaignId}
                  />
                )}
              </Stack.Screen>
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <UpdateModal
        visible={updateState.visible}
        release={updateState.release}
        isMandatory={updateState.isMandatory}
        downloading={updateState.downloading}
        downloadProgress={updateState.downloadProgress}
        error={updateState.error}
        onUpdate={handleStartUpdate}
        onDismiss={() => setUpdateState((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
