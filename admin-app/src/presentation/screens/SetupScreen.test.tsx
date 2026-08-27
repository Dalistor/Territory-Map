import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError, NetworkError } from '../../data/api-client';
import type { Congregation } from '../../domain/models';
import SetupScreen from './SetupScreen';

/**
 * The screen's only collaborator is `session.configure`, injected as a prop --
 * no HTTP client, no keystore and no real session is ever built here, the same
 * "fake the injected collaborator" approach `admin/src/renderer/screens/
 * SetupScreen.test.tsx` takes with `window.api` on the desktop.
 */
function fakeSession(configure = jest.fn()): { configure: jest.Mock } {
  return { configure };
}

const CONGREGATION: Congregation = {
  id: 'cong-1',
  name: 'Congregação Central',
  city: 'São Paulo',
};

async function renderScreen(
  overrides: {
    configure?: jest.Mock;
    onConfigured?: jest.Mock;
  } = {},
) {
  const configure = overrides.configure ?? jest.fn().mockResolvedValue(CONGREGATION);
  const onConfigured = overrides.onConfigured ?? jest.fn();
  await render(<SetupScreen session={fakeSession(configure)} onConfigured={onConfigured} />);
  return { configure, onConfigured };
}

async function fillIn({
  name = 'Congregação Central',
  city = 'São Paulo',
  password = 'senha-secreta-123',
}: { name?: string; city?: string; password?: string } = {}): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText('Nome da congregação'), name);
  await fireEvent.changeText(screen.getByLabelText('Cidade'), city);
  await fireEvent.changeText(screen.getByLabelText('Senha'), password);
}

function confirmButton() {
  return screen.getByRole('button', { name: 'Confirmar' });
}

