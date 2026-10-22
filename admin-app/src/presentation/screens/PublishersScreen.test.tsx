import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type {
  AssignmentHistoryPage,
  AssignmentWithTerritory,
  Publisher,
} from '../../domain/models';
import PublishersScreen from './PublishersScreen';
import PublisherHistoryScreen from './PublisherHistoryScreen';

const ANA: Publisher = {
  id: 'publisher-ana',
  name: 'Ana Martins',
  accessCode: null,
  accessCodeExpiresAt: null,
  activatedAt: new Date('2026-01-03T00:00:00Z'),
  isActive: true,
};

const BIA: Publisher = {
  ...ANA,
  id: 'publisher-bia',
  name: 'Beatriz Souza',
  activatedAt: null,
  isActive: false,
};

const ASSIGNMENT: AssignmentWithTerritory = {
  id: 'assignment-1',
  territoryId: 'territory-1',
  territory: { id: 'territory-1', name: 'Centro - N5' },
  publisher: { id: ANA.id, name: 'Ana como estava no histórico' },
  startedAt: new Date('2026-08-01T12:00:00Z'),
  completedAt: null,
};

function page(
  items: AssignmentWithTerritory[],
  pageNumber = 1,
  total = items.length,
  pageSize = 50,
): AssignmentHistoryPage {
  return { items, page: pageNumber, pageSize, total };
}

function makeSession() {
  return { run: async <T,>(action: () => Promise<T>): Promise<T> => action() };
}

describe('PublishersScreen', () => {
  it('filters publishers locally and distinguishes no result from a publisher with no history', async () => {
    const onOpenPublisher = jest.fn();
    const api = { listPublishers: jest.fn(async () => [ANA, BIA]) };

    await render(<PublishersScreen api={api} session={makeSession()} onOpenPublisher={onOpenPublisher} />);

    expect(await screen.findByText('Ana Martins')).toBeOnTheScreen();
    expect(screen.getByText('Ativo')).toBeOnTheScreen();
    expect(screen.getByText('Inativo')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Buscar publicadores'), 'ninguém');
    expect(screen.getByText('Nenhum publicador corresponde à busca.')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Buscar publicadores'), 'ana');
    await fireEvent.press(screen.getByRole('button', { name: /Ana Martins/i }));

    expect(onOpenPublisher).toHaveBeenCalledWith(ANA);
  });

  it('offers retry when the publisher list fails', async () => {
    const api = {
      listPublishers: jest
        .fn<Promise<Publisher[]>, []>()
        .mockRejectedValueOnce(new Error('Sem conexão'))
        .mockResolvedValueOnce([ANA]),
    };

    await render(<PublishersScreen api={api} session={makeSession()} onOpenPublisher={jest.fn()} />);

    expect(await screen.findByText('Sem conexão')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Ana Martins')).toBeOnTheScreen();
    expect(api.listPublishers).toHaveBeenCalledTimes(2);
  });
});

describe('PublisherHistoryScreen', () => {
  it('shows a clear no-history state for the selected publisher', async () => {
    const api = { listAllAssignments: jest.fn(async () => page([])) };

    await render(<PublisherHistoryScreen api={api} session={makeSession()} publisher={ANA} />);

    expect(await screen.findByText('Ana Martins ainda não retirou nenhum território.')).toBeOnTheScreen();
    expect(api.listAllAssignments).toHaveBeenCalledWith({ page: 1, publisherId: ANA.id });
  });

  it('labels an open assignment as a dated movement and loads the next page', async () => {
    const secondPage = {
      ...ASSIGNMENT,
      id: 'assignment-2',
      territory: { id: 'territory-2', name: 'Jardim - N6' },
      completedAt: new Date('2026-08-10T12:00:00Z'),
    };
    const api = {
      listAllAssignments: jest
        .fn<Promise<AssignmentHistoryPage>, [unknown]>()
        .mockResolvedValueOnce(page([ASSIGNMENT], 1, 2, 1))
        .mockResolvedValueOnce(page([secondPage], 2, 2, 1)),
    };

    await render(<PublisherHistoryScreen api={api} session={makeSession()} publisher={ANA} />);

    expect(await screen.findByText('Centro - N5')).toBeOnTheScreen();
    expect(screen.queryByText('Ana como estava no histórico')).not.toBeOnTheScreen();
    // The status pill and the missing return date both say it.
    expect(screen.getAllByText('Em andamento')).toHaveLength(2);
    expect(screen.getByText('Retirada')).toBeOnTheScreen();
    expect(screen.getByText('01/08/2026')).toBeOnTheScreen();
    expect(screen.getByText('Devolução')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Próxima página' }));

    expect(await screen.findByText('Jardim - N6')).toBeOnTheScreen();
    expect(api.listAllAssignments).toHaveBeenLastCalledWith({ page: 2, publisherId: ANA.id });
  });

  it('keeps the selected publisher visible and retries the same page after an error', async () => {
    const api = {
      listAllAssignments: jest
        .fn<Promise<AssignmentHistoryPage>, [unknown]>()
        .mockRejectedValueOnce(new Error('Servidor indisponível'))
        .mockResolvedValueOnce(page([ASSIGNMENT])),
    };

    await render(<PublisherHistoryScreen api={api} session={makeSession()} publisher={ANA} />);

    expect(await screen.findByText('Servidor indisponível')).toBeOnTheScreen();
    expect(screen.getByText('Ana Martins')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(screen.getByText('Centro - N5')).toBeOnTheScreen());
    expect(api.listAllAssignments).toHaveBeenCalledTimes(2);
  });
});
