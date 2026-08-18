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
// the CLAUDE.md `token_version` mechanism can have revoked it on the
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
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
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
  getCachedTerritories as getCachedTerritoriesDefault,
  saveTerritories as saveTerritoriesDefault,
} from '../data/territory-cache';
import type { Session, Territory } from '../domain/models';
import ActivationScreen from './screens/ActivationScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { MapScreen } from './screens/MapScreen';
import { colors } from './theme';

/** Every collaborator this component needs -- swappable for tests, one field at a time. */
export interface AppDependencies {
  readonly apiClient: ApiClient;
  readonly getSession: () => Promise<Session | null>;
  readonly clearSession: () => Promise<void>;
  readonly getCachedTerritories: () => Promise<Territory[] | null>;
  readonly saveTerritories: (territories: Territory[]) => Promise<void>;
  readonly clearCache: () => Promise<void>;
}

export interface AppProps {
  /** Partial on purpose: a test overrides only what a given scenario touches, the rest defaults to the real module. */
  readonly dependencies?: Partial<AppDependencies>;
}

type RootStackParamList = {
  Activation: undefined;
  Dashboard: undefined;
  Map: { territoryId?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Wraps `listTerritories` so a `NetworkException` falls back to the last
 * cached answer instead of failing the caller -- `DashboardScreen` and
 * `MapScreen` both call `listTerritories` on mount, and neither knows (nor
 * should need to know) about the cache; this is the one seam where "no
 * signal" gets absorbed before it reaches them. An `ApiErrorException` is a
 * real answer from the server, not a connectivity gap, so it is never
 * swallowed here.
 */
export function withOfflineFallback(
  apiClient: ApiClient,
  getCachedTerritories: () => Promise<Territory[] | null>,
): ApiClient {
  return {
    ...apiClient,
    async listTerritories(token) {
      try {
        return await apiClient.listTerritories(token);
      } catch (error) {
        if (error instanceof NetworkException) {
          const cached = await getCachedTerritories();
          if (cached !== null) return cached;
        }
        throw error;
      }
    },
  };
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
      clearCache: dependencies?.clearCache ?? clearCacheDefault,
    }),
    [dependencies],
  );

  const [state, setState] = useState<BootstrapState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      const session = await deps.getSession();
      if (session === null) {
        if (!cancelled) setState({ status: 'activation' });
        return;
      }

      try {
        const territories = await deps.apiClient.listTerritories(session.token);
        await deps.saveTerritories(territories);
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

  const offlineApiClient = useMemo(
    () => withOfflineFallback(deps.apiClient, deps.getCachedTerritories),
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
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="Map" options={{ title: 'Mapa' }}>
                {({ route }) => (
                  <MapScreen
                    session={state.session}
                    apiClient={offlineApiClient}
                    initialTerritoryId={route.params?.territoryId}
                  />
                )}
              </Stack.Screen>
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
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
