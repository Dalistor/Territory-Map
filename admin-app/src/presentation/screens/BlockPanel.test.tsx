import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { BlockPanel } from './BlockPanel';
import type { BlockPanelSession } from './BlockPanel';
import type { Assignment, Block, Publisher, Territory, WorkLog } from '../../domain/models';

// Same stand-in the block list uses: the real picker draws through a native
// module, and a plain host View forwarding `onChange` is enough to drive it.
jest.mock('@react-native-community/datetimepicker', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactModule = require('react');
  const { View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    __esModule: true,
    default: function MockDateTimePicker(props: {
      value: Date;
      onChange?: (event: unknown, date?: Date) => void;
    }) {
      return ReactModule.createElement(View, {
        testID: 'date-picker',
        onChange: props.onChange,
        value: props.value,
      });
    },
  };
});

/** Pinned "now", so every assertion about dates reads the same on any day. */
const NOW = new Date(2026, 7, 23, 10, 0, 0);

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    territoryId: 'territory-1',
    number: 7,
    polygon: [],
    lastWorkedAt: null,
    statusOverride: null,
    ...overrides,
  };
}

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'territory-1',
    name: 'Centro',
    boundary: [],
    assignedPublisher: null,
    rotationDays: null,
    blocks: [],
    ...overrides,
  };
}

function makePublisher(id: string, name: string, isActive = true): Publisher {
  return {
    id,
    name,
    accessCode: null,
    accessCodeExpiresAt: null,
    activatedAt: null,
    isActive,
  };
}

function makeWorkLog(overrides: Partial<WorkLog> = {}): WorkLog {
  return {
    id: 'log-1',
    blockId: 'block-1',
    publisher: { id: 'publisher-1', name: 'Ana' },
    workedAt: new Date(2026, 6, 1, 9, 0, 0),
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'asg-1',
    territoryId: 'territory-1',
    publisher: { id: 'publisher-1', name: 'Ana' },
    startedAt: new Date(2026, 0, 10, 12, 0, 0),
    completedAt: null,
    ...overrides,
  };
}

interface FakeApi {
  listWorkLogs: jest.Mock;
  listPublishers: jest.Mock;
  markWorked: jest.Mock;
  deleteWorkLog: jest.Mock;
  listAssignments: jest.Mock;
  designate: jest.Mock;
  completeAssignment: jest.Mock;
  deleteAssignment: jest.Mock;
  updateAssignment: jest.Mock;
}

function makeApi(overrides: Partial<FakeApi> = {}): FakeApi {
  return {
    listWorkLogs: jest.fn(async () => [] as WorkLog[]),
    listPublishers: jest.fn(async () => [] as Publisher[]),
    markWorked: jest.fn(async () => makeWorkLog()),
    deleteWorkLog: jest.fn(async () => undefined),
    listAssignments: jest.fn(async () => [] as Assignment[]),
    designate: jest.fn(async () => undefined),
    completeAssignment: jest.fn(async () => undefined),
    deleteAssignment: jest.fn(async () => undefined),
    updateAssignment: jest.fn(async () => undefined),
    ...overrides,
  };
}

/**
 * The session, passing actions straight through the way a signed-in one does,
 * and recording that it was asked -- the panel may never reach the API around
 * it, because it is the session that renews a stale token.
 */
function makeSession(): BlockPanelSession & { run: jest.Mock } {
  const run: jest.Mock = jest.fn((action: () => Promise<unknown>) => action());
  return { run };
}

async function press(element: Parameters<typeof fireEvent.press>[0]): Promise<void> {
  await act(async () => {
    fireEvent.press(element);
  });
}

/** Opens the date picker and answers it with `chosen`, as Android's dialog does. */
async function pickDate(chosen: Date): Promise<void> {
  await press(screen.getByTestId('pick-date'));
  await act(async () => {
    fireEvent(screen.getByTestId('date-picker'), 'change', { type: 'set' }, chosen);
  });
}

interface AlertButtonLike {
  readonly text?: string;
  readonly style?: string;
  readonly onPress?: () => void;
}

/**
 * `Alert` never draws under Jest, so a confirmation is inspected as the call
 * it is, and "the admin tapped yes" is that button's `onPress` being invoked.
 */
function lastAlert(): { message: string; buttons: AlertButtonLike[] } {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const call = calls[calls.length - 1];
  return { message: String(call[1]), buttons: (call[2] ?? []) as AlertButtonLike[] };
}

async function confirmLastAlert(): Promise<void> {
  const confirm = lastAlert().buttons.find(button => button.style !== 'cancel');
  expect(confirm).toBeDefined();
  await act(async () => {
    confirm?.onPress?.();
  });
}

/**
 * Renders and awaits, which is what lets the two loads the panel starts on
 * mount settle before the first assertion -- the same shape
 * `AssignmentPanel.test.tsx` uses.
 */
