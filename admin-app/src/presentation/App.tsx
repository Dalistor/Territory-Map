// The navigation root of the admin app (spec 0012, Task 08): the one place
// that decides, on launch, between the setup screen and the app proper, and
// the only file that wires a screen into `@react-navigation/native-stack`.
//
// Three things happen here and nowhere else:
//
//   1. **Bootstrap.** `session.isConfigured()` is asked once on mount. Until
//      it answers, only a loading state shows -- rendering either screen on a
//      guess would flash the wrong one on every launch, and the wrong one is
//      a credential form on a phone that already has credentials.
//   2. **Sign-out.** Confirmed through an `Alert` whose text says both what
//      is destroyed (this phone's saved credentials) and what is not
//      (everything on the server), then `session.signOut()` and back to setup.
//   3. **Credential recovery.** The session throws `CredentialsRejectedError`
//      when the saved credentials stop being accepted -- the password changed
//      on the server. No screen can do anything about that, so the session
//      handed to the screens is wrapped (`withCredentialsGuard`) and the app
//      returns to setup with the explanation instead of leaving the admin on
//      a screen whose every request will fail.
//
// The session and the API client are props with real defaults, because
// `index.js` mounts this component with none: `AppRegistry.registerComponent`
// passes nothing. Tests pass fakes and never reach the keystore or the network.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  NativeModules,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Config from 'react-native-config';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { createApiClient } from '../data/api-client';
import type { ApiClient } from '../data/api-client';
import { CredentialsRejectedError, createSession, credentialsStore } from '../data/session';
import type { Session } from '../data/session';
import { fetchLatestRelease as fetchLatestReleaseDefault } from '../data/update-client';
import {
  isUpdateAvailable,
  isUpdateMandatory,
  type AppRelease,
} from '../domain/appUpdate';
import DesignationsScreen from './screens/DesignationsScreen';
import PublishersScreen from './screens/PublishersScreen';
import PublisherHistoryScreen from './screens/PublisherHistoryScreen';
import HistoryScreen from './screens/HistoryScreen';
import TerritoryDetailScreen from './screens/TerritoryDetailScreen';
import SetupScreen from './screens/SetupScreen';
import TabIcon, { type TabIconName } from './components/TabIcon';
import { UpdateModal } from './components/UpdateModal';
import { colors, radius, spacing } from './theme';

export interface AppProps {
  /**
   * Optional because `index.js` mounts this component with no props at all
   * (`AppRegistry.registerComponent(appName, () => App)`); a test passes a
   * fake instead of reaching the keystore and the network.
   */
  readonly session?: Session;
  /**
   * The very client the session holds the token of -- screens must use this
   * one, not a fresh `createApiClient()`, or their requests would go out
   * unauthenticated.
   */
  readonly api?: ApiClient;
  /**
   * The app proper -- `DesignationsScreen` by default. Injected so a test can
   * drive whatever a screen does to the session (and observe what escapes it)
   * without standing up the real screen's collaborators.
   */
  readonly renderDesignations?: (props: DesignationsSlotProps) => React.JSX.Element;
  readonly checkForUpdates?: () => Promise<AppRelease | null>;
  readonly getAppVersion?: () => Promise<{ versionCode: number; versionName: string }>;
  readonly downloadAndInstall?: (url: string, appKey: string) => Promise<boolean>;
}

const defaultCheckForUpdates = () => fetchLatestReleaseDefault('admin-app');
const defaultGetAppVersion = async () => {
  if (NativeModules.ApkInstaller?.getAppVersion) {
    return NativeModules.ApkInstaller.getAppVersion();
  }
  return { versionCode: 1, versionName: '1.0.0' };
};
const defaultDownloadAndInstall = async (url: string, appKey: string) => {
  if (NativeModules.ApkInstaller?.downloadAndInstall) {
    return NativeModules.ApkInstaller.downloadAndInstall(url, appKey);
  }
  return false;
};

interface UpdateState {
  readonly visible: boolean;
  readonly release: AppRelease | null;
  readonly isMandatory: boolean;
  readonly downloading: boolean;
  readonly downloadProgress: number;
  readonly error: string | null;
}

