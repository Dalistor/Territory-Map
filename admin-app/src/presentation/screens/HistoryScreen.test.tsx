/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-community/datetimepicker', () => {
  const mockReact = require('react');
  const { Pressable } = require('react-native');
  return {
    __esModule: true,
    default: function MockDateTimePicker(props: {
      value: Date;
      onChange: (event: { type: string }, date?: Date) => void;
    }) {
      return mockReact.createElement(Pressable, {
        accessibilityRole: 'button',
        accessibilityLabel: 'Escolher data',
        onPress: () => props.onChange({ type: 'set' }, props.value),
      });
    },
  };
});

import type { AssignmentHistoryPage, AssignmentWithTerritory } from '../../domain/models';
import HistoryScreen, { localDayRange } from './HistoryScreen';
import type { HistoryScreenSession } from './HistoryScreen';

const assignment = (overrides: Partial<AssignmentWithTerritory> = {}): AssignmentWithTerritory => ({
  id: 'assignment-1',
  territoryId: 'territory-1',
  territory: { id: 'territory-1', name: 'Centro - N5' },
  publisher: { id: 'publisher-1', name: 'Ana Souza' },
  startedAt: new Date('2026-09-02T12:00:00.000Z'),
  completedAt: new Date('2026-09-12T12:00:00.000Z'),
  ...overrides,
});

const page = (items: AssignmentWithTerritory[], overrides: Partial<AssignmentHistoryPage> = {}): AssignmentHistoryPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 50,
  ...overrides,
});

function makeSession(): HistoryScreenSession {
  return { run: async <T,>(action: () => Promise<T>) => action() };
}

function makeApi(pages: AssignmentHistoryPage[] = [page([])]) {
  let call = 0;
  return {
    listAllAssignments: jest.fn(async () => pages[Math.min(call++, pages.length - 1)]),
  };
}

describe('localDayRange', () => {
  it('makes the chosen closing day exclusive at the following local midnight', () => {
    const result = localDayRange(new Date(2026, 8, 2), new Date(2026, 8, 12));

    expect(result.from).toEqual(new Date(2026, 8, 2, 0, 0, 0, 0));
    expect(result.to).toEqual(new Date(2026, 8, 13, 0, 0, 0, 0));
  });
});

describe('HistoryScreen', () => {
  it('renders returned and ongoing assignments as dense read-only cards', async () => {
    const api = makeApi([
      page([
        assignment(),
        assignment({ id: 'assignment-open', territory: { id: 't-2', name: 'Norte - N6' }, completedAt: null }),
      ]),
    ]);

    await render(<HistoryScreen api={api} session={makeSession()} />);

    expect(await screen.findByText('Centro - N5')).toBeOnTheScreen();
    expect(screen.getAllByText('Ana Souza')).toHaveLength(2);
    expect(screen.getByText(/Devolução: 12\/09\/2026/)).toBeOnTheScreen();
    expect(screen.getAllByText('Em andamento')).toHaveLength(1);
    expect(screen.queryByText('Apagar designação')).not.toBeOnTheScreen();
  });

  it('returns to page one and sends the local half-open period when the dates change', async () => {
    const api = makeApi([page([], { total: 101 }), page([], { page: 2, total: 101 }), page([])]);
    await render(<HistoryScreen api={api} session={makeSession()} initialFrom={new Date(2026, 8, 2)} initialTo={new Date(2026, 8, 12)} />);

    await screen.findByText('Sem resultados neste período');
    await fireEvent.press(screen.getByRole('button', { name: 'Próxima página' }));
    await waitFor(() => expect(api.listAllAssignments).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));

    await fireEvent.press(screen.getByRole('button', { name: 'Limpar período' }));

    await waitFor(() => expect(api.listAllAssignments).toHaveBeenLastCalledWith({ page: 1, pageSize: 50 }));
    expect(api.listAllAssignments).toHaveBeenCalledWith({
      from: new Date(2026, 8, 2, 0, 0, 0, 0),
      to: new Date(2026, 8, 13, 0, 0, 0, 0),
      page: 1,
      pageSize: 50,
    });
  });

  it('keeps the newer filter result when an older request resolves late', async () => {
    let resolveFirst: (result: AssignmentHistoryPage) => void = () => undefined;
    let resolveSecond: (result: AssignmentHistoryPage) => void = () => undefined;
    const api = {
      listAllAssignments: jest
        .fn()
        .mockImplementationOnce(() => new Promise<AssignmentHistoryPage>(resolve => { resolveFirst = resolve; }))
        .mockImplementationOnce(() => new Promise<AssignmentHistoryPage>(resolve => { resolveSecond = resolve; })),
    };
    await render(
      <HistoryScreen api={api} session={makeSession()} initialFrom={new Date(2026, 8, 2)} initialTo={new Date(2026, 8, 12)} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Limpar período' }));
    await waitFor(() => expect(api.listAllAssignments).toHaveBeenCalledTimes(2));
    resolveSecond(page([assignment({ territory: { id: 'new', name: 'Novo - N8' } })]));
    expect(await screen.findByText('Novo - N8')).toBeOnTheScreen();
    resolveFirst(page([assignment({ territory: { id: 'old', name: 'Antigo - N1' } })]));

    await waitFor(() => expect(screen.queryByText('Antigo - N1')).not.toBeOnTheScreen());
  });

  it('distinguishes an empty history, no matching dates, and a recoverable error', async () => {
    const api = makeApi([page([]), page([])]);
    const { rerender } = await render(<HistoryScreen api={api} session={makeSession()} />);
    expect(await screen.findByText('Ainda não há designações registradas.')).toBeOnTheScreen();

    await rerender(<HistoryScreen key="filtered" api={api} session={makeSession()} initialFrom={new Date(2026, 8, 2)} initialTo={new Date(2026, 8, 12)} />);
    expect(await screen.findByText('Nenhuma designação se sobrepõe ao período escolhido.')).toBeOnTheScreen();

    const failed = { listAllAssignments: jest.fn(async () => { throw new Error('Sem conexão'); }) };
    await rerender(<HistoryScreen key="failed" api={failed} session={makeSession()} />);
    expect(await screen.findByText('Sem conexão')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(failed.listAllAssignments).toHaveBeenCalledTimes(2);
  });

  it('moves through server pages without removing the visible period controls', async () => {
    const api = makeApi([
      page([assignment()], { total: 51, page: 1 }),
      page([assignment({ id: 'assignment-2', territory: { id: 't-2', name: 'Sul - N9' } })], { total: 51, page: 2 }),
    ]);
    await render(<HistoryScreen api={api} session={makeSession()} />);
    await screen.findByText('Centro - N5');

    await fireEvent.press(screen.getByRole('button', { name: 'Próxima página' }));
    expect(await screen.findByText('Sul - N9')).toBeOnTheScreen();
    expect(screen.getByText('Período')).toBeOnTheScreen();
  });

  it('uses visible De/Até labels with descriptive date-picker labels', async () => {
    await render(<HistoryScreen api={makeApi()} session={makeSession()} />);

    expect(await screen.findByText('De')).toBeOnTheScreen();
    expect(screen.getByText('Até')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Data inicial' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Data final' })).toBeOnTheScreen();
  });
});
