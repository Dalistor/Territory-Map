import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import type { AssignmentHistoryPage } from '../../domain/models';
import PublisherHistoryScreen from './PublisherHistoryScreen';

const result: AssignmentHistoryPage = {
  items: [
    {
      id: 'assignment-1',
      territoryId: 'territory-1',
      territory: { id: 'territory-1', name: 'Centro - N5' },
      publisher: { id: 'publisher-1', name: 'Carlos antigo' },
      startedAt: new Date(2026, 8, 10),
      completedAt: null,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 50,
};

describe('PublisherHistoryScreen', () => {
  it('requests only the selected publisher and presents a compact territory timeline', async () => {
    const listAllAssignments = jest.fn(async () => result);
    const session = { run: <T,>(action: () => Promise<T>) => action() };

    await render(
      <PublisherHistoryScreen
        api={{ listAllAssignments }}
        publisher={{ id: 'publisher-1', name: 'Carlos Eduardo' }}
        session={session}
      />,
    );

    expect(await screen.findByText('Centro - N5')).toBeOnTheScreen();
    expect(listAllAssignments).toHaveBeenCalledWith({ publisherId: 'publisher-1', page: 1 });
    expect(screen.getByText('1 território retirado')).toBeOnTheScreen();
    expect(screen.getByText('RETIRADA')).toBeOnTheScreen();
    expect(screen.getByText('DEVOLUÇÃO')).toBeOnTheScreen();
    expect(screen.getByText('Em andamento')).toBeOnTheScreen();
    expect(screen.queryByText('Carlos antigo')).not.toBeOnTheScreen();
  });

  it('explains when the selected publisher has no territory history', async () => {
    const listAllAssignments = jest.fn(async () => ({ ...result, items: [], total: 0 }));
    const session = { run: <T,>(action: () => Promise<T>) => action() };

    await render(
      <PublisherHistoryScreen
        api={{ listAllAssignments }}
        publisher={{ id: 'publisher-2', name: 'Sem histórico' }}
        session={session}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Sem histórico de territórios')).toBeOnTheScreen();
    });
    expect(screen.getByText('Sem histórico ainda não retirou nenhum território.')).toBeOnTheScreen();
  });
});
