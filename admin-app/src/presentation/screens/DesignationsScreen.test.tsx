/**
 * The admin app's home screen (spec 0012, Task 10): who is holding each
 * territory, on a map and in a list.
 *
 * Both collaborators are injected -- the `session` of `data/session.ts` and the
 * API client it holds the token of -- so no test here reaches the network or
 * the Android keystore. The MapLibre view underneath is a native component and
 * is not exercised by Jest (see CLAUDE.md, "Testes"); what these tests assert
 * about it is only what this screen hands it and what it hands back.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { DesignationsScreen, NO_TERRITORIES_MESSAGE } from './DesignationsScreen';
import type { DesignationsScreenApi, DesignationsScreenSession } from './DesignationsScreen';
import { TERRITORY_SCOPE_NOTE } from './BlockPanel';
import type { AssignmentsMapViewProps } from '../map/AssignmentsMapView';
import type { Assignment, Block, Publisher, Territory } from '../../domain/models';

// The combined panel opens the date picker, which is a native module.
jest.mock('@react-native-community/datetimepicker', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactModule = require('react');
  const { View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    __esModule: true,
    default: function MockDateTimePicker(props: { value: Date }) {
      return ReactModule.createElement(View, { testID: 'date-picker', value: props.value });
    },
  };
});

// The map draws through MapLibre's native view, which CLAUDE.md keeps out of
// the automated tests on purpose. Standing in for it here is a button per
// territory that calls `onSelectTerritory`: what this screen owes the map is
// the list it draws and the handler it calls back, and that is exactly what
// this stub exercises. Typed with the real props, so renaming one on the map
// breaks this file at compile time instead of silently.
jest.mock('../map/AssignmentsMapView', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactModule = require('react');
  const { Pressable, Text, View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    __esModule: true,
    AssignmentsMapView: function MockAssignmentsMapView({
      territories,
      onSelectTerritory,
      onSelectBlock,
    }: AssignmentsMapViewProps) {
      return ReactModule.createElement(
        View,
        { testID: 'assignments-map' },
        territories.flatMap((territory: Territory) => [
          ReactModule.createElement(
            Pressable,
            {
              key: territory.id,
              accessibilityRole: 'button',
              accessibilityLabel: `Território ${territory.name} no mapa`,
              onPress: () => onSelectTerritory?.(territory),
            },
            ReactModule.createElement(Text, null, territory.name),
          ),
          // A block is tapped on the map the same way a territory is, so the
          // stub offers one button per block calling `onSelectBlock` with the
          // block *and* the territory that owns it.
          ...territory.blocks.map((block: Block) =>
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
        ]),
      );
    },
  };
});

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

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-7',
    territoryId: 'territory-1',
    number: 7,
    polygon: [],
    lastWorkedAt: null,
    statusOverride: null,
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

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'assignment-1',
    territoryId: 'territory-1',
    publisher: { id: 'publisher-1', name: 'Ana' },
    startedAt: new Date(2026, 0, 10),
    completedAt: null,
    ...overrides,
  };
}

/**
 * The session, passing actions straight through the way a signed-in one does,
 * and recording that it was asked -- no screen may reach the API around it.
 */
function makeSession(): DesignationsScreenSession & { run: jest.Mock } {
  const run: jest.Mock = jest.fn((action: () => Promise<unknown>) => action());
  return { run };
}

/** Every method a `jest.Mock`, so a test can both stub and assert on it. */
interface FakeApi extends DesignationsScreenApi {
  listTerritoriesWithBlocks: jest.Mock;
  listAssignments: jest.Mock;
  listPublishers: jest.Mock;
  designate: jest.Mock;
  completeAssignment: jest.Mock;
  deleteAssignment: jest.Mock;
  listWorkLogs: jest.Mock;
  markWorked: jest.Mock;
  deleteWorkLog: jest.Mock;
  getTerritory: jest.Mock;
}