async function renderPanel(options: {
  block?: Block;
  territory?: Territory;
  api?: FakeApi;
  session?: BlockPanelSession;
  onChanged?: () => void;
} = {}) {
  const api = options.api ?? makeApi();
  const session = options.session ?? makeSession();
  await render(
    <BlockPanel
      block={options.block ?? makeBlock()}
      territory={options.territory ?? makeTerritory()}
      session={session}
      api={api}
      now={NOW}
      onChanged={options.onChanged}
    />,
  );
  return { api, session };
}

describe('BlockPanel', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('mostra o número da quadra e o status por extenso de uma quadra nunca trabalhada', async () => {
    await renderPanel();

    await waitFor(() => expect(screen.getByText('Quadra 7')).toBeTruthy());
    expect(screen.getByText('Nunca trabalhada')).toBeTruthy();
  });

  it('usa a rotação do território dono ao dizer o status por extenso', async () => {
    // 150 dias sem visita: vencida com rotação 120, em dia com rotação 365.
    const lastWorkedAt = new Date(2026, 2, 26, 10, 0, 0);
    await renderPanel({
      block: makeBlock({ lastWorkedAt }),
      territory: makeTerritory({ rotationDays: 120 }),
    });

    await waitFor(() => expect(screen.getByText('Vencida')).toBeTruthy());
  });

  it('lista o histórico da quadra com nome e data, mais recente primeiro', async () => {
    const older = makeWorkLog({
      id: 'log-old',
      publisher: { id: 'publisher-1', name: 'Ana' },
      workedAt: new Date(2026, 0, 5, 9, 0, 0),
    });
    const newer = makeWorkLog({
      id: 'log-new',
      publisher: { id: 'publisher-2', name: 'Bruno' },
      workedAt: new Date(2026, 5, 20, 15, 30, 0),
    });
    // Deliberately out of order: the panel, not the server, decides the order.
    const api = makeApi({ listWorkLogs: jest.fn(async () => [older, newer]) });

    await renderPanel({ api });

    await waitFor(() => expect(screen.getAllByTestId(/^work-log-/)).toHaveLength(2));
    const rows = screen.getAllByTestId(/^work-log-/);
    expect(within(rows[0]).getByText('Bruno')).toBeTruthy();
    expect(within(rows[0]).getByText('20/06/2026 15:30')).toBeTruthy();
    expect(within(rows[1]).getByText('Ana')).toBeTruthy();
  });

  it('diz que a quadra nunca foi trabalhada em vez de mostrar uma lista vazia', async () => {
    await renderPanel();

    await waitFor(() => expect(screen.getByText('Esta quadra nunca foi trabalhada.')).toBeTruthy());
    expect(screen.queryAllByTestId(/^work-log-/)).toHaveLength(0);
  });

  it('apagar um registro de trabalho pede confirmação, e cancelar não chama a API', async () => {
    const api = makeApi({ listWorkLogs: jest.fn(async () => [makeWorkLog({ id: 'log-9' })]) });

    await renderPanel({ api });

    await waitFor(() => expect(screen.getByLabelText('Apagar registro de Ana')).toBeTruthy());
    await press(screen.getByLabelText('Apagar registro de Ana'));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const { message } = lastAlert();
    expect(message).toContain('Ana');
    expect(message).toContain('Não há como desfazer');
    expect(api.deleteWorkLog).not.toHaveBeenCalled();
  });

  it('confirmar apaga o registro tocado, e não outro, recarrega o histórico e avisa o chamador', async () => {
    const api = makeApi({
      listWorkLogs: jest.fn(async () => [
        makeWorkLog({
          id: 'log-ana',
          publisher: { id: 'publisher-1', name: 'Ana' },
          workedAt: new Date(2026, 0, 5, 9, 0, 0),
        }),
        makeWorkLog({
          id: 'log-bruno',
          publisher: { id: 'publisher-2', name: 'Bruno' },
          workedAt: new Date(2026, 5, 20, 9, 0, 0),
        }),
      ]),
    });
    const onChanged = jest.fn();

    const { session } = await renderPanel({ api, onChanged });

    await waitFor(() => expect(screen.getByLabelText('Apagar registro de Ana')).toBeTruthy());
    await press(screen.getByLabelText('Apagar registro de Ana'));
    await confirmLastAlert();

    await waitFor(() => expect(api.deleteWorkLog).toHaveBeenCalledWith('log-ana'));
    expect(api.deleteWorkLog).toHaveBeenCalledTimes(1);
    // Reloaded: once on mount, once after the deletion.
    expect(api.listWorkLogs).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(session.run).toHaveBeenCalled();
  });

  it('marca como trabalhada com a quadra, o publicador escolhido e a data, e avisa o chamador', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('publisher-2', 'Bruno')]),
    });
    const onChanged = jest.fn();

    await renderPanel({ api, onChanged });

    await waitFor(() => expect(screen.getByTestId('publisher-publisher-2')).toBeTruthy());
    await press(screen.getByTestId('publisher-publisher-2'));
    const chosen = new Date(2026, 7, 20, 0, 0, 0);
    await pickDate(chosen);
    await press(screen.getByTestId('mark-worked'));

    await waitFor(() =>
      expect(api.markWorked).toHaveBeenCalledWith('block-1', 'publisher-2', chosen),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('não deixa marcar sem escolher um publicador', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('publisher-2', 'Bruno')]),
    });

    await renderPanel({ api });

    await waitFor(() => expect(screen.getByTestId('publisher-publisher-2')).toBeTruthy());
    expect(screen.getByTestId('mark-worked')).toBeDisabled();

    await press(screen.getByTestId('mark-worked'));
    expect(api.markWorked).not.toHaveBeenCalled();
  });

  it('recusa data no futuro, com a explicação visível', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('publisher-2', 'Bruno')]),
    });

    await renderPanel({ api });

    await waitFor(() => expect(screen.getByTestId('publisher-publisher-2')).toBeTruthy());
    await press(screen.getByTestId('publisher-publisher-2'));
    await pickDate(new Date(2026, 7, 24, 0, 0, 0));

    expect(
      screen.getByText(
        'A data não pode estar no futuro: o servidor recusa um registro de trabalho que ainda não aconteceu.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('mark-worked')).toBeDisabled();
    await press(screen.getByTestId('mark-worked'));
    expect(api.markWorked).not.toHaveBeenCalled();
  });

  it('mostra o erro de marcar numa região acessível, sem fechar o painel', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('publisher-2', 'Bruno')]),
      markWorked: jest.fn(async () => {
        throw new Error('Quadra não encontrada.');
      }),
    });
    const onChanged = jest.fn();

    await renderPanel({ api, onChanged });

    await waitFor(() => expect(screen.getByTestId('publisher-publisher-2')).toBeTruthy());
    await press(screen.getByTestId('publisher-publisher-2'));
    await press(screen.getByTestId('mark-worked'));

    await waitFor(() =>
      expect(screen.getByTestId('block-work-error')).toHaveTextContent('Quadra não encontrada.'),
    );
    expect(screen.getByTestId('block-work-error').props.accessibilityRole).toBe('alert');
    // Still the same panel, still usable.
    expect(screen.getByText('Quadra 7')).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('separa a seção do território e mostra que não há dirigente nenhum', async () => {
    await renderPanel();

    await waitFor(() => expect(screen.getByText('Sem designação')).toBeTruthy());
    expect(screen.getByText('Ações desta quadra')).toBeTruthy();
    // The territory section says out loud that it is about the territory, not
    // about this block.
    expect(screen.getByText(/Território: Centro/)).toBeTruthy();
    expect(screen.getByText(/afeta o território inteiro/)).toBeTruthy();
  });

  it('mostra o dirigente atual do território', async () => {
    const api = makeApi({
      listAssignments: jest.fn(async () => [
        makeAssignment({ publisher: { id: 'publisher-2', name: 'Bruno' } }),
      ]),
    });

    await renderPanel({ api });

    await waitFor(() => expect(screen.getByText(/^Retirada: .* · Em andamento$/)).toBeTruthy());
    expect(screen.queryByText('Sem designação')).toBeNull();
  });

  it('avisa que a designação atual será encerrada com a data de hoje, e confirmar designa', async () => {
    const api = makeApi({
      listAssignments: jest.fn(async () => [
        makeAssignment({ publisher: { id: 'publisher-1', name: 'Ana' } }),
      ]),
      listPublishers: jest.fn(async () => [
        makePublisher('publisher-1', 'Ana'),
        makePublisher('publisher-2', 'Bruno'),
      ]),
    });
    const onChanged = jest.fn();

    await renderPanel({ api, onChanged, territory: makeTerritory({ id: 'terr-3' }) });

    await waitFor(() => expect(screen.getByTestId('designate-publisher-2')).toBeTruthy());
    await press(screen.getByTestId('designate-publisher-2'));
    await press(screen.getByText('Designar publicador'));

    const { message } = lastAlert();
    expect(message).toContain('encerrada com a data de hoje');
    expect(api.designate).not.toHaveBeenCalled();

    await confirmLastAlert();

    await waitFor(() => expect(api.designate).toHaveBeenCalledWith('terr-3', 'publisher-2'));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('só oferece concluir quando há designação aberta, e avisa que o acesso se perde na hora', async () => {
    const api = makeApi({
      listAssignments: jest.fn(async () => [
        makeAssignment({ publisher: { id: 'publisher-1', name: 'Ana' } }),
      ]),
    });

    await renderPanel({ api, territory: makeTerritory({ id: 'terr-5' }) });

    await waitFor(() => expect(screen.getByText('Marcar como concluído')).toBeTruthy());
    await press(screen.getByText('Marcar como concluído'));

    expect(lastAlert().message).toContain('perde na hora o acesso para marcar quadras');
    await confirmLastAlert();

    await waitFor(() => expect(api.completeAssignment).toHaveBeenCalledWith('terr-5'));
  });

  it('não oferece concluir quando não há designação aberta', async () => {
    await renderPanel();

    await waitFor(() => expect(screen.getByText('Sem designação')).toBeTruthy());
    expect(screen.queryByText('Marcar como concluído')).toBeNull();
  });

  it('apagar registro da designação avisa que não há como desfazer e apaga aquela linha', async () => {
    const api = makeApi({
      listAssignments: jest.fn(async () => [
        makeAssignment({
          id: 'asg-old',
          publisher: { id: 'publisher-1', name: 'Ana' },
          startedAt: new Date(2025, 0, 5, 10, 0, 0),
          completedAt: new Date(2025, 3, 5, 10, 0, 0),
        }),
        makeAssignment({
          id: 'asg-new',
          publisher: { id: 'publisher-2', name: 'Bruno' },
          startedAt: new Date(2025, 5, 1, 10, 0, 0),
          completedAt: new Date(2025, 8, 1, 10, 0, 0),
        }),
      ]),
    });
    const onChanged = jest.fn();

    await renderPanel({ api, onChanged, territory: makeTerritory({ id: 'terr-2' }) });

    await waitFor(() => expect(screen.getByLabelText('Apagar designação de Ana')).toBeTruthy());
    await press(screen.getByLabelText('Apagar designação de Ana'));

    expect(lastAlert().message).toContain('Não há como desfazer');
    expect(api.deleteAssignment).not.toHaveBeenCalled();

    await confirmLastAlert();

    await waitFor(() => expect(api.deleteAssignment).toHaveBeenCalledWith('terr-2', 'asg-old'));
    expect(api.deleteAssignment).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('mostra o erro de uma ação do território numa região acessível, sem fechar o painel', async () => {
    const api = makeApi({
      listAssignments: jest.fn(async () => [
        makeAssignment({ publisher: { id: 'publisher-1', name: 'Ana' } }),
      ]),
      completeAssignment: jest.fn(async () => {
        throw new Error('Nenhuma designação aberta.');
      }),
    });

    await renderPanel({ api });

    await waitFor(() => expect(screen.getByText('Marcar como concluído')).toBeTruthy());
    await press(screen.getByText('Marcar como concluído'));
    await confirmLastAlert();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Nenhuma designação aberta.'),
    );
    expect(screen.getByText('Quadra 7')).toBeTruthy();
  });

  it('mostra o erro de apagar um registro sem fechar o painel, e não avisa o chamador', async () => {
    const api = makeApi({
      listWorkLogs: jest.fn(async () => [makeWorkLog({ id: 'log-9' })]),
      deleteWorkLog: jest.fn(async () => {
        throw new Error('Registro não encontrado.');
      }),
    });
    const onChanged = jest.fn();

    await renderPanel({ api, onChanged });

    await press(screen.getByLabelText('Apagar registro de Ana'));
    await confirmLastAlert();

    await waitFor(() =>
      expect(screen.getByTestId('block-work-error')).toHaveTextContent('Registro não encontrado.'),
    );
    expect(screen.getByText('Quadra 7')).toBeTruthy();
    // The row is still there -- nothing was removed.
    expect(screen.getByLabelText('Apagar registro de Ana')).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('funciona sem `onChanged` e sem `now`: uma marcação bem-sucedida não quebra o painel', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('publisher-2', 'Bruno')]),
    });

    // No `now` and no `onChanged`: both are optional, and the panel has to
    // stand on its own clock and answer to nobody.
    await render(
      <BlockPanel
        block={makeBlock()}
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('publisher-publisher-2')).toBeTruthy());
    await press(screen.getByTestId('publisher-publisher-2'));
    await press(screen.getByTestId('mark-worked'));

    await waitFor(() => expect(api.markWorked).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('block-work-error')).toBeNull();
  });

  it('faz toda escrita passar pela sessão, nunca chamando a API por fora', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('publisher-2', 'Bruno')]),
    });
    const session = makeSession();

    await renderPanel({ api, session });

    await waitFor(() => expect(screen.getByTestId('publisher-publisher-2')).toBeTruthy());
    await press(screen.getByTestId('publisher-publisher-2'));
    await press(screen.getByTestId('mark-worked'));

    await waitFor(() => expect(api.markWorked).toHaveBeenCalled());
    // Every call the panel made -- reads and writes alike -- went through it.
    expect(session.run.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});
