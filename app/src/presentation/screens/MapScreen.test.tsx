// Covers the parts of `MapScreen` that are plain React: the search box and
// the filter chips. `TerritoryMapView` is mocked out -- it wraps a native
// MapLibre view that cannot render in Jest (CLAUDE.md, "risco assumido").
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { Session, Territory } from '../../domain/models';
import type { TerritoryMapViewProps } from '../map/TerritoryMapView';
import { MapScreen } from './MapScreen';

// Captures the props the screen hands the (native, untestable) map, so a
// block tap can be simulated without a MapLibre view.
const mapProps: { current: TerritoryMapViewProps | null } = { current: null };
jest.mock('../map/TerritoryMapView', () => ({
  TerritoryMapView: (props: TerritoryMapViewProps) => {
    mapProps.current = props;
    return null;
  },
}));

// Pulled in through `work-log-queue`, which this screen imports for its
// types; both are native modules with no place in a component test.
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {} }));
jest.mock('uuid', () => ({ v4: () => 'fake-uuid' }));
jest.mock('react-native-config', () => ({
  __esModule: true,
  default: { API_BASE_URL: 'https://territory.example.test', APP_KEY: 'the-app-key' },
}));

const session: Session = {
  token: 'token-1',
  user: { id: 'user-1', name: 'Maria' },
  congregation: { id: 'cong-1', name: 'Congregação Central', city: 'Santa Helena' },
};

const block = { id: 'b1', number: 7, polygon: [], lastWorkedAt: undefined };

function territory(id: string, name: string, assignedToMe = false): Territory {
  return {
    id,
    name,
    boundary: [],
    blocks: [block],
    assignedUser: assignedToMe ? { id: 'user-1', name: 'Maria' } : undefined,
  };
}

const territories = [
  territory('t1', 'Santa Helena - N 7', true),
  territory('t2', 'Vila Guarani - N14'),
  territory('t3', 'Próximo ao centro - N12'),
];

async function renderScreen() {
  return await render(
    <MapScreen
      session={session}
      apiClient={{ listTerritories: jest.fn().mockResolvedValue(territories) }}
      workLogQueue={{ enqueue: jest.fn(), drain: jest.fn() }}
    />,
  );
}

describe('MapScreen search', () => {
  it('lists every territory as a chip once they load', async () => {
    await renderScreen();
    expect(await screen.findByText('Santa Helena - N 7')).toBeTruthy();
    expect(screen.getByText('Vila Guarani - N14')).toBeTruthy();
  });

  it('narrows the chips to the ones matching what was typed', async () => {
    await renderScreen();
    await screen.findByText('Santa Helena - N 7');

    await fireEvent.changeText(screen.getByLabelText('Buscar território pelo nome'), 'guarani');

    expect(screen.getByText('Vila Guarani - N14')).toBeTruthy();
    expect(screen.queryByText('Santa Helena - N 7')).toBeNull();
  });

  it('keeps the "Todos" chip reachable while searching', async () => {
    await renderScreen();
    await screen.findByText('Santa Helena - N 7');

    await fireEvent.changeText(screen.getByLabelText('Buscar território pelo nome'), 's');

    expect(screen.getByText('Todos')).toBeTruthy();
    expect(screen.getByText('Meu(s) território(s)')).toBeTruthy();
  });

  it('finds a territory typed without its spacing', async () => {
    await renderScreen();
    await screen.findByText('Santa Helena - N 7');

    await fireEvent.changeText(screen.getByLabelText('Buscar território pelo nome'), 'n7');

    expect(screen.getByText('Santa Helena - N 7')).toBeTruthy();
  });

  it('tells the publisher when nothing matches', async () => {
    await renderScreen();
    await screen.findByText('Santa Helena - N 7');

    await fireEvent.changeText(screen.getByLabelText('Buscar território pelo nome'), 'jardim');

    expect(screen.getByText('Nenhum território com esse nome.')).toBeTruthy();
  });
});

describe('MapScreen marking a block as worked', () => {
  it('queues the visit when the block is in a territory assigned to the publisher', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const drain = jest.fn().mockResolvedValue(undefined);
    await render(
      <MapScreen
        session={session}
        apiClient={{ listTerritories: jest.fn().mockResolvedValue(territories) }}
        workLogQueue={{ enqueue, drain }}
      />,
    );
    await screen.findByText('Santa Helena - N 7');

    // 't1' is assigned to this publisher -- see `territories` above.
    await act(async () => mapProps.current?.onBlockTap?.(territories[0], block));
    await fireEvent.press(await screen.findByText('Confirmar'));

    expect(enqueue).toHaveBeenCalledWith('b1', expect.any(Date));
  });

  it('refuses, with a reason, when the territory is not assigned to the publisher', async () => {
    const enqueue = jest.fn();
    await render(
      <MapScreen
        session={session}
        apiClient={{ listTerritories: jest.fn().mockResolvedValue(territories) }}
        workLogQueue={{ enqueue, drain: jest.fn() }}
      />,
    );
    await screen.findByText('Santa Helena - N 7');

    // 't2' has no assigned publisher at all -- the case the congregation is
    // in before anyone designates territories in the admin.
    await act(async () => mapProps.current?.onBlockTap?.(territories[1], block));

    expect(screen.getByText(/não está designado a você/)).toBeTruthy();
    expect(screen.queryByText('Confirmar')).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('tells the publisher when the visit could not even be queued on the device', async () => {
    const enqueue = jest.fn().mockRejectedValue(new Error('storage full'));
    await render(
      <MapScreen
        session={session}
        apiClient={{ listTerritories: jest.fn().mockResolvedValue(territories) }}
        workLogQueue={{ enqueue, drain: jest.fn() }}
      />,
    );
    await screen.findByText('Santa Helena - N 7');

    await act(async () => mapProps.current?.onBlockTap?.(territories[0], block));
    await fireEvent.press(await screen.findByText('Confirmar'));

    expect(screen.getByText(/Não foi possível registrar a marcação/)).toBeTruthy();
  });
});
