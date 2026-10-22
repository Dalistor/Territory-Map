// Covers the parts of `MapScreen` that are plain React: the search box and
// the filter chips. `TerritoryMapView` is mocked out -- it wraps a native
// MapLibre view that cannot render in Jest (AGENTS.md, "risco assumido").
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ApiErrorException, NetworkException } from '../../data/api-client';
import type { Campaign, Session, Territory } from '../../domain/models';
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
const workedBlock = { ...block, lastWorkedAt: new Date('2026-08-06T10:00:00Z') };
const now = new Date('2026-08-18T15:00:00Z');

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
      apiClient={{
        listTerritories: jest.fn().mockResolvedValue(territories),
        markBlockWorked: jest.fn(),
      }}
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

  it('clears search text when pressing the clear button (✕)', async () => {
    await renderScreen();
    await screen.findByText('Santa Helena - N 7');

    await fireEvent.changeText(screen.getByLabelText('Buscar território pelo nome'), 'guarani');
    expect(screen.getByText('Vila Guarani - N14')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Limpar busca'));

    expect(screen.getByText('Santa Helena - N 7')).toBeTruthy();
    expect(screen.getByText('Vila Guarani - N14')).toBeTruthy();
  });

  it('shows the floating bottom card when a specific territory is selected and allows resetting to all', async () => {
    await renderScreen();
    await screen.findByText('Santa Helena - N 7');

    await fireEvent.press(screen.getByText('Santa Helena - N 7'));

    expect(screen.getByText('Ver todos')).toBeTruthy();

    await fireEvent.press(screen.getByText('Ver todos'));

    expect(screen.queryByText('Ver todos')).toBeNull();
  });
});

describe('MapScreen marking a block as worked', () => {
  function renderWithMarker(markBlockWorked: jest.Mock) {
    return render(
      <MapScreen
        session={session}
        apiClient={{
          listTerritories: jest.fn().mockResolvedValue(territories),
          markBlockWorked,
        }}
      />,
    );
  }

  it('shows when the block was last worked before asking to confirm', async () => {
    await render(
      <MapScreen
        session={session}
        apiClient={{
          listTerritories: jest.fn().mockResolvedValue(territories),
          markBlockWorked: jest.fn(),
        }}
        now={now}
      />,
    );
    await screen.findByText('Santa Helena - N 7');

    await act(async () => mapProps.current?.onBlockTap?.(territories[0], workedBlock));

    expect(screen.getByText('Última visita: 06/08/2026 (há 12 dias)')).toBeTruthy();
    expect(screen.getByText('Marcar quadra 7 como trabalhada?')).toBeTruthy();
  });

  it('shows "Nunca trabalhada" for a block with no visit yet', async () => {
    await render(
      <MapScreen
        session={session}
        apiClient={{
          listTerritories: jest.fn().mockResolvedValue(territories),
          markBlockWorked: jest.fn(),
        }}
        now={now}
      />,
    );
    await screen.findByText('Santa Helena - N 7');

    await act(async () => mapProps.current?.onBlockTap?.(territories[0], block));

    expect(screen.getByText('Nunca trabalhada')).toBeTruthy();
  });

  it('records the visit on the server before showing it as done', async () => {
    const markBlockWorked = jest.fn().mockResolvedValue(undefined);
    await renderWithMarker(markBlockWorked);
    await screen.findByText('Santa Helena - N 7');

    // 't1' is assigned to this publisher -- see `territories` above.
    await act(async () => mapProps.current?.onBlockTap?.(territories[0], block));
    await fireEvent.press(await screen.findByText('Confirmar'));

    expect(markBlockWorked).toHaveBeenCalledWith(
      'token-1',
      'b1',
      expect.any(String),
      expect.any(Date),
    );
    expect(screen.queryByText(/não foi registrada/)).toBeNull();
  });

  it('does not mark anything when the server could not be reached', async () => {
    const markBlockWorked = jest.fn().mockRejectedValue(new NetworkException('offline'));
    await renderWithMarker(markBlockWorked);
    await screen.findByText('Santa Helena - N 7');

    await act(async () => mapProps.current?.onBlockTap?.(territories[0], block));
    await fireEvent.press(await screen.findByText('Confirmar'));

    expect(screen.getByText(/sem conexão/i)).toBeTruthy();
    // The block stays exactly as it was: no optimistic green, because
    // nothing was recorded anywhere.
    expect(mapProps.current?.territories[0].blocks[0].lastWorkedAt).toBeUndefined();
  });

  it('shows the reason when the server refuses the visit', async () => {
    const markBlockWorked = jest
      .fn()
      .mockRejectedValue(new ApiErrorException(404, 'block_not_found', 'quadra não encontrada'));
    await renderWithMarker(markBlockWorked);
    await screen.findByText('Santa Helena - N 7');

    await act(async () => mapProps.current?.onBlockTap?.(territories[0], block));
    await fireEvent.press(await screen.findByText('Confirmar'));

    expect(screen.getByText(/quadra não encontrada/)).toBeTruthy();
    expect(mapProps.current?.territories[0].blocks[0].lastWorkedAt).toBeUndefined();
  });

  it('when the territory stopped being theirs meanwhile (403), says so and reloads the map', async () => {
    // The designation or the campaign was concluded between loading the map
    // and tapping the block: the map must stop offering what the server now
    // refuses.
    const listTerritories = jest.fn().mockResolvedValue(territories);
    const listCampaigns = jest.fn().mockResolvedValue([]);
    const markBlockWorked = jest
      .fn()
      .mockRejectedValue(
        new ApiErrorException(403, 'territory_not_assigned', 'território não designado'),
      );
    await render(
      <MapScreen session={session} apiClient={{ listTerritories, listCampaigns, markBlockWorked }} />,
    );
    await screen.findByText('Santa Helena - N 7');

    await act(async () => mapProps.current?.onBlockTap?.(territories[0], block));
    await fireEvent.press(await screen.findByText('Confirmar'));

    expect(screen.getByText(/não está mais designado a você/)).toBeTruthy();
    expect(listTerritories).toHaveBeenCalledTimes(2);
    expect(listCampaigns).toHaveBeenCalledTimes(2);
    expect(mapProps.current?.territories[0].blocks[0].lastWorkedAt).toBeUndefined();
  });

  it('refuses, with a reason, when the territory is not assigned to the publisher', async () => {
    const markBlockWorked = jest.fn();
    await renderWithMarker(markBlockWorked);
    await screen.findByText('Santa Helena - N 7');

    // 't2' has no assigned publisher at all.
    await act(async () => mapProps.current?.onBlockTap?.(territories[1], block));

    expect(screen.getByText(/não está designado a você/)).toBeTruthy();
    expect(screen.queryByText('Confirmar')).toBeNull();
    expect(markBlockWorked).not.toHaveBeenCalled();
  });
});

