import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Campaign } from '../../domain/models';
import CampaignsScreen, { CAMPAIGNS_DESKTOP_ONLY_MESSAGE } from './CampaignsScreen';
import CampaignDetailScreen from './CampaignDetailScreen';

const ACTIVE: Campaign = {
  id: 'campaign-1',
  name: 'Celebração',
  createdAt: new Date('2026-10-01T12:00:00Z'),
  territories: [
    { id: 'territory-12', name: 'Jardim - N12' },
    { id: 'territory-5', name: 'Centro - N5' },
  ],
  currentDesignation: {
    id: 'period-2',
    startedAt: new Date(2026, 9, 10, 12),
    completedAt: null,
    publishers: [
      { id: 'publisher-ana', name: 'Ana' },
      { id: 'publisher-bruno', name: 'Bruno' },
    ],
  },
  designations: [
    {
      id: 'period-2',
      startedAt: new Date(2026, 9, 10, 12),
      completedAt: null,
      publishers: [
        { id: 'publisher-ana', name: 'Ana' },
        { id: 'publisher-bruno', name: 'Bruno' },
      ],
    },
    {
      id: 'period-1',
      startedAt: new Date(2026, 8, 1, 12),
      completedAt: new Date(2026, 8, 20, 12),
      publishers: [{ id: 'publisher-carla', name: 'Carla' }],
    },
  ],
};

const IDLE: Campaign = {
  ...ACTIVE,
  id: 'campaign-2',
  name: 'Congresso',
  territories: [{ id: 'territory-5', name: 'Centro - N5' }],
  currentDesignation: null,
  designations: [],
};

function makeSession() {
  return { run: async <T,>(action: () => Promise<T>): Promise<T> => action() };
}

/** Every verb the desktop owns -- none of them may appear as a button here. */
const MANAGEMENT_LABELS = /criar|nova campanha|editar|designar|concluir|apagar/i;

describe('CampaignsScreen', () => {
  it('lists campaigns read only, with their state and territory count, and opens the one tapped', async () => {
    const onOpenCampaign = jest.fn();
    const api = { listCampaigns: jest.fn(async () => [ACTIVE, IDLE]) };

    await render(<CampaignsScreen api={api} session={makeSession()} onOpenCampaign={onOpenCampaign} />);

    expect(await screen.findByText('Celebração')).toBeOnTheScreen();
    expect(screen.getByText('Ativa desde 10/10/2026')).toBeOnTheScreen();
    expect(screen.getByText('2 territórios')).toBeOnTheScreen();
    expect(screen.getByText('Ainda não designada')).toBeOnTheScreen();
    expect(screen.getByText(CAMPAIGNS_DESKTOP_ONLY_MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: MANAGEMENT_LABELS })).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Abrir campanha Congresso'));
    expect(onOpenCampaign).toHaveBeenCalledWith(IDLE);
  });

  it('shows the load failure with a retry instead of an empty list', async () => {
    const api = {
      listCampaigns: jest
        .fn()
        .mockRejectedValueOnce(new Error('Sem conexão.'))
        .mockResolvedValueOnce([ACTIVE]),
    };

    await render(<CampaignsScreen api={api} session={makeSession()} onOpenCampaign={jest.fn()} />);

    expect(await screen.findByText('Sem conexão.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Tentar novamente'));
    expect(await screen.findByText('Celebração')).toBeOnTheScreen();
  });
});

describe('CampaignDetailScreen', () => {
  it('shows territories by number, the designated publishers and every period, with no management action', async () => {
    const api = { getCampaign: jest.fn(async () => ACTIVE) };

    await render(<CampaignDetailScreen api={api} campaignId="campaign-1" session={makeSession()} />);

    expect(await screen.findByRole('header', { name: 'Celebração' })).toBeOnTheScreen();
    expect(api.getCampaign).toHaveBeenCalledWith('campaign-1');
    expect(screen.getAllByText('Ana, Bruno')).toHaveLength(2);
    expect(screen.getByText('Territórios (2)')).toBeOnTheScreen();
    const names = screen.getAllByText(/ - N\d+$/).map(node => node.props.children);
    expect(names).toEqual(['Centro - N5', 'Jardim - N12']);
    expect(screen.getByText('10/10/2026 a em andamento')).toBeOnTheScreen();
    expect(screen.getByText('01/09/2026 a 20/09/2026')).toBeOnTheScreen();
    expect(screen.getByText('Carla')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: MANAGEMENT_LABELS })).not.toBeOnTheScreen();
  });

  it('says a campaign that is not out has nobody designated', async () => {
    const api = { getCampaign: jest.fn(async () => IDLE) };

    await render(<CampaignDetailScreen api={api} campaignId="campaign-2" session={makeSession()} />);

    expect(await screen.findByText('A campanha não está designada agora.')).toBeOnTheScreen();
    expect(screen.getByText('Nenhum período ainda.')).toBeOnTheScreen();
  });
});