describe('SetupScreen', () => {
  it('shows the three credential fields and the confirm button', async () => {
    await renderScreen();

    expect(screen.getByLabelText('Nome da congregação')).toBeOnTheScreen();
    expect(screen.getByLabelText('Cidade')).toBeOnTheScreen();
    expect(screen.getByLabelText('Senha')).toBeOnTheScreen();
    expect(confirmButton()).toBeOnTheScreen();
  });

  it.each([
    ['nothing typed at all', { name: '', city: '', password: '' }],
    ['no congregation name', { name: '', city: 'São Paulo', password: 'senha' }],
    ['no city', { name: 'Congregação Central', city: '', password: 'senha' }],
    ['no password', { name: 'Congregação Central', city: 'São Paulo', password: '' }],
  ])('keeps the confirm button disabled with %s', async (_label, values) => {
    await renderScreen();

    await fillIn(values);

    expect(confirmButton()).toBeDisabled();
  });

  it('enables the confirm button once the three fields are filled', async () => {
    await renderScreen();

    await fillIn();

    expect(confirmButton()).not.toBeDisabled();
  });

  it('confirming calls configure once with the typed name, city and password', async () => {
    const { configure } = await renderScreen();

    await fillIn({
      name: 'Congregação Central',
      city: 'São Paulo',
      password: 'senha-secreta-123',
    });
    await fireEvent.press(confirmButton());

    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure).toHaveBeenCalledWith({
      name: 'Congregação Central',
      city: 'São Paulo',
      password: 'senha-secreta-123',
    });
  });

  it('trims the name and the city, and sends the password exactly as typed', async () => {
    const { configure } = await renderScreen();

    await fillIn({
      name: '  Congregação Central  ',
      city: '  São Paulo  ',
      password: '  senha com espaços  ',
    });
    await fireEvent.press(confirmButton());

    expect(configure).toHaveBeenCalledWith({
      name: 'Congregação Central',
      city: 'São Paulo',
      password: '  senha com espaços  ',
    });
  });

  it('calls onConfigured with the congregation the session returned', async () => {
    const { onConfigured } = await renderScreen({
      configure: jest.fn().mockResolvedValue(CONGREGATION),
    });

    await fillIn();
    await fireEvent.press(confirmButton());

    await waitFor(() => expect(onConfigured).toHaveBeenCalledWith(CONGREGATION));
    expect(onConfigured).toHaveBeenCalledTimes(1);
  });

  it('shows a loading indicator and blocks a second press while configure is pending', async () => {
    // A login held open on purpose: pressing twice against it is the double
    // tap the admin does on a slow connection, which is exactly when a second
    // login would be fired.
    let resolveConfigure: (congregation: Congregation) => void = () => {};
    const configure = jest.fn(
      () =>
        new Promise<Congregation>((resolve) => {
          resolveConfigure = resolve;
        }),
    );
    const { onConfigured } = await renderScreen({ configure });

    await fillIn();
    // The two taps land back to back inside a single `act`, so React has had
    // no chance to re-render and disable the button in between -- the double
    // tap of someone on a slow connection. React logs "overlapping act()
    // calls" here, because each `fireEvent.press` opens its own scope over a
    // promise that has not settled; that is inherent to simulating a tap while
    // a request is in flight, and it is why the deferred *is* resolved at the
    // end of this test: an act scope left open outlives the test and breaks
    // the next one's render.
    await act(async () => {
      fireEvent.press(confirmButton());
      fireEvent.press(confirmButton());
    });

    expect(configure).toHaveBeenCalledTimes(1);
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByLabelText('Entrando')).toBeOnTheScreen();

    // And once the button is visibly disabled, a real press does nothing.
    await act(async () => {
      fireEvent.press(confirmButton());
    });
    expect(configure).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConfigure(CONGREGATION);
    });
    expect(onConfigured).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Entrando')).not.toBeOnTheScreen();
  });

  it('stays on setup with the fields untouched when the credentials are rejected', async () => {
    const { onConfigured } = await renderScreen({
      configure: jest.fn().mockRejectedValue(new ApiError(401, 'credenciais inválidas')),
    });

    await fillIn({
      name: 'Congregação Central',
      city: 'São Paulo',
      password: 'senha-errada',
    });
    await fireEvent.press(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/nome, cidade ou senha/i);
    expect(onConfigured).not.toHaveBeenCalled();
    // The three fields keep what was typed, so the admin fixes the wrong one
    // instead of typing everything again.
    expect(screen.getByLabelText('Nome da congregação')).toHaveDisplayValue('Congregação Central');
    expect(screen.getByLabelText('Cidade')).toHaveDisplayValue('São Paulo');
    expect(screen.getByLabelText('Senha')).toHaveDisplayValue('senha-errada');
    expect(confirmButton()).not.toBeDisabled();
  });

  it('shows the network failure message, and not the rejected-credentials one', async () => {
    const networkMessage = 'Não foi possível falar com o servidor. Verifique a conexão.';
    await renderScreen({
      configure: jest.fn().mockRejectedValue(new NetworkError(networkMessage)),
    });

    await fillIn();
    await fireEvent.press(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(networkMessage);
    // A dead connection is not a wrong password, and must not read like one.
    expect(alert).not.toHaveTextContent(/nome, cidade ou senha/i);
  });

  it('shows what the server explained when the failure is not a 401', async () => {
    await renderScreen({
      configure: jest.fn().mockRejectedValue(new ApiError(500, 'o servidor está em manutenção')),
    });

    await fillIn();
    await fireEvent.press(confirmButton());

    // Not a credential problem, so the credential text would be a lie.
    expect(await screen.findByRole('alert')).toHaveTextContent('o servidor está em manutenção');
  });

  it.each([
    ['a rejection that is not an Error at all', 'algo estranho'],
    ['an Error carrying no message', new Error('')],
  ])('falls back to a generic message for %s', async (_label, rejection) => {
    await renderScreen({ configure: jest.fn().mockRejectedValue(rejection) });

    await fillIn();
    await fireEvent.press(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível configurar a congregação. Tente de novo.',
    );
  });

  it('masks the password field and keeps the password out of the rest of the tree', async () => {
    const password = 'senha-ultra-secreta-42';
    await renderScreen({
      // A rejection is the moment a screen is most likely to echo what was
      // typed back at the admin, so the check runs after one.
      configure: jest.fn().mockRejectedValue(new ApiError(401, 'credenciais inválidas')),
    });

    await fillIn({ password });
    await fireEvent.press(confirmButton());
    await screen.findByRole('alert');

    expect(screen.getByLabelText('Senha')).toHaveProp('secureTextEntry', true);
    const rendered = JSON.stringify(screen.toJSON());
    const occurrences = rendered.split(password).length - 1;
    // Exactly one: the `value` of the password field itself. Anything else is
    // the secret showing up somewhere a screenshot or a screen reader reaches.
    expect(occurrences).toBe(1);
  });

  it('says the credentials stay on this device and that login is asked only once', async () => {
    await renderScreen();

    expect(
      screen.getByText(/ficam guardados (só|somente) neste aparelho.*não (vai )?pedir/i),
    ).toBeOnTheScreen();
  });
});