function makeApi(overrides: Partial<FakeApi> = {}): FakeApi {
  return {
    listTerritoriesWithBlocks: jest.fn(async () => [] as Territory[]),
    listAssignments: jest.fn(async () => [] as Assignment[]),
    listPublishers: jest.fn(async () => [] as Publisher[]),
    designate: jest.fn(async () => undefined),
    completeAssignment: jest.fn(async () => undefined),
    deleteAssignment: jest.fn(async () => undefined),
    listWorkLogs: jest.fn(async () => []),
    markWorked: jest.fn(async () => undefined),
    deleteWorkLog: jest.fn(async () => undefined),
    getTerritory: jest.fn(async () => makeTerritory()),
    ...overrides,
  };
}

/**
 * Presses an element and lets the effects that press starts settle inside
 * `act`. A bare `fireEvent.press` opens a panel and returns before its fetch
 * resolves, so the state update would land outside `act` and React would warn.
 */
async function press(element: Parameters<typeof fireEvent.press>[0]): Promise<void> {
  await act(async () => {
    fireEvent.press(element);
  });
}

/**
 * Picks a publisher in the *territory* half of the block panel. Both halves
 * offer the same congregation, so the name alone is ambiguous there; the
 * assignment card is the lower of the two, hence the last match.
 */
async function pressTerritoryPublisher(name: string): Promise<void> {
  const options = screen.getAllByRole('radio', { name });
  await press(options[options.length - 1]);
}

function renderScreen(api: FakeApi, session = makeSession()) {
  return render(<DesignationsScreen api={api} session={session} />);
}

interface AlertButtonLike {
  text?: string;
  style?: string;
  onPress?: () => void;
}

/** What a row says when nobody is responsible -- asserted after concluding. */
const NO_LEADER_LABEL_TEXT = 'Sem dirigente';

/**
 * `Alert` is a native module: under Jest it never draws, so the confirmation is
 * read off the mock's last call. Same helper the `AssignmentPanel` tests use.
 */
function lastAlert(): { message: string; buttons: AlertButtonLike[] } {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const call = calls[calls.length - 1];
  return { message: String(call[1]), buttons: (call[2] ?? []) as AlertButtonLike[] };
}

/** The button that is not "Cancelar" -- pressing it means "yes". */
async function confirmLastAlert(): Promise<void> {
  const confirm = lastAlert().buttons.find(button => button.style !== 'cancel');
  expect(confirm).toBeDefined();
  // `await` no próprio `onPress`: o desta tela é `async`, e um act que não o
  // aguarda fica aberto depois do teste e faz o render do seguinte não montar
  // nada.
  await act(async () => {
    await confirm?.onPress?.();
  });
}

