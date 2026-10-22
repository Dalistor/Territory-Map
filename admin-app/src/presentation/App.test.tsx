/**
 * `App.tsx` is the only place the admin app's screens get wired into
 * `@react-navigation/native-stack`, and the only place the "is this phone
 * configured?" question is asked. Its one collaborator -- the `Session` of
 * `data/session.ts` -- is injected as a prop, so no test here ever reaches the
 * Android keystore or a real `fetch`.
 */
import React from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ApiError } from '../data/api-client';
import type { ApiClient } from '../data/api-client';
import type { Congregation, Territory } from '../domain/models';
import { CredentialsRejectedError } from '../data/session';
import type { Session } from '../data/session';
import App, { withCredentialsGuard } from './App';
import type { DesignationsSlotProps } from './App';
import { NO_TERRITORIES_MESSAGE } from './screens/DesignationsScreen';

/**
 * How this file recognises that the app landed on its home screen. It is the
 * empty-congregation message of `DesignationsScreen`, which the fake API below
 * always produces -- the native-stack header title is not usable for this,
 * since under Jest the header is a config node with a `title` prop rather than
 * rendered text.
 */
const DESIGNATIONS_TEXT = NO_TERRITORIES_MESSAGE;

/**
 * The API client `App` hands its screens. Only the one call the designations
 * screen makes on mount is implemented: this file is about navigation, and the
 * screen has its own test file for everything else. Passing it is what keeps
 * these tests off the network -- the default is a real `createApiClient()`.
 */
function makeApi(): ApiClient {
  return {
    listTerritoriesWithBlocks: jest.fn(async (): Promise<Territory[]> => []),
    listPublishers: jest.fn(async () => []),
    listCampaigns: jest.fn(async () => []),
  } as unknown as ApiClient;
}

const CONGREGATION: Congregation = {
  id: 'cong-1',
  name: 'Congregação Central',
  city: 'São Paulo',
};

/** Every member of `Session`, faked; a test overrides only what it exercises. */
function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    isConfigured: jest.fn(async () => false),
    configure: jest.fn(async () => CONGREGATION),
    run: jest.fn(async <T,>(action: () => Promise<T>) => action()),
    signOut: jest.fn(async () => undefined),
    congregation: null,
    ...overrides,
  };
}

/** Fills the three credential fields of `SetupScreen`, so its button enables. */
async function fillSetupForm(): Promise<void> {
  await fireEvent.changeText(
    screen.getByLabelText('Nome da congregação'),
    CONGREGATION.name,
  );
  await fireEvent.changeText(screen.getByLabelText('Cidade'), CONGREGATION.city);
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-secreta-123');
}

/**
 * Stands in for `DesignationsScreen` (Task 10): a screen that does the one
 * thing every screen of this app does -- run something through the session --
 * so what escapes that call can be observed here. Whatever the real screen
 * ends up doing, this is the seam it will reach `App` through.
 */
function fakeDesignations({ session }: DesignationsSlotProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Carregar"
      onPress={() => {
        // The real screen shows the failure its own way; swallowing it here
        // proves `App` reacts to the error passing through, not to the screen
        // reporting it.
        session.run(async () => 'carregado').catch(() => undefined);
      }}
    >
      <Text>Designações (placeholder de teste)</Text>
    </Pressable>
  );
}

interface AlertButtonLike {
  readonly text?: string;
  readonly style?: string;
  readonly onPress?: () => void;
}

/**
 * `Alert` is a native module: under Jest it draws nothing, so the confirmation
 * is inspected as the call it is -- message and buttons -- and "the admin
 * tapped yes/no" is that button's `onPress` being invoked. Same approach
 * `AssignmentPanel.test.tsx` takes.
 */
function lastAlert(): { message: string; buttons: AlertButtonLike[] } {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const call = calls[calls.length - 1];
  return { message: String(call[1]), buttons: (call[2] ?? []) as AlertButtonLike[] };
}

async function pressAlertButton(pick: (button: AlertButtonLike) => boolean): Promise<void> {
  const button = lastAlert().buttons.find(pick);
  expect(button).toBeDefined();
  await act(async () => {
    button?.onPress?.();
  });
}

