import React from 'react';
import { Alert, BackHandler } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../data/api-client';
import { TerritoryDetailScreen } from './TerritoryDetailScreen';
import type {
  TerritoryDetailScreenApi,
  TerritoryDetailScreenSession,
} from './TerritoryDetailScreen';
import type { Assignment, Block, Publisher, Territory, WorkLog } from '../../domain/models';

jest.mock('@react-native-community/datetimepicker', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactModule = require('react');
  const { View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    __esModule: true,
    default: function MockDateTimePicker() {
      return ReactModule.createElement(View, { testID: 'date-picker' });
    },
  };
});

jest.mock('../map/AssignmentsMapView', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactModule = require('react');
  const { View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { __esModule: true, AssignmentsMapView: () => ReactModule.createElement(View) };
});

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-7', territoryId: 'territory-1', number: 7, polygon: [], lastWorkedAt: null,
    statusOverride: null, ...overrides,
  };
}

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'territory-1', name: 'Centro - N1', boundary: [], assignedPublisher: null,
    rotationDays: null, blocks: [makeBlock()], ...overrides,
  };
}

function makePublisher(id = 'publisher-1', name = 'Ana'): Publisher {
  return { id, name, accessCode: null, accessCodeExpiresAt: null, activatedAt: null, isActive: true };
}

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'assignment-1', territoryId: 'territory-1', publisher: { id: 'publisher-1', name: 'Ana' },
    startedAt: new Date(2026, 0, 10), completedAt: null, ...overrides,
  };
}

function makeWorkLog(): WorkLog {
  return {
    id: 'work-1', blockId: 'block-7', publisher: { id: 'publisher-1', name: 'Ana' },
    workedAt: new Date(2026, 0, 10),
  };
}

function makeSession(): TerritoryDetailScreenSession & { run: jest.Mock } {
  const run: jest.Mock = jest.fn((action: () => Promise<unknown>) => action());
  return { run };
}

interface FakeApi extends TerritoryDetailScreenApi {
  getTerritory: jest.Mock;
  listAssignments: jest.Mock;
  listPublishers: jest.Mock;
  designate: jest.Mock;
  completeAssignment: jest.Mock;
  deleteAssignment: jest.Mock;
  updateAssignment: jest.Mock;
  listWorkLogs: jest.Mock;
  markWorked: jest.Mock;
  deleteWorkLog: jest.Mock;
}

function makeApi(overrides: Partial<FakeApi> = {}): FakeApi {
  return {
    getTerritory: jest.fn(async () => makeTerritory()),
    listAssignments: jest.fn(async () => [] as Assignment[]),
    listPublishers: jest.fn(async () => [makePublisher()]),
    designate: jest.fn(async () => makeAssignment()),
    completeAssignment: jest.fn(async () => makeAssignment()),
    deleteAssignment: jest.fn(async () => undefined),
    updateAssignment: jest.fn(async () => undefined),
    listWorkLogs: jest.fn(async () => [] as WorkLog[]),
    markWorked: jest.fn(async () => makeWorkLog()),
    deleteWorkLog: jest.fn(async () => undefined),
    ...overrides,
  };
}

async function press(element: Parameters<typeof fireEvent.press>[0]): Promise<void> {
  await act(async () => { fireEvent.press(element); });
}

describe('TerritoryDetailScreen', () => {
  beforeEach(() => jest.spyOn(Alert, 'alert').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('carrega o território da rota e alterna entre designações e quadras em uma única rolagem', async () => {
    const api = makeApi();
    await render(<TerritoryDetailScreen territoryId="territory-1" api={api} session={makeSession()} />);

    await screen.findByText('Dirigente atual');
    expect(api.getTerritory).toHaveBeenCalledWith('territory-1');
    expect(screen.getAllByTestId('territory-detail-scroll')).toHaveLength(1);

    await press(screen.getByRole('tab', { name: 'Quadras' }));
    expect(await screen.findByText('Quadra 7')).toBeTruthy();
    expect(screen.getAllByTestId('territory-detail-scroll')).toHaveLength(1);

    await press(screen.getByRole('tab', { name: 'Designações' }));
    expect(await screen.findByText('Dirigente atual')).toBeTruthy();
  });

  it('abre na aba pedida e o voltar do aparelho fecha a quadra antes de sair do território', async () => {
    let handleBack: ((...args: never[]) => boolean | null | undefined) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
      handleBack = listener;
      return { remove: jest.fn() };
    });
    await render(
      <TerritoryDetailScreen
        territoryId="territory-1"
        api={makeApi()}
        session={makeSession()}
        initialSegment="blocks"
      />,
    );

    await press(await screen.findByLabelText(/^Quadra 7,/));
    expect(await screen.findByText('Ações desta quadra')).toBeTruthy();

    await act(async () => {
      expect(handleBack?.()).toBe(true);
    });
    expect(screen.queryByText('Ações desta quadra')).toBeNull();
    expect(screen.getByLabelText(/^Quadra 7,/)).toBeTruthy();
  });

  it('recarrega o território correto depois de designar', async () => {
    const initial = makeTerritory({ assignedPublisher: null });
    const refreshed = makeTerritory({ assignedPublisher: { id: 'publisher-1', name: 'Ana' } });
    const api = makeApi({
      getTerritory: jest.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(refreshed),
    });
    await render(<TerritoryDetailScreen territoryId="territory-1" api={api} session={makeSession()} />);

    await screen.findByText('Designar a…');
    await press(screen.getByRole('radio', { name: 'Ana' }));
    await press(screen.getByRole('button', { name: 'Designar publicador' }));

    await waitFor(() => expect(api.designate).toHaveBeenCalledWith('territory-1', 'publisher-1'));
    await waitFor(() => expect(api.getTerritory).toHaveBeenCalledTimes(2));
    expect(api.getTerritory.mock.calls[1]).toEqual(['territory-1']);
  });

  it('fecha o detalhe obsoleto quando o território some após uma escrita', async () => {
    const onTerritoryRemoved = jest.fn();
    const api = makeApi({
      getTerritory: jest
        .fn()
        .mockResolvedValueOnce(makeTerritory())
        .mockRejectedValueOnce(new ApiError(404, 'Território não encontrado.')),
    });
    await render(
      <TerritoryDetailScreen
        territoryId="territory-1"
        api={api}
        session={makeSession()}
        onTerritoryRemoved={onTerritoryRemoved}
      />,
    );

    await screen.findByText('Designar a…');
    await press(screen.getByRole('radio', { name: 'Ana' }));
    await press(screen.getByRole('button', { name: 'Designar publicador' }));

    await waitFor(() => expect(onTerritoryRemoved).toHaveBeenCalledTimes(1));
  });
});
