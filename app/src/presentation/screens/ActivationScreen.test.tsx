import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createApiClient, type ApiClient } from '../../data/api-client';
import { saveSession } from '../../data/session-store';
import type { Session } from '../../domain/models';
import ActivationScreen from './ActivationScreen';

/**
 * Both data-layer modules are mocked at the boundary this screen actually
 * depends on -- the HTTP client's `ApiClient` interface and the keychain
 * wrapper's `saveSession` -- the same "fake the injected collaborator, not
 * the network/keystore" approach `admin/src/renderer/screens/SetupScreen.test.tsx`
 * takes with `window.api`. Neither `react-native-config` nor a real `fetch`
 * nor the OS keychain ever runs in this test.
 *
 * Manual factories, not bare `jest.mock(path)` automocks: automocking still
 * has to load the real module to learn its shape, and `api-client.ts` pulls
 * in `react-native-config`'s ESM build, which the base Jest config does not
 * transform (see `api-client.test.ts`, which sidesteps the same problem by
 * mocking `react-native-config` itself). A factory never touches the real
 * file at all.
 */
jest.mock('../../data/api-client', () => ({ createApiClient: jest.fn() }));
jest.mock('../../data/session-store', () => ({ saveSession: jest.fn() }));

const mockedCreateApiClient = jest.mocked(createApiClient);
const mockedSaveSession = jest.mocked(saveSession);

/**
 * A fake covering every member of `ActivationScreen`'s only collaborator --
 * the screen calls just `activate`, but the interface is wider, and stubbing
 * the rest keeps this fake honest about what it implements. Same pattern as
 * `fakeApi()` in `SetupScreen.test.tsx`.
 */
function fakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    activate: jest.fn(),
    listTerritories: jest.fn(),
    listCampaigns: jest.fn(),
    listWorkedTerritories: jest.fn(),
    listWorkHistory: jest.fn(),
    markBlockWorked: jest.fn(),
    ...overrides,
  };
}

const SESSION: Session = {
  token: 'app-token-abc123',
  user: { id: 'user-1', name: 'João' },
  congregation: { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' },
};

const GENERIC_ERROR_MESSAGE =
  'Código inválido, expirado ou já usado. Confira com quem cuida dos territórios na congregação.';

beforeEach(() => {
  jest.clearAllMocks();
  mockedCreateApiClient.mockReturnValue(fakeApiClient());
  mockedSaveSession.mockResolvedValue(undefined);
});

describe('ActivationScreen', () => {
  it('typing a code and confirming activates it, saves the session and calls onActivated', async () => {
    const activate = jest.fn().mockResolvedValue(SESSION);
    mockedCreateApiClient.mockReturnValue(fakeApiClient({ activate }));
    const onActivated = jest.fn();
    await render(<ActivationScreen onActivated={onActivated} />);

    await fireEvent.changeText(screen.getByLabelText('Código de acesso'), 'ABC123XY');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(onActivated).toHaveBeenCalledWith(SESSION));
    expect(activate).toHaveBeenCalledWith('ABC123XY');
    expect(mockedSaveSession).toHaveBeenCalledWith(SESSION);
  });

  it.each([
    ['an invalid code', new Error('nonexistent access code')],
    ['an expired code', new Error('access code expired')],
    ['an already-redeemed code', new Error('access code already used')],
  ])(
    'shows the same generic message for %s, without navigating',
    async (_label, rejection) => {
      const activate = jest.fn().mockRejectedValue(rejection);
      mockedCreateApiClient.mockReturnValue(fakeApiClient({ activate }));
      const onActivated = jest.fn();
      await render(<ActivationScreen onActivated={onActivated} />);

      await fireEvent.changeText(screen.getByLabelText('Código de acesso'), 'ABC123XY');
      await fireEvent.press(screen.getByRole('button', { name: 'Confirmar' }));

      expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeTruthy();
      expect(onActivated).not.toHaveBeenCalled();
      expect(mockedSaveSession).not.toHaveBeenCalled();
    },
  );

  it('disables the Confirmar button while the code field is empty', async () => {
    await render(<ActivationScreen onActivated={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Código de acesso'), 'A');

    expect(screen.getByRole('button', { name: 'Confirmar' })).not.toBeDisabled();
  });

  it('keeps the Confirmar button disabled when the code is only whitespace', async () => {
    await render(<ActivationScreen onActivated={jest.fn()} />);

    await fireEvent.changeText(screen.getByLabelText('Código de acesso'), '   ');

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });
});