const confirmLastAlert = (): Promise<void> => pressAlertButton(button => button.style !== 'cancel');
const cancelLastAlert = (): Promise<void> => pressAlertButton(button => button.style === 'cancel');

function signOutButton() {
  return screen.getByRole('button', { name: 'Sair da congregação' });
}

describe('App', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows only the loading state while isConfigured has not answered yet', async () => {
    // A question held open on purpose: the split second before the keystore
    // answers is exactly when the wrong screen would flash.
    const session = makeSession({ isConfigured: jest.fn(() => new Promise<boolean>(() => {})) });

    await render(<App session={session} api={makeApi()} />);

    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Nome da congregação')).not.toBeOnTheScreen();
    expect(screen.queryByText(DESIGNATIONS_TEXT)).not.toBeOnTheScreen();
  });

  it('opens the setup screen when nothing is configured on this phone', async () => {
    const session = makeSession({ isConfigured: jest.fn(async () => false) });

    await render(<App session={session} api={makeApi()} />);

    expect(await screen.findByLabelText('Nome da congregação')).toBeOnTheScreen();
    expect(screen.queryByText(DESIGNATIONS_TEXT)).not.toBeOnTheScreen();
  });

  it('goes straight to the designations screen when the phone is already configured', async () => {
    const session = makeSession({ isConfigured: jest.fn(async () => true) });

    await render(<App session={session} api={makeApi()} />);

    expect(await screen.findByText(DESIGNATIONS_TEXT)).toBeOnTheScreen();
    // Never a flash of the credential form on a phone that has credentials.
    expect(screen.queryByLabelText('Nome da congregação')).not.toBeOnTheScreen();
  });

  it('offers the four primary destinations and keeps the current session while switching tabs', async () => {
    const session = makeSession({ isConfigured: jest.fn(async () => true) });

    await render(<App session={session} api={makeApi()} />);
    await screen.findByText(DESIGNATIONS_TEXT);

    await fireEvent.press(screen.getByLabelText('Publicadores, tab, 2 of 4'));
    expect(await screen.findByLabelText('Buscar publicadores')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Campanhas, tab, 3 of 4'));
    expect(await screen.findByText('Nenhuma campanha cadastrada')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Histórico, tab, 4 of 4'));
    expect(await screen.findByRole('header', { name: 'Histórico completo' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Territórios, tab, 1 of 4'));
    expect(await screen.findByText(DESIGNATIONS_TEXT)).toBeOnTheScreen();
    expect(session.isConfigured).toHaveBeenCalledTimes(1);
  });

  it('renders a local, labelled icon for each primary tab', async () => {
    const session = makeSession({ isConfigured: jest.fn(async () => true) });

    await render(<App session={session} api={makeApi()} />);
    await screen.findByText(DESIGNATIONS_TEXT);

    const expectIcon = (name: string, label: string): void => {
      const icons = screen.getAllByTestId(`tab-icon-${name}`);
      expect(icons).not.toHaveLength(0);
      expect(icons.some(icon => icon.props.accessibilityLabel === label)).toBe(true);
    };

    expectIcon('territories', 'Ícone de Territórios');
    expectIcon('publishers', 'Ícone de Publicadores');
    expectIcon('campaigns', 'Ícone de Campanhas');
    expectIcon('history', 'Ícone de Histórico');
  });

  it('opens the selected territory in the stack detail instead of a placeholder', async () => {
    const session = makeSession({ isConfigured: jest.fn(async () => true) });
    const api = {
      ...makeApi(),
      getTerritory: jest.fn(async () => ({
        id: 'territory-1', name: 'Centro - N1', boundary: [], assignedPublisher: null,
        rotationDays: null, blocks: [],
      })),
      listAssignments: jest.fn(async () => []),
    } as ApiClient;
    const openDetail = (props: DesignationsSlotProps): React.JSX.Element => {
      const detail = props as DesignationsSlotProps & {
        onOpenTerritory?: (territoryId: string) => void;
      };
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir Centro"
          onPress={() => detail.onOpenTerritory?.('territory-1')}>
          <Text>Abrir Centro</Text>
        </Pressable>
      );
    };

    await render(<App session={session} api={api} renderDesignations={openDetail} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Abrir Centro' }));

    expect(await screen.findByText('Designação atual')).toBeOnTheScreen();
  });

  it('moves from the setup screen to the designations without restarting the app', async () => {
    const isConfigured = jest.fn(async () => false);
    const session = makeSession({ isConfigured });

    await render(<App session={session} api={makeApi()} />);
    await screen.findByLabelText('Nome da congregação');
    await fillSetupForm();
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText(DESIGNATIONS_TEXT)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Nome da congregação')).not.toBeOnTheScreen();
    // The keystore is not consulted a second time: `configure` just told this
    // component the answer, and asking again would be a relaunch.
    expect(isConfigured).toHaveBeenCalledTimes(1);
  });

  it('asks before signing out, saying what is erased here and what is kept on the server', async () => {
    const signOut = jest.fn(async () => undefined);
    const session = makeSession({ isConfigured: jest.fn(async () => true), signOut });

    await render(<App session={session} api={makeApi()} />);
    await screen.findByText(DESIGNATIONS_TEXT);
    await fireEvent.press(signOutButton());

    const { message } = lastAlert();
    expect(message).toMatch(/neste aparelho/i);
    expect(message).toMatch(/nada é removido do servidor/i);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('cancelling the confirmation neither signs out nor leaves the designations', async () => {
    const signOut = jest.fn(async () => undefined);
    const session = makeSession({ isConfigured: jest.fn(async () => true), signOut });

    await render(<App session={session} api={makeApi()} />);
    await screen.findByText(DESIGNATIONS_TEXT);
    await fireEvent.press(signOutButton());
    await cancelLastAlert();

    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByText(DESIGNATIONS_TEXT)).toBeOnTheScreen();
  });

  it('confirming signs out and returns to the setup screen', async () => {
    const signOut = jest.fn(async () => undefined);
    const session = makeSession({ isConfigured: jest.fn(async () => true), signOut });

    await render(<App session={session} api={makeApi()} />);
    await screen.findByText(DESIGNATIONS_TEXT);
    await fireEvent.press(signOutButton());
    await confirmLastAlert();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText('Nome da congregação')).toBeOnTheScreen();
    expect(screen.queryByText(DESIGNATIONS_TEXT)).not.toBeOnTheScreen();
  });

  it('builds its own session when mounted with no props at all, the way index.js mounts it', async () => {
    // `AppRegistry.registerComponent(appName, () => App)` passes nothing, so
    // every prop has to be optional and default to the real collaborator. The
    // global keychain mock answers "nothing saved", so this lands on setup.
    await render(<App />);

    expect(await screen.findByLabelText('Nome da congregação')).toBeOnTheScreen();
  });

  it('sends the admin back to setup, explaining why, when the designations screen hits a rejected credential', async () => {
    const session = makeSession({
      isConfigured: jest.fn(async () => true),
      run: jest.fn(async () => {
        throw new CredentialsRejectedError('As credenciais salvas não foram aceitas pelo servidor.');
      }),
    });

    await render(<App session={session} renderDesignations={fakeDesignations} />);
    await screen.findByRole('button', { name: 'Carregar' });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Carregar' }));
    });

    expect(await screen.findByLabelText('Nome da congregação')).toBeOnTheScreen();
    // Not just "it failed": the admin has to know the password itself is the
    // likely culprit, or he will retype the same one.
    expect(screen.getByText(/senha da congregação provavelmente mudou/i)).toBeOnTheScreen();
  });

  it('falls back to setup, explaining itself, when the keystore cannot be read at all', async () => {
    const session = makeSession({
      isConfigured: jest.fn(async () => {
        throw new Error('keystore indisponível');
      }),
    });

    await render(<App session={session} api={makeApi()} />);

    // Anything but this leaves the app spinning on the loading state forever.
    expect(await screen.findByLabelText('Nome da congregação')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(/não foi possível ler os dados/i);
  });

  it('says so and stays put when signing out fails, instead of pretending it worked', async () => {
    const signOut = jest.fn(async () => {
      throw new Error('keystore travado');
    });
    const session = makeSession({ isConfigured: jest.fn(async () => true), signOut });

    await render(<App session={session} api={makeApi()} />);
    await screen.findByText(DESIGNATIONS_TEXT);
    await fireEvent.press(signOutButton());
    await confirmLastAlert();

    // Sending him to setup here would be a lie: the credentials are still on
    // the phone, and the next launch would walk straight back in.
    expect(screen.getByText(DESIGNATIONS_TEXT)).toBeOnTheScreen();
    expect(lastAlert().message).toMatch(/não foi possível sair/i);
  });

  it('stays on the designations when the screen fails for a reason that is not a rejected credential', async () => {
    const session = makeSession({
      isConfigured: jest.fn(async () => true),
      run: jest.fn(async () => {
        throw new ApiError(409, 'o publicador ainda tem designação aberta');
      }),
    });

    await render(<App session={session} renderDesignations={fakeDesignations} />);
    await screen.findByRole('button', { name: 'Carregar' });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Carregar' }));
    });

    // Throwing the admin out to the credential form over a 409 would make him
    // retype a password that was never the problem.
    expect(screen.getByRole('button', { name: 'Carregar' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Nome da congregação')).not.toBeOnTheScreen();
  });

  it('displays the update modal when a newer release is found', async () => {
    const session = makeSession({ isConfigured: jest.fn(async () => true) });
    const checkForUpdates = jest.fn().mockResolvedValue({
      app: 'admin-app',
      versionCode: 15,
      versionName: '1.5.0',
      minVersionCode: 1,
      downloadUrl: '/updates/download/admin-app',
      changelog: 'Novas funções no mapa!',
    });
    const getAppVersion = jest.fn().mockResolvedValue({ versionCode: 5, versionName: '1.0.0' });

    await render(
      <App
        session={session}
        api={makeApi()}
        checkForUpdates={checkForUpdates}
        getAppVersion={getAppVersion}
      />,
    );

    expect(await screen.findByText('Nova versão disponível')).toBeOnTheScreen();
    expect(screen.getByText('Versão 1.5.0')).toBeOnTheScreen();
    expect(screen.getByText('Novas funções no mapa!')).toBeOnTheScreen();
  });

  it('allows dismissing an optional update', async () => {
    const session = makeSession({ isConfigured: jest.fn(async () => true) });
    const checkForUpdates = jest.fn().mockResolvedValue({
      app: 'admin-app',
      versionCode: 15,
      versionName: '1.5.0',
      minVersionCode: 1,
      downloadUrl: '/updates/download/admin-app',
    });
    const getAppVersion = jest.fn().mockResolvedValue({ versionCode: 5, versionName: '1.0.0' });

    await render(
      <App
        session={session}
        api={makeApi()}
        checkForUpdates={checkForUpdates}
        getAppVersion={getAppVersion}
      />,
    );

    expect(await screen.findByText('Nova versão disponível')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Depois' }));

    expect(screen.queryByText('Nova versão disponível')).not.toBeOnTheScreen();
  });
});

describe('withCredentialsGuard', () => {
  it('passes a successful run through untouched, without reporting anything', async () => {
    const session = makeSession();
    const onRejected = jest.fn();

    const guarded = withCredentialsGuard(session, onRejected);

    await expect(guarded.run(async () => 'pronto')).resolves.toBe('pronto');
    expect(onRejected).not.toHaveBeenCalled();
  });

  it('reports a CredentialsRejectedError and still rethrows it', async () => {
    const rejection = new CredentialsRejectedError('credencial recusada');
    const session = makeSession({
      run: jest.fn(async () => {
        throw rejection;
      }),
    });
    const onRejected = jest.fn();

    const guarded = withCredentialsGuard(session, onRejected);

    // Rethrown so the calling screen can close its own loading state.
    await expect(guarded.run(async () => 'nunca')).rejects.toBe(rejection);
    expect(onRejected).toHaveBeenCalledWith(rejection);
  });

  it('delegates everything that is not run to the session it wraps', async () => {
    const session = makeSession({ congregation: CONGREGATION });
    const guarded = withCredentialsGuard(session, jest.fn());

    await guarded.isConfigured();
    await guarded.configure({ name: 'a', city: 'b', password: 'c' });
    await guarded.signOut();

    expect(session.isConfigured).toHaveBeenCalledTimes(1);
    expect(session.configure).toHaveBeenCalledWith({ name: 'a', city: 'b', password: 'c' });
    expect(session.signOut).toHaveBeenCalledTimes(1);
    expect(guarded.congregation).toBe(CONGREGATION);
  });
});