const initialUpdateState: UpdateState = {
  visible: false,
  release: null,
  isMandatory: false,
  downloading: false,
  downloadProgress: 0,
  error: null,
};

/** What `App` hands the screen it renders once the phone is configured. */
export interface DesignationsSlotProps {
  /** Guarded: a `CredentialsRejectedError` escaping `run` sends the app back to setup. */
  readonly session: Session;
  readonly api: ApiClient;
  /** Opens the territory route while leaving the tab mounted behind it. */
  readonly onOpenTerritory?: (territoryId: string) => void;
}

/**
 * Built once per mount, never per render: `createApiClient` owns the token
 * `session` sets on it, so rebuilding either would throw away the sign-in.
 */
function useDefaultDependencies(
  session?: Session,
  api?: ApiClient,
): { readonly session: Session; readonly api: ApiClient } {
  return useMemo(() => {
    const client = api ?? createApiClient();
    return {
      api: client,
      session: session ?? createSession({ api: client, store: credentialsStore }),
    };
  }, [api, session]);
}

type RootState =
  | { readonly status: 'loading' }
  /** `reason` is why the admin is looking at this screen again, when he did not ask to. */
  | { readonly status: 'setup'; readonly reason?: string }
  | { readonly status: 'main' };

export type RootStackParamList = {
  MainTabs: undefined;
  TerritoryDetail: { readonly territoryId: string };
  PublisherDetail: { readonly publisherId: string; readonly publisherName: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export type PrimaryTabParamList = {
  Territories: undefined;
  Publishers: undefined;
  History: undefined;
};

const Tabs = createBottomTabNavigator<PrimaryTabParamList>();

/**
 * Navigation gets the same semantic palette as the screens. Keeping it here
 * prevents React Navigation from silently falling back to its blue defaults
 * when a new stack screen is registered in a later task.
 */
const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.danger,
  },
};

/**
 * Spells out both halves of what signing out does: what disappears (the
 * credentials this phone holds) and what does not (everything on the server).
 * Same promise the desktop's `App.tsx` makes, with "computador" swapped for
 * the phone in hand -- the admin has to be able to tell "I am leaving this
 * device" apart from "I am erasing the congregation".
 */
const SIGN_OUT_CONFIRM_MESSAGE =
  'Os dados salvos neste aparelho serão apagados. Nada é removido do servidor: os territórios, ' +
  'as quadras, as designações e o histórico continuam lá. Para usar este aparelho de novo, será ' +
  'preciso digitar o nome, a cidade e a senha da congregação outra vez.';

const SIGN_OUT_FAILED_MESSAGE =
  'Não foi possível sair da congregação: os dados continuam guardados neste aparelho. Tente de novo.';

/**
 * The keystore itself failing to answer -- corrupted entry, device policy,
 * anything. The app cannot know whether it is configured, and guessing "yes"
 * would land the admin on a screen whose every request is about to fail, so it
 * asks for the credentials again and says why.
 */
const STORAGE_READ_ERROR_MESSAGE =
  'Não foi possível ler os dados guardados neste aparelho. Informe o nome, a cidade e a senha da ' +
  'congregação de novo.';

/**
 * Shown when the credentials this phone kept stop working mid-use. The cause
 * that matters is named out loud: retyping the same password would just fail
 * again, so the admin needs to know to go find the new one.
 */
const CREDENTIALS_REJECTED_MESSAGE =
  'O servidor não aceitou as credenciais guardadas neste aparelho. A senha da congregação ' +
  'provavelmente mudou: digite nome, cidade e senha de novo.';

/**
 * Wraps a session so that a `CredentialsRejectedError` -- the one failure no
 * screen can do anything about -- is reported upwards before it reaches the
 * screen. It is still rethrown: the screen has its own loading state to close
 * and its own way of showing what happened, and swallowing the error here
 * would leave it spinning forever.
 *
 * Only `run` is wrapped. `configure` deliberately never throws this error (see
 * `data/session.ts`), and `signOut`/`isConfigured` do not authenticate.
 */