describe('DesignationsScreen', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows only the loading indicator while the territories have not arrived', async () => {
    // Held open on purpose: this is the moment an empty list would read as
    // "this congregation has no territories", which is a different fact.
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(() => new Promise<Territory[]>(() => {})),
    });

    await renderScreen(api);

    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
    expect(screen.queryByTestId('territory-row-territory-1')).not.toBeOnTheScreen();
  });

  it('lists every territory with its name and the publisher holding it', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({
          id: 'territory-1',
          name: 'Centro',
          assignedPublisher: { id: 'publisher-1', name: 'Ana' },
        }),
        makeTerritory({ id: 'territory-2', name: 'Vila Nova', assignedPublisher: null }),
      ]),
    });

    await renderScreen(api);

    const assigned = await screen.findByTestId('territory-row-territory-1');
    expect(within(assigned).getByText('Centro')).toBeOnTheScreen();
    expect(within(assigned).getByText('Ana')).toBeOnTheScreen();

    // Not a blank space: "nobody is responsible for this one" is a fact the
    // admin acts on, so the row says it out loud.
    const free = screen.getByTestId('territory-row-territory-2');
    expect(within(free).getByText('Vila Nova')).toBeOnTheScreen();
    expect(within(free).getByText('Sem dirigente')).toBeOnTheScreen();
  });

  it('summarises how many of the territories have a publisher on them', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({ id: 'territory-1', assignedPublisher: { id: 'p1', name: 'Ana' } }),
        makeTerritory({ id: 'territory-2', name: 'Vila Nova', assignedPublisher: null }),
        makeTerritory({
          id: 'territory-3',
          name: 'Jardim',
          assignedPublisher: { id: 'p2', name: 'Bruno' },
        }),
      ]),
    });

    await renderScreen(api);

    expect(await screen.findByText('2 de 3 territórios designados')).toBeOnTheScreen();
  });

  it('explains where territories come from instead of showing a bare empty list', async () => {
    const api = makeApi({ listTerritoriesWithBlocks: jest.fn(async () => []) });

    await renderScreen(api);

    // Drawing a territory is one of the things this app deliberately does not
    // do, so an empty congregation has to point at where it is done.
    expect(await screen.findByText(/admin do computador/i)).toBeOnTheScreen();
  });

  it('reports a failed load to the screen reader and offers to try again', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => {
        throw new Error('Sem conexão com o servidor.');
      }),
    });

    await renderScreen(api);

    // The server's own words, in a region a screen reader announces -- a
    // silent empty list would read as "there is nothing here".
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor.');
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeOnTheScreen();
  });

  it('asks the API again when "Recarregar" is tapped, and clears the failure it succeeded past', async () => {
    const listTerritoriesWithBlocks = jest
      .fn<Promise<Territory[]>, []>()
      .mockRejectedValueOnce(new Error('Sem conexão com o servidor.'))
      .mockResolvedValueOnce([makeTerritory({ id: 'territory-1', name: 'Centro' })]);
    const api = makeApi({ listTerritoriesWithBlocks });

    await renderScreen(api);
    await screen.findByRole('alert');
    await press(screen.getByRole('button', { name: 'Recarregar' }));

    expect(listTerritoriesWithBlocks).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId('territory-row-territory-1')).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('opens the S-13 panel of the territory that was tapped, and not of another', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({ id: 'territory-1', name: 'Centro' }),
        makeTerritory({ id: 'territory-2', name: 'Vila Nova' }),
      ]),
      listAssignments: jest.fn(async () => [
        makeAssignment({ territoryId: 'territory-2', publisher: { id: 'p2', name: 'Bruno' } }),
      ]),
    });

    await renderScreen(api);
    await screen.findByTestId('territory-row-territory-2');
    await press(screen.getByRole('button', { name: 'Ver designações de Vila Nova' }));

    expect(screen.getByText('Designações de Vila Nova')).toBeOnTheScreen();
    expect(screen.queryByText('Designações de Centro')).not.toBeOnTheScreen();
    // The card it loaded is that territory's, not the first one's.
    expect(api.listAssignments).toHaveBeenCalledWith('territory-2');
  });

  it('shows the new leader in the list as soon as the panel designates one', async () => {
    const free = makeTerritory({ id: 'territory-1', name: 'Centro', assignedPublisher: null });
    const taken = { ...free, assignedPublisher: { id: 'publisher-1', name: 'Ana' } };
    const listTerritoriesWithBlocks = jest
      .fn<Promise<Territory[]>, []>()
      .mockResolvedValueOnce([free])
      .mockResolvedValue([taken]);
    const listAssignments = jest
      .fn<Promise<Assignment[]>, [string]>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([makeAssignment()]);
    const api = makeApi({
      listTerritoriesWithBlocks,
      listAssignments,
      listPublishers: jest.fn(async () => [makePublisher('publisher-1', 'Ana')]),
    });

    await renderScreen(api);
    await screen.findByTestId('territory-row-territory-1');
    await press(screen.getByRole('button', { name: 'Ver designações de Centro' }));
    await press(screen.getByRole('radio', { name: 'Ana' }));
    await press(screen.getByRole('button', { name: 'Designar' }));

    expect(api.designate).toHaveBeenCalledWith('territory-1', 'publisher-1');
    // Behind the panel, without the admin having to leave the screen and come
    // back: `assignedPublisher` is a projection of what he just changed.
    const row = screen.getByTestId('territory-row-territory-1');
    expect(within(row).getByText('Ana')).toBeOnTheScreen();
    expect(within(row).queryByText('Sem dirigente')).not.toBeOnTheScreen();
    expect(screen.getByText('1 de 1 territórios designados')).toBeOnTheScreen();
  });

  it('hands the loaded territories to the map and opens the blocks screen of one tapped there', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({ id: 'territory-1', name: 'Centro' }),
        makeTerritory({
          id: 'territory-2',
          name: 'Vila Nova',
          blocks: [makeBlock({ id: 'block-9', territoryId: 'territory-2', number: 9 })],
        }),
      ]),
    });

    await renderScreen(api);
    await screen.findByTestId('assignments-map');
    await press(screen.getByRole('button', { name: 'Território Vila Nova no mapa' }));

    // Tapping the territory itself -- not a block -- opens the blocks/work
    // history screen, not the S-13 card: on the map the admin is already
    // looking at the blocks, and the next question is what has been worked.
    expect(screen.getByLabelText('Quadra 9')).toBeOnTheScreen();
    expect(screen.queryByText('Designações de Vila Nova')).not.toBeOnTheScreen();
  });

  it('opens the blocks of a territory from its own row', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({
          id: 'territory-1',
          name: 'Centro',
          blocks: [
            {
              id: 'block-7',
              territoryId: 'territory-1',
              number: 7,
              polygon: [],
              lastWorkedAt: null,
              statusOverride: null,
            },
          ],
        }),
      ]),
    });

    await renderScreen(api);
    await screen.findByTestId('territory-row-territory-1');
    await press(screen.getByRole('button', { name: 'Ver quadras de Centro' }));

    expect(screen.getByLabelText('Quadra 7')).toBeOnTheScreen();
    // The blocks and the S-13 card are two different questions: opening one
    // must not open the other on top of it.
    expect(screen.queryByText('Designações de Centro')).not.toBeOnTheScreen();
  });

  it('comes back to the list from a territory that was open', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({ id: 'territory-1', name: 'Centro' }),
      ]),
    });

    await renderScreen(api);
    await screen.findByTestId('territory-row-territory-1');
    await press(screen.getByRole('button', { name: 'Ver designações de Centro' }));
    await press(screen.getByRole('button', { name: 'Voltar para a lista' }));

    expect(screen.queryByText('Designações de Centro')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ver designações de Centro' })).toBeOnTheScreen();
  });

  it('opens the panel of the block tapped on the map, with the territory that owns it', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({
          id: 'territory-1',
          name: 'Centro',
          blocks: [makeBlock({ id: 'block-7', number: 7 })],
        }),
        makeTerritory({
          id: 'territory-2',
          name: 'Vila Nova',
          blocks: [makeBlock({ id: 'block-3', territoryId: 'territory-2', number: 3 })],
        }),
      ]),
    });

    await renderScreen(api);
    await screen.findByTestId('assignments-map');
    await press(screen.getByRole('button', { name: 'Quadra 3 no mapa' }));

    // That block, and the territory it sits in -- not the first of either.
    expect(screen.getByText('Quadra 3')).toBeOnTheScreen();
    expect(screen.getByText('Território: Vila Nova')).toBeOnTheScreen();
    expect(screen.queryByText('Quadra 7')).not.toBeOnTheScreen();
    expect(api.listWorkLogs).toHaveBeenCalledWith('block-3');
    expect(api.listAssignments).toHaveBeenCalledWith('territory-2');
  });

  it('opens the blocks screen, not the S-13 card nor the combined block panel, when the territory itself is tapped', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({ id: 'territory-1', name: 'Centro', blocks: [makeBlock()] }),
      ]),
    });

    await renderScreen(api);
    await screen.findByTestId('assignments-map');
    await press(screen.getByRole('button', { name: 'Território Centro no mapa' }));

    expect(screen.getByLabelText('Quadra 7')).toBeOnTheScreen();
    expect(screen.queryByText('Designações de Centro')).not.toBeOnTheScreen();
    // The note only the combined block panel carries -- tapping the
    // territory, not a block, must not land there either.
    expect(screen.queryByText(TERRITORY_SCOPE_NOTE)).not.toBeOnTheScreen();
  });

  it('comes back to the map and the list from a block panel that was open', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({ id: 'territory-1', name: 'Centro', blocks: [makeBlock()] }),
      ]),
    });

    await renderScreen(api);
    await screen.findByTestId('assignments-map');
    await press(screen.getByRole('button', { name: 'Quadra 7 no mapa' }));
    await press(screen.getByRole('button', { name: 'Voltar para a lista' }));

    expect(screen.queryByText(TERRITORY_SCOPE_NOTE)).not.toBeOnTheScreen();
    expect(screen.getByTestId('assignments-map')).toBeOnTheScreen();
    expect(screen.getByTestId('territory-row-territory-1')).toBeOnTheScreen();
  });

  it('reloads the territories when something changes inside the block panel', async () => {
    const territory = makeTerritory({
      id: 'territory-1',
      name: 'Centro',
      assignedPublisher: null,
      blocks: [makeBlock()],
    });
    const listTerritoriesWithBlocks = jest
      .fn<Promise<Territory[]>, []>()
      .mockResolvedValueOnce([territory])
      .mockResolvedValue([
        { ...territory, assignedPublisher: { id: 'publisher-1', name: 'Ana' } },
      ]);
    const api = makeApi({
      listTerritoriesWithBlocks,
      listPublishers: jest.fn(async () => [makePublisher('publisher-1', 'Ana')]),
    });

    await renderScreen(api);
    await screen.findByTestId('assignments-map');
    await press(screen.getByRole('button', { name: 'Quadra 7 no mapa' }));
    await pressTerritoryPublisher('Ana');
    await press(screen.getByRole('button', { name: 'Designar' }));

    // The block's colour and the territory's leader are both drawn behind this
    // panel, so a write in here has to pull the list again.
    expect(api.designate).toHaveBeenCalledWith('territory-1', 'publisher-1');
    expect(listTerritoriesWithBlocks).toHaveBeenCalledTimes(2);
    const row = screen.getByTestId('territory-row-territory-1');
    expect(within(row).getByText('Ana')).toBeOnTheScreen();
  });

  it('announces a failed reload without closing the block panel', async () => {
    const territory = makeTerritory({
      id: 'territory-1',
      name: 'Centro',
      blocks: [makeBlock()],
    });
    const listTerritoriesWithBlocks = jest
      .fn<Promise<Territory[]>, []>()
      .mockResolvedValueOnce([territory])
      .mockRejectedValue(new Error('Sem conexão com o servidor.'));
    const api = makeApi({
      listTerritoriesWithBlocks,
      listPublishers: jest.fn(async () => [makePublisher('publisher-1', 'Ana')]),
    });

    await renderScreen(api);
    await screen.findByTestId('assignments-map');
    await press(screen.getByRole('button', { name: 'Quadra 7 no mapa' }));
    await pressTerritoryPublisher('Ana');
    await press(screen.getByRole('button', { name: 'Designar' }));

    // The write landed; only the refresh failed. Closing the panel would hide
    // that from the admin and throw away where he was.
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor.');
    expect(screen.getByText('Quadra 7')).toBeOnTheScreen();
  });

  it('closes the panel of a block that is no longer in the reloaded territory', async () => {
    const territory = makeTerritory({ id: 'territory-1', name: 'Centro' });
    const listTerritoriesWithBlocks = jest
      .fn<Promise<Territory[]>, []>()
      .mockResolvedValueOnce([{ ...territory, blocks: [makeBlock()] }])
      .mockResolvedValue([territory]);
    const api = makeApi({ listTerritoriesWithBlocks });

    await renderScreen(api);
    await screen.findByTestId('assignments-map');
    await press(screen.getByRole('button', { name: 'Quadra 7 no mapa' }));
    await press(screen.getByRole('button', { name: 'Recarregar' }));

    // Deleted from the desktop while the panel was open: better back to the
    // map than a panel describing a block that is not there any more.
    expect(screen.queryByText(TERRITORY_SCOPE_NOTE)).not.toBeOnTheScreen();
    // Not an empty overlay with a way out of it: the overlay itself is gone.
    expect(screen.queryByRole('button', { name: 'Voltar para a lista' })).not.toBeOnTheScreen();
    expect(screen.getByTestId('territory-row-territory-1')).toBeOnTheScreen();
  });

  it('says something readable when the failure carries no message of its own', async () => {
    const api = makeApi({
      // Not every rejection is an `Error` with words in it -- a thrown string,
      // a rejected `undefined`. The admin still has to be told the load failed.
      listTerritoriesWithBlocks: jest.fn(async () => {
        throw 'boom';
      }),
    });

    await renderScreen(api);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os territórios.',
    );
  });

  it('closes the detail of a territory that is no longer in the reloaded list', async () => {
    const listTerritoriesWithBlocks = jest
      .fn<Promise<Territory[]>, []>()
      .mockResolvedValueOnce([makeTerritory({ id: 'territory-1', name: 'Centro' })])
      .mockResolvedValue([]);
    const api = makeApi({ listTerritoriesWithBlocks });

    await renderScreen(api);
    await screen.findByTestId('territory-row-territory-1');
    await press(screen.getByRole('button', { name: 'Ver designações de Centro' }));
    await press(screen.getByRole('button', { name: 'Recarregar' }));

    // Better an honest empty list than a card describing something that is not
    // there any more.
    expect(screen.queryByText('Designações de Centro')).not.toBeOnTheScreen();
    expect(screen.getByText(NO_TERRITORIES_MESSAGE)).toBeOnTheScreen();
  });

  // --- Ordem da lista de territórios -----------------------------------

  it('ordena a lista pelo número do território, não pela ordem alfabética do nome', async () => {
    // O caso relatado: "Casarotto -N28" lê antes de "Centro" em ordem
    // alfabética, mas o número 28 vem depois de 5 e 6 na ordem que a
    // congregação lê a lista.
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({ id: 't1', name: 'Casarotto -N28' }),
        makeTerritory({ id: 't2', name: 'Centro - N5' }),
        makeTerritory({ id: 't3', name: 'Centro - N6' }),
      ]),
    });

    await renderScreen(api);
    await screen.findByTestId('territory-row-t1');

    // A ordem real das linhas, pelo id que `makeTerritory` deu a cada uma.
    const order = screen.getAllByTestId(/^territory-row-/).map(row => row.props.testID);
    expect(order).toEqual(['territory-row-t2', 'territory-row-t3', 'territory-row-t1']);
  });

  // --- Quantidade de quadras e concluir direto na linha ---------------------

  it('mostra quantas quadras cada território tem, na própria linha', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({
          id: 'territory-1',
          name: 'Centro',
          blocks: [makeBlock({ id: 'b1', number: 1 }), makeBlock({ id: 'b2', number: 2 })],
        }),
        makeTerritory({ id: 'territory-2', name: 'Jardim', blocks: [makeBlock({ id: 'b3' })] }),
        makeTerritory({ id: 'territory-3', name: 'Vila', blocks: [] }),
      ]),
    });

    await renderScreen(api);
    await screen.findByTestId('territory-row-territory-1');

    // Plural, singular e nenhuma: as três formas são lidas por quem percorre a
    // lista, e "1 quadras" seria ruído no meio delas.
    expect(
      within(screen.getByTestId('territory-row-territory-1')).getByText('2 quadras'),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('territory-row-territory-2')).getByText('1 quadra'),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('territory-row-territory-3')).getByText('Sem quadras'),
    ).toBeOnTheScreen();
  });

  it('só oferece "Marcar como concluído" na linha de território que tem dirigente', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({
          id: 'territory-1',
          name: 'Centro',
          assignedPublisher: { id: 'pub-1', name: 'Ana' },
        }),
        makeTerritory({ id: 'territory-2', name: 'Jardim', assignedPublisher: null }),
      ]),
    });

    await renderScreen(api);
    await screen.findByTestId('territory-row-territory-1');

    expect(screen.getByLabelText('Marcar Centro como concluído')).toBeOnTheScreen();
    // Território sem ninguém não tem designação a encerrar: o botão nem aparece,
    // em vez de aparecer e não fazer nada.
    expect(screen.queryByLabelText('Marcar Jardim como concluído')).not.toBeOnTheScreen();
  });

  it('confirmar na linha encerra a designação e recarrega a lista', async () => {
    const assigned = makeTerritory({
      id: 'territory-1',
      name: 'Centro',
      assignedPublisher: { id: 'pub-1', name: 'Ana' },
    });
    const freed = makeTerritory({ id: 'territory-1', name: 'Centro', assignedPublisher: null });
    const listTerritoriesWithBlocks = jest
      .fn<Promise<Territory[]>, []>()
      .mockResolvedValueOnce([assigned])
      .mockResolvedValue([freed]);
    const api = makeApi({ listTerritoriesWithBlocks });

    await renderScreen(api);
    await press(await screen.findByLabelText('Marcar Centro como concluído'));

    // O texto tem de dizer a consequência, não só a ação -- é a mesma frase que
    // o cartão S-13 mostra para o mesmo evento.
    expect(lastAlert().message).toContain('perde na hora o acesso para marcar quadras nele');

    await confirmLastAlert();

    expect(api.completeAssignment).toHaveBeenCalledWith('territory-1');
    expect(listTerritoriesWithBlocks).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(NO_LEADER_LABEL_TEXT)).toBeOnTheScreen();
  });

  it('cancelar na linha não chama a API', async () => {
    const api = makeApi({
      listTerritoriesWithBlocks: jest.fn(async () => [
        makeTerritory({ assignedPublisher: { id: 'pub-1', name: 'Ana' } }),
      ]),
    });

    await renderScreen(api);
    await press(await screen.findByLabelText('Marcar Centro como concluído'));
    const cancel = lastAlert().buttons.find(button => button.style === 'cancel');

    expect(cancel).toBeDefined();
    await act(async () => {
      await cancel?.onPress?.();
    });

    expect(api.completeAssignment).not.toHaveBeenCalled();
  });

  it('falha ao concluir pela linha aparece como alerta e não recarrega', async () => {
    const listTerritoriesWithBlocks = jest.fn(async () => [
      makeTerritory({ assignedPublisher: { id: 'pub-1', name: 'Ana' } }),
    ]);
    const api = makeApi({
      listTerritoriesWithBlocks,
      completeAssignment: jest.fn(async () => {
        throw new Error('Designação já encerrada.');
      }),
    });

    await renderScreen(api);
    await press(await screen.findByLabelText('Marcar Centro como concluído'));
    await confirmLastAlert();

    expect(screen.getByRole('alert')).toHaveTextContent('Designação já encerrada.');
    // Uma escrita recusada não mudou nada no servidor: recarregar só apagaria o
    // aviso da tela antes de o admin lê-lo.
    expect(listTerritoriesWithBlocks).toHaveBeenCalledTimes(1);
  });
});