describe('MapScreen in campaign mode', () => {
  const campaign: Campaign = {
    id: 'campaign-1',
    name: 'Campanha de Celebração',
    startedAt: new Date(2026, 9, 1, 9, 0),
    territoryIds: ['t2', 't3'],
  };

  function renderCampaign(markBlockWorked: jest.Mock = jest.fn().mockResolvedValue(undefined)) {
    return render(
      <MapScreen
        session={session}
        apiClient={{
          listTerritories: jest.fn().mockResolvedValue(territories),
          listCampaigns: jest.fn().mockResolvedValue([campaign]),
          markBlockWorked,
        }}
        initialCampaignId="campaign-1"
      />,
    );
  }

  it('draws every territory of the campaign, with their blocks, and names the campaign', async () => {
    await renderCampaign();

    expect(await screen.findByText('2 territórios · desde 01/10/2026')).toBeTruthy();
    expect(mapProps.current?.territories.map((t) => t.id)).toEqual(['t2', 't3']);
    expect(mapProps.current?.showBlocks).toBe(true);
  });

  it('lets the publisher mark a block of a campaign territory nobody holds individually', async () => {
    const markBlockWorked = jest.fn().mockResolvedValue(undefined);
    await renderCampaign(markBlockWorked);
    await screen.findByText('2 territórios · desde 01/10/2026');

    // 't2' has no assigned publisher: only the campaign opens it.
    await act(async () => mapProps.current?.onBlockTap?.(territories[1], block));
    await fireEvent.press(await screen.findByText('Confirmar'));

    expect(markBlockWorked).toHaveBeenCalledWith('token-1', 'b1', expect.any(String), expect.any(Date));
  });

  it('says the campaign is no longer active when it is not among the publisher\'s campaigns', async () => {
    await render(
      <MapScreen
        session={session}
        apiClient={{
          listTerritories: jest.fn().mockResolvedValue(territories),
          listCampaigns: jest.fn().mockResolvedValue([]),
          markBlockWorked: jest.fn(),
        }}
        initialCampaignId="campaign-1"
      />,
    );

    expect(await screen.findByText(/não está mais ativa para você/)).toBeTruthy();
    expect(mapProps.current?.territories).toEqual([]);
  });
});