export function withCredentialsGuard(
  session: Session,
  onRejected: (error: CredentialsRejectedError) => void,
): Session {
  return {
    isConfigured: () => session.isConfigured(),
    configure: credentials => session.configure(credentials),
    signOut: () => session.signOut(),
    get congregation() {
      return session.congregation;
    },
    async run(action) {
      try {
        return await session.run(action);
      } catch (error) {
        if (error instanceof CredentialsRejectedError) onRejected(error);
        throw error;
      }
    },
  };
}

export default function App(props: AppProps): React.JSX.Element {
  const { session, api } = useDefaultDependencies(props.session, props.api);
  const renderDesignations = props.renderDesignations ?? renderDesignationsScreen;
  const checkForUpdates = props.checkForUpdates ?? defaultCheckForUpdates;
  const getAppVersion = props.getAppVersion ?? defaultGetAppVersion;
  const downloadAndInstall = props.downloadAndInstall ?? defaultDownloadAndInstall;

  const [state, setState] = useState<RootState>({ status: 'loading' });
  const [updateState, setUpdateState] = useState<UpdateState>(initialUpdateState);

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

    async function boot(): Promise<void> {
      // Background check for updates without delaying bootstrap
      checkForUpdates()
        .then(async (release) => {
          if (cancelled || !release) return;
          const localVersion = await getAppVersion();
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

      let configured: boolean;
      try {
        configured = await session.isConfigured();
      } catch {
        if (!cancelled) setState({ status: 'setup', reason: STORAGE_READ_ERROR_MESSAGE });
        return;
      }
      if (!cancelled) setState({ status: configured ? 'main' : 'setup' });
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [session, checkForUpdates, getAppVersion]);

  const handleStartUpdate = async () => {
    if (!updateState.release) return;
    setUpdateState((prev) => ({ ...prev, downloading: true, downloadProgress: 0, error: null }));
    try {
      const baseUrl = (Config.API_BASE_URL ?? '').replace(/\/+$/, '');
      const rawUrl = updateState.release.downloadUrl;
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${baseUrl}${rawUrl}`;
      await downloadAndInstall(fullUrl, Config.APP_KEY ?? '');
    } catch {
      setUpdateState((prev) => ({
        ...prev,
        downloading: false,
        error: 'Erro ao baixar ou iniciar a instalação da atualização.',
      }));
    }
  };

  const signOut = useCallback((): void => {
    session
      .signOut()
      .then(() => setState({ status: 'setup' }))
      .catch(() => {
        // The credentials are still on the phone, so claiming otherwise (by
        // moving to setup) would be a lie the next launch exposes.
        Alert.alert('Sair da congregação', SIGN_OUT_FAILED_MESSAGE);
      });
  }, [session]);

  /**
   * Destroying this phone's credentials deserves a beat, so it goes through an
   * `Alert` first. Only the confirming button reaches `signOut`.
   */
  const confirmSignOut = useCallback((): void => {
    Alert.alert('Sair da congregação', SIGN_OUT_CONFIRM_MESSAGE, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ]);
  }, [signOut]);

  const guardedSession = useMemo(
    () =>
      withCredentialsGuard(session, () =>
        setState({ status: 'setup', reason: CREDENTIALS_REJECTED_MESSAGE }),
      ),
    [session],
  );

  if (state.status === 'loading') {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <View style={styles.centered}>
          <ActivityIndicator
            accessibilityRole="progressbar"
            accessibilityLabel="Carregando"
            color={colors.primary}
            size="large"
          />
        </View>
      </SafeAreaProvider>
    );
  }

  if (state.status === 'setup') {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        {/* `configure` has just signed in and saved the credentials, so the
            app is configured by definition -- moving on from here, rather than
            asking the keystore again, is what makes it a transition instead of
            a relaunch. */}
        <SetupScreen
          session={session}
          reason={state.reason}
          onConfigured={() => setState({ status: 'main' })}
        />
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

  return (
    <SafeAreaProvider>
      {/* The blue header runs under the translucent status bar, so its icons
          flip to light there (`statusBarStyle` below); the header-less setup
          and loading states keep the dark icons set above. */}
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.onPrimary,
            headerTitleStyle: { fontWeight: '600' },
            statusBarStyle: 'light',
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="MainTabs" options={{ headerShown: false }}>
            {() => (
              <PrimaryTabs
                api={api}
                onSignOut={confirmSignOut}
                renderDesignations={renderDesignations}
                session={guardedSession}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="TerritoryDetail" options={{ title: 'Território' }}>
            {({ navigation, route }) => (
              <TerritoryDetailScreen
                territoryId={route.params.territoryId}
                api={api}
                session={guardedSession}
                onTerritoryRemoved={() => navigation.goBack()}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="PublisherDetail" options={{ title: 'Histórico de territórios' }}>
            {({ route }) => (
              <PublisherHistoryScreen
                api={api}
                publisher={{ id: route.params.publisherId, name: route.params.publisherName }}
                session={guardedSession}
              />
            )}
          </Stack.Screen>
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

interface PrimaryTabsProps {
  readonly session: Session;
  readonly api: ApiClient;
  readonly onSignOut: () => void;
  readonly renderDesignations: (props: DesignationsSlotProps) => React.JSX.Element;
}

/**
 * The three destinations deliberately live under one tab navigator. Future
 * consultation screens replace their own placeholders without changing the
 * application's setup/sign-out boundary or the detail stack above it.
 */
function PrimaryTabs({ api, onSignOut, renderDesignations, session }: PrimaryTabsProps): React.JSX.Element {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
        headerTitleStyle: { fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarActiveBackgroundColor: colors.primaryLight,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          minHeight: 64,
          paddingTop: spacing.xs,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarItemStyle: { borderRadius: radius.sm, marginHorizontal: spacing.xs },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="Territories" options={primaryTabOptions('Territórios', 'territories', onSignOut)}>
        {({ navigation }) => renderDesignations({
          session,
          api,
          onOpenTerritory: territoryId =>
            navigation.getParent()?.navigate('TerritoryDetail', { territoryId }),
        })}
      </Tabs.Screen>
      <Tabs.Screen name="Publishers" options={primaryTabOptions('Publicadores', 'publishers', onSignOut)}>
        {({ navigation }) => (
          <PublishersScreen
            api={api}
            session={session}
            onOpenPublisher={publisher => {
              navigation.getParent()?.navigate('PublisherDetail', {
                publisherId: publisher.id,
                publisherName: publisher.name,
              });
            }}
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="History" options={primaryTabOptions('Histórico', 'history', onSignOut)}>
        {() => <HistoryScreen api={api} session={session} />}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

/**
 * Built outside `App` on purpose: an inline `headerRight` would be a new
 * component type on every render, which React Navigation would remount each
 * time (and which `react/no-unstable-nested-components` flags).
 */
function primaryTabOptions(
  title: string,
  icon: TabIconName,
  onSignOut: () => void,
): BottomTabNavigationOptions {
  return {
    title,
    tabBarLabel: title,
    tabBarIcon: ({ color, size, focused }) => (
      <TabIcon name={icon} color={color} size={size} focused={focused} />
    ),
    headerRight: () => <SignOutButton onPress={onSignOut} />,
  };
}

/** The sign-out affordance, in the header so it is reachable from the app's home. */
function SignOutButton({ onPress }: { readonly onPress: () => void }): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sair da congregação"
      onPress={onPress}
      style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
    >
      <Text style={styles.signOutLabel}>Sair</Text>
    </Pressable>
  );
}

/**
 * The app's home, once this phone is configured. Declared at module level, not
 * inline: an arrow in the JSX would be a new component type on every render,
 * remounting the screen (and re-fetching everything) on each one.
 *
 * It gets the *guarded* session, so a rejected credential surfacing anywhere
 * inside it -- the panel, the block list -- still sends the app back to setup.
 */
function renderDesignationsScreen({
  session,
  api,
  onOpenTerritory,
}: DesignationsSlotProps): React.JSX.Element {
  return <DesignationsScreen session={session} api={api} onOpenTerritory={onOpenTerritory} />;
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  signOut: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  signOutLabel: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  signOutPressed: {
    opacity: 0.6,
  },
});
