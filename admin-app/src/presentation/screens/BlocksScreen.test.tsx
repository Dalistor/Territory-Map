import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { BlocksScreen } from './BlocksScreen';
import type { BlocksScreenApi, BlocksScreenSession } from './BlocksScreen';
import type { AssignmentsMapViewProps } from '../map/AssignmentsMapView';
import type { Block, Publisher, Territory, WorkLog } from '../../domain/models';

// The embedded map draws through MapLibre's native view, kept out of Jest the
// same way `DesignationsScreen.test.tsx` keeps it out: a stub with one button
// per block, typed with the real props so a renamed prop breaks this file at
// compile time instead of silently. What this screen owes the map is the
// single-territory array it hands over and the handler it calls back -- that
// is exactly what the stub exercises.
jest.mock('../map/AssignmentsMapView', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactModule = require('react');
  const { Pressable, Text, View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    __esModule: true,
    AssignmentsMapView: function MockAssignmentsMapView({
      territories,
      onSelectBlock,
    }: AssignmentsMapViewProps) {
      return ReactModule.createElement(
        View,
        { testID: 'blocks-map' },
        territories.flatMap((territory: Territory) =>
          territory.blocks.map((block: Block) =>
            ReactModule.createElement(
              Pressable,
              {
                key: block.id,
                accessibilityRole: 'button',
                accessibilityLabel: `Quadra ${block.number} no mapa`,
                onPress: () => onSelectBlock?.(block, territory),
              },
              ReactModule.createElement(Text, null, String(block.number)),
            ),
          ),
        ),
      );
    },
  };
});

// The date picker draws through a native module, so it is replaced here by a
// plain host View that forwards `onChange`. That is enough to drive it:
// `fireEvent(picker, 'change', event, date)` reaches the screen exactly the
// way the real Android dialog would. Mocked in this file rather than in
// `jest.setup.js` because this is the only screen that picks a date.
jest.mock('@react-native-community/datetimepicker', () => {
  // `require`, not `import`: the factory is hoisted above the imports, so
  // nothing imported at the top of this file exists yet when it runs.
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
    number: 1,
    polygon: [],
    lastWorkedAt: null,
    statusOverride: null,
    ...overrides,
  };
}

function makeTerritory(blocks: Block[], overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'territory-1',
    name: 'Centro',
    boundary: [],
    assignedPublisher: null,
    rotationDays: null,
    blocks,
    ...overrides,
  };
}

function makePublisher(id: string, name: string): Publisher {
  return {
    id,
    name,
    accessCode: null,
    accessCodeExpiresAt: null,
    activatedAt: null,
    isActive: true,
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

/**
 * Presses an element and lets the effects that press starts settle inside
 * `act`. A bare `fireEvent.press` mounts the panel and returns before its
 * fetch resolves, so the state update lands outside `act` and React warns --
 * the press is what starts the work, so the press is what has to be awaited.
 */
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

/**
 * The session, passing actions straight through the way a signed-in one does,
 * and recording that it was asked -- no screen may reach the API around it.
 */
function makeSession(): BlocksScreenSession & { run: jest.Mock } {
  const run: jest.Mock = jest.fn((action: () => Promise<unknown>) => action());
  return { run };
}

/** Every method a `jest.Mock`, so a test can both stub and assert on it. */
interface FakeApi extends BlocksScreenApi {
  listWorkLogs: jest.Mock;
  listPublishers: jest.Mock;
  markWorked: jest.Mock;
  getTerritory: jest.Mock;
}

function makeApi(overrides: Partial<FakeApi> = {}): FakeApi {
  return {
    listWorkLogs: jest.fn(async () => []),
    listPublishers: jest.fn(async () => []),
    markWorked: jest.fn(async () => makeWorkLog()),
    getTerritory: jest.fn(async () => makeTerritory([])),
    ...overrides,
  };
}

describe('BlocksScreen', () => {
  it('lista as quadras em ordem crescente de número, mesmo que a API devolva fora de ordem', async () => {
    const territory = makeTerritory([
      makeBlock({ id: 'c', number: 3 }),
      makeBlock({ id: 'a', number: 1 }),
      makeBlock({ id: 'b', number: 2 }),
    ]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={makeApi()} now={NOW} />,
    );

    const labels = screen
      .getAllByTestId(/^block-row-/)
      .map(row => row.props.accessibilityLabel);
    expect(labels).toEqual(['Quadra 1', 'Quadra 2', 'Quadra 3']);
  });

  it('mostra "Nunca trabalhada" e nenhuma data numa quadra que nunca foi visitada', async () => {
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1, lastWorkedAt: null })]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={makeApi()} now={NOW} />,
    );

    expect(screen.getByText('Nunca trabalhada')).toBeTruthy();
    expect(screen.queryByText(/Última visita/)).toBeNull();
  });

  it('mostra o status por extenso e a data da última visita numa quadra já trabalhada', async () => {
    const territory = makeTerritory(
      [makeBlock({ id: 'a', number: 1, lastWorkedAt: new Date(2026, 7, 1, 8, 0, 0) })],
      { rotationDays: 30 },
    );

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={makeApi()} now={NOW} />,
    );

    // 22 days ago, on a 30-day rotation: still inside the cycle.
    expect(screen.getByText('Em dia')).toBeTruthy();
    expect(screen.getByText('Última visita: 01/08/2026')).toBeTruthy();
  });

  it('usa a rotação do território para decidir o status, não o padrão de 120 dias', async () => {
    const territory = makeTerritory(
      [makeBlock({ id: 'a', number: 1, lastWorkedAt: new Date(2026, 7, 1, 8, 0, 0) })],
      { rotationDays: 10 },
    );

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={makeApi()} now={NOW} />,
    );

    // The same 22 days, now past a 10-day rotation.
    expect(screen.getByText('Vencida')).toBeTruthy();
  });

  it('explica onde as quadras são desenhadas quando o território não tem nenhuma', async () => {
    await render(
      <BlocksScreen
        territory={makeTerritory([])}
        session={makeSession()}
        api={makeApi()}
        now={NOW}
      />,
    );

    expect(screen.getByText(/admin do computador/)).toBeTruthy();
    expect(screen.queryAllByTestId(/^block-row-/)).toHaveLength(0);
  });

  it('carrega e mostra o histórico da quadra tocada, mais recente primeiro', async () => {
    const api = makeApi({
      listWorkLogs: jest.fn(async () => [
        makeWorkLog({
          id: 'older',
          publisher: { id: 'p1', name: 'Ana' },
          workedAt: new Date(2026, 5, 10, 9, 0, 0),
        }),
        makeWorkLog({
          id: 'newer',
          publisher: { id: 'p2', name: 'Bruno' },
          workedAt: new Date(2026, 6, 20, 14, 30, 0),
        }),
      ]),
    });
    const session = makeSession();
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);

    await render(
      <BlocksScreen territory={territory} session={session} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));

    const rows = await screen.findAllByTestId(/^work-log-/);
    expect(rows.map(row => row.props.testID)).toEqual(['work-log-newer', 'work-log-older']);
    expect(api.listWorkLogs).toHaveBeenCalledWith('a');
    expect(session.run).toHaveBeenCalled();
    expect(screen.getByText('Bruno')).toBeTruthy();
    expect(screen.getByText('20/07/2026 14:30')).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText('10/06/2026 09:00')).toBeTruthy();
  });

  it('fecha o painel ao tocar de novo na mesma quadra', async () => {
    const api = makeApi({
      listWorkLogs: jest.fn(async () => [makeWorkLog({ id: 'only', blockId: 'a' })]),
    });
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));
    await screen.findByTestId('work-log-only');

    await press(screen.getByTestId('block-row-a'));

    await waitFor(() => expect(screen.queryByTestId('work-log-only')).toBeNull());
  });

  it('mantém o botão de marcar desabilitado enquanto nenhum publicador estiver escolhido', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('p1', 'Ana'), makePublisher('p2', 'Bruno')]),
    });
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));
    await screen.findByTestId('publisher-p2');

    expect(screen.getByTestId('mark-worked').props.accessibilityState.disabled).toBe(true);
    await press(screen.getByTestId('mark-worked'));
    expect(api.markWorked).not.toHaveBeenCalled();

    await press(screen.getByTestId('publisher-p2'));

    expect(screen.getByTestId('mark-worked').props.accessibilityState.disabled).toBe(false);
  });

  it('filtra os publicadores do trabalho sem diferenciar maiúsculas e mantém a seleção até confirmar', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('p1', 'Ana'), makePublisher('p2', 'Bruno')]),
    });
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));
    await screen.findByTestId('publisher-p2');

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('publisher-search'), 'BRU');
    });
    expect(screen.queryByTestId('publisher-p1')).toBeNull();
    expect(screen.getByTestId('publisher-p2')).toBeTruthy();
    await press(screen.getByTestId('publisher-p2'));

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('publisher-search'), 'inexistente');
    });

    expect(screen.getByText('Nenhum publicador encontrado.')).toBeTruthy();
    expect(screen.getByText('Bruno')).toBeTruthy();
    expect(screen.getByTestId('publisher-p2').props.accessibilityState.selected).toBe(true);

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('publisher-search'), 'bru');
    });
    await press(screen.getByTestId('mark-worked'));

    expect(api.markWorked).toHaveBeenCalledWith('a', 'p2', NOW);
  });

  it('começa a data em hoje', async () => {
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={makeApi()} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));

    expect(screen.getByText('Data: 23/08/2026')).toBeTruthy();
  });

  it('desabilita o marcar e explica quando a data escolhida está no futuro', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('p1', 'Ana')]),
    });
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));
    await press(await screen.findByTestId('publisher-p1'));
    expect(screen.getByTestId('mark-worked').props.accessibilityState.disabled).toBe(false);

    await pickDate(new Date(2026, 7, 24, 8, 0, 0));

    expect(screen.getByText('Data: 24/08/2026')).toBeTruthy();
    expect(screen.getByText(/futuro/)).toBeTruthy();
    expect(screen.getByTestId('mark-worked').props.accessibilityState.disabled).toBe(true);
    await press(screen.getByTestId('mark-worked'));
    expect(api.markWorked).not.toHaveBeenCalled();
  });

  it('aceita uma data anterior a hoje', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('p1', 'Ana')]),
    });
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));
    await press(await screen.findByTestId('publisher-p1'));

    await pickDate(new Date(2026, 7, 20, 8, 0, 0));

    expect(screen.queryByText(/futuro/)).toBeNull();
    expect(screen.getByTestId('mark-worked').props.accessibilityState.disabled).toBe(false);
  });

  it('confirma chamando markWorked uma vez, com a quadra, o publicador e a data escolhidos', async () => {
    const territory = makeTerritory([
      makeBlock({ id: 'a', number: 1 }),
      makeBlock({ id: 'b', number: 2 }),
    ]);
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('p1', 'Ana'), makePublisher('p2', 'Bruno')]),
      getTerritory: jest.fn(async () => territory),
    });
    const session = makeSession();

    await render(
      <BlocksScreen territory={territory} session={session} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-b'));
    await press(await screen.findByTestId('publisher-p2'));
    await pickDate(new Date(2026, 7, 20, 0, 0, 0));

    await press(screen.getByTestId('mark-worked'));

    expect(api.markWorked).toHaveBeenCalledTimes(1);
    expect(api.markWorked).toHaveBeenCalledWith('b', 'p2', new Date(2026, 7, 20, 0, 0, 0));
    expect(session.run).toHaveBeenCalled();
  });

  it('não dispara uma segunda chamada enquanto a marcação está pendente', async () => {
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);
    let settleMark: (log: WorkLog) => void = () => {};
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('p1', 'Ana')]),
      markWorked: jest.fn(
        () =>
          new Promise<WorkLog>(resolve => {
            settleMark = resolve;
          }),
      ),
      getTerritory: jest.fn(async () => territory),
    });

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));
    await press(await screen.findByTestId('publisher-p1'));

    await press(screen.getByTestId('mark-worked'));
    await press(screen.getByTestId('mark-worked'));

    expect(api.markWorked).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mark-worked').props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      settleMark(makeWorkLog());
    });
  });

  it('recarrega a quadra depois de marcar, e a linha passa a refletir o registro novo', async () => {
    const before = makeBlock({ id: 'a', number: 1, lastWorkedAt: null, statusOverride: 'never' });
    const after = makeBlock({
      id: 'a',
      number: 1,
      lastWorkedAt: new Date(2026, 7, 23, 0, 0, 0),
      statusOverride: null,
    });
    const territory = makeTerritory([before], { rotationDays: 30 });
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('p1', 'Ana')]),
      getTerritory: jest.fn(async () => makeTerritory([after], { rotationDays: 30 })),
    });

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    expect(screen.getByText('Nunca trabalhada (forçado)')).toBeTruthy();

    await press(screen.getByTestId('block-row-a'));
    await press(await screen.findByTestId('publisher-p1'));
    await press(screen.getByTestId('mark-worked'));

    expect(api.getTerritory).toHaveBeenCalledWith('territory-1');
    expect(await screen.findByText('Em dia')).toBeTruthy();
    expect(screen.getByText('Última visita: 23/08/2026')).toBeTruthy();
    expect(screen.queryByText('Nunca trabalhada (forçado)')).toBeNull();
  });

  it('mostra o erro do servidor numa região acessível e preserva o que foi escolhido', async () => {
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('p1', 'Ana')]),
      markWorked: jest.fn(async () => {
        throw new Error('O publicador não pertence a esta congregação.');
      }),
      getTerritory: jest.fn(async () => territory),
    });

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));
    await press(await screen.findByTestId('publisher-p1'));
    await pickDate(new Date(2026, 7, 20, 0, 0, 0));

    await press(screen.getByTestId('mark-worked'));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('O publicador não pertence a esta congregação.')).toBeTruthy();
    // Nothing was written, so nothing is reloaded -- and the form is still
    // filled in, ready for a second tap.
    expect(api.getTerritory).not.toHaveBeenCalled();
    expect(screen.getByTestId('publisher-p1').props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('Data: 20/08/2026')).toBeTruthy();
    expect(screen.getByTestId('mark-worked').props.accessibilityState.disabled).toBe(false);
  });

  it('diz que o publicador não precisa ser o dirigente e que o registro desfaz o status forçado', async () => {
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })], {
      assignedPublisher: { id: 'p1', name: 'Ana' },
    });
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('p1', 'Ana'), makePublisher('p2', 'Bruno')]),
    });

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));
    await screen.findByTestId('publisher-p2');

    expect(screen.getByText(/não precisa ser o dirigente/)).toBeTruthy();
    expect(screen.getByText(/desfaz o status que tenha sido forçado/)).toBeTruthy();
    // The territory's own leader is not preselected: the admin chooses, so a
    // record never lands on the wrong name by default.
    expect(screen.getByTestId('publisher-p1').props.accessibilityState.selected).toBe(false);
  });

  it('mostra o erro quando o histórico da quadra não carrega', async () => {
    const api = makeApi({
      listWorkLogs: jest.fn(async () => {
        throw new Error('O servidor respondeu 500 sem explicar o motivo.');
      }),
    });
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('O servidor respondeu 500 sem explicar o motivo.')).toBeTruthy();
  });

  it('mostra o erro quando a lista de publicadores não carrega', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => {
        throw new Error('');
      }),
    });
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));

    // An error with nothing to say falls back to this screen's own wording.
    expect(await screen.findByText('Não foi possível carregar os publicadores.')).toBeTruthy();
  });

  it('avisa que o registro foi gravado quando só a recarga da quadra falha', async () => {
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);
    const api = makeApi({
      listPublishers: jest.fn(async () => [makePublisher('p1', 'Ana')]),
      getTerritory: jest.fn(async () => {
        throw new Error('');
      }),
    });

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));
    await press(await screen.findByTestId('publisher-p1'));
    await press(screen.getByTestId('mark-worked'));

    expect(api.markWorked).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText('O registro foi gravado, mas não foi possível recarregar a quadra.'),
    ).toBeTruthy();
    expect(screen.getByTestId('mark-worked').props.accessibilityState.disabled).toBe(false);
  });

  it('mantém a data quando o seletor é fechado sem escolher nada', async () => {
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={makeApi()} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));
    await press(screen.getByTestId('pick-date'));

    await act(async () => {
      fireEvent(screen.getByTestId('date-picker'), 'change', { type: 'dismissed' }, undefined);
    });

    expect(screen.getByText('Data: 23/08/2026')).toBeTruthy();
    expect(screen.queryByTestId('date-picker')).toBeNull();
  });

  it('usa o relógio real quando nenhum "hoje" é informado', async () => {
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1, lastWorkedAt: null })]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={makeApi()} />,
    );

    expect(screen.getByText('Nunca trabalhada')).toBeTruthy();
  });

  it('não escreve nada depois que o painel é fechado com a carga ainda em voo', async () => {
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);
    let settlePublishers: (publishers: Publisher[]) => void = () => {};
    const api = makeApi({
      listPublishers: jest.fn(
        () =>
          new Promise<Publisher[]>(resolve => {
            settlePublishers = resolve;
          }),
      ),
    });

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));
    await press(screen.getByTestId('block-row-a'));

    await act(async () => {
      settlePublishers([makePublisher('p1', 'Ana')]);
    });

    expect(screen.queryByTestId('publisher-p1')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('não mostra erro de uma carga que falhou depois de o painel ser fechado', async () => {
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);
    let failPublishers: (reason: Error) => void = () => {};
    const api = makeApi({
      listPublishers: jest.fn(
        () =>
          new Promise<Publisher[]>((_resolve, reject) => {
            failPublishers = reject;
          }),
      ),
    });

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByTestId('block-row-a'));
    await press(screen.getByTestId('block-row-a'));

    await act(async () => {
      failPublishers(new Error('O servidor respondeu 500 sem explicar o motivo.'));
    });

    // The panel the admin closed does not come back to complain about it.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // --- O mapa embutido -------------------------------------------------------

  it('mostra o mapa do território com suas quadras quando há alguma', async () => {
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={makeApi()} now={NOW} />,
    );

    expect(screen.getByTestId('blocks-map')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Quadra 1 no mapa' })).toBeOnTheScreen();
  });

  it('não desenha o mapa quando o território não tem quadra nenhuma', async () => {
    const territory = makeTerritory([]);

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={makeApi()} now={NOW} />,
    );

    expect(screen.queryByTestId('blocks-map')).not.toBeOnTheScreen();
  });

  it('tocar numa quadra no mapa abre a mesma seção que tocar na sua linha abre', async () => {
    const territory = makeTerritory([makeBlock({ id: 'a', number: 1 })]);
    const api = makeApi({ listWorkLogs: jest.fn(async () => [makeWorkLog({ blockId: 'a' })]) });

    await render(
      <BlocksScreen territory={territory} session={makeSession()} api={api} now={NOW} />,
    );
    await press(screen.getByRole('button', { name: 'Quadra 1 no mapa' }));

    expect(api.listWorkLogs).toHaveBeenCalledWith('a');

    // Tocar de novo, agora no mapa, fecha a mesma seção que abriu.
    await press(screen.getByRole('button', { name: 'Quadra 1 no mapa' }));
    await waitFor(() =>
      expect(
        screen.getByTestId('block-row-a').props.accessibilityState.expanded,
      ).toBe(false),
    );
  });
});
