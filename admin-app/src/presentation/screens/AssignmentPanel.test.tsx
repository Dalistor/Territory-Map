import React from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import type { Assignment, Publisher, Territory } from '../../domain/models';
import { AssignmentPanel } from './AssignmentPanel';
import type { AssignmentPanelSession } from './AssignmentPanel';

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'terr-1',
    name: 'Centro',
    boundary: [],
    assignedPublisher: null,
    rotationDays: null,
    blocks: [],
    ...overrides,
  };
}

function makePublisher(overrides: Partial<Publisher> = {}): Publisher {
  return {
    id: 'pub-1',
    name: 'Ana',
    accessCode: null,
    accessCodeExpiresAt: null,
    activatedAt: null,
    isActive: true,
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'asg-1',
    territoryId: 'terr-1',
    publisher: { id: 'pub-1', name: 'Ana' },
    startedAt: new Date('2026-01-10T12:00:00Z'),
    completedAt: null,
    ...overrides,
  };
}

interface FakeApi {
  listAssignments: jest.Mock;
  listPublishers: jest.Mock;
  designate: jest.Mock;
  completeAssignment: jest.Mock;
  deleteAssignment: jest.Mock;
  updateAssignment: jest.Mock;
}

function makeApi(overrides: Partial<FakeApi> = {}): FakeApi {
  return {
    listAssignments: jest.fn(async () => [] as Assignment[]),
    listPublishers: jest.fn(async () => [] as Publisher[]),
    designate: jest.fn(async () => undefined),
    completeAssignment: jest.fn(async () => undefined),
    deleteAssignment: jest.fn(async () => undefined),
    updateAssignment: jest.fn(async () => undefined),
    ...overrides,
  };
}

/** Stands in for the real session: runs the action, never touches HTTP. */
function makeSession(): AssignmentPanelSession {
  return {
    run<T>(action: () => Promise<T>): Promise<T> {
      return action();
    },
  };
}

interface AlertButtonLike {
  readonly text?: string;
  readonly style?: string;
  readonly onPress?: () => void;
}

/**
 * `Alert` is a native module: under Jest it never draws anything, so the
 * confirmation is inspected as the call it is -- title, message, buttons --
 * and "the admin tapped yes" is that button's `onPress` being invoked.
 */
function lastAlert(): { message: string; buttons: AlertButtonLike[] } {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const call = calls[calls.length - 1];
  return {
    message: String(call[1]),
    buttons: (call[2] ?? []) as AlertButtonLike[],
  };
}

/** The button that is not the "Cancelar" one -- pressing it means "yes". */
async function confirmLastAlert(): Promise<void> {
  const confirm = lastAlert().buttons.find(button => button.style !== 'cancel');
  expect(confirm).toBeDefined();
  await act(async () => {
    confirm?.onPress?.();
  });
}

describe('AssignmentPanel', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('mostra "Sem designação" e oferece designar, sem oferecer concluir, num território sem histórico', async () => {
    const api = makeApi();

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('Sem designação')).toBeTruthy(),
    );
    expect(screen.getByText('Designar a…')).toBeTruthy();
    expect(screen.queryByText('Marcar como concluído')).toBeNull();
  });

  it('mostra o dirigente e a data de início da designação em vigor, e oferece concluir', async () => {
    const startedAt = new Date('2026-02-03T09:00:00Z');
    const api = makeApi({
      listAssignments: jest.fn(async () => [
        makeAssignment({
          publisher: { id: 'pub-9', name: 'Bruno' },
          startedAt,
        }),
      ]),
    });

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(`Bruno — desde ${startedAt.toLocaleDateString()}`),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('Sem designação')).toBeNull();
    expect(screen.getByText('Marcar como concluído')).toBeTruthy();
  });

  it('lista as designações concluídas com as duas datas, mais recente primeiro', async () => {
    const older = makeAssignment({
      id: 'asg-old',
      publisher: { id: 'pub-1', name: 'Ana' },
      startedAt: new Date('2025-01-05T10:00:00Z'),
      completedAt: new Date('2025-04-05T10:00:00Z'),
    });
    const newer = makeAssignment({
      id: 'asg-new',
      publisher: { id: 'pub-2', name: 'Carla' },
      startedAt: new Date('2025-06-01T10:00:00Z'),
      completedAt: new Date('2025-09-01T10:00:00Z'),
    });
    const open = makeAssignment({
      id: 'asg-open',
      publisher: { id: 'pub-3', name: 'Davi' },
      startedAt: new Date('2026-01-01T10:00:00Z'),
      completedAt: null,
    });
    // Deliberately out of order: the panel, not the server, decides the order.
    const api = makeApi({
      listAssignments: jest.fn(async () => [older, open, newer]),
    });

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByTestId('assignment-history-row')).toHaveLength(2),
    );
    const rows = screen.getAllByTestId('assignment-history-row');
    expect(
      within(rows[0]).getByText(
        `Carla — ${newer.startedAt.toLocaleDateString()} a ${newer.completedAt!.toLocaleDateString()}`,
      ),
    ).toBeTruthy();
    expect(
      within(rows[1]).getByText(
        `Ana — ${older.startedAt.toLocaleDateString()} a ${older.completedAt!.toLocaleDateString()}`,
      ),
    ).toBeTruthy();
  });

  it('designa o publicador escolhido num território livre, recarrega o cartão e avisa o chamador', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [
        makePublisher({ id: 'pub-1', name: 'Ana' }),
        makePublisher({ id: 'pub-9', name: 'Bruno' }),
      ]),
    });
    const onChanged = jest.fn();

    await render(
      <AssignmentPanel
        territory={makeTerritory({ id: 'terr-7' })}
        session={makeSession()}
        api={api}
        onChanged={onChanged}
      />,
    );

    await waitFor(() => expect(screen.getByText('Bruno')).toBeTruthy());
    await fireEvent.press(screen.getByText('Bruno'));
    await fireEvent.press(screen.getByText('Designar'));

    await waitFor(() =>
      expect(api.designate).toHaveBeenCalledWith('terr-7', 'pub-9'),
    );
    expect(api.designate).toHaveBeenCalledTimes(1);
    // Reloaded: once on mount, once after the write.
    expect(api.listAssignments).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('avisa que a designação atual será encerrada com a data de hoje, e cancelar não chama a API', async () => {
    const api = makeApi({
      listAssignments: jest.fn(async () => [
        makeAssignment({ publisher: { id: 'pub-1', name: 'Ana' } }),
      ]),
      listPublishers: jest.fn(async () => [
        makePublisher({ id: 'pub-1', name: 'Ana' }),
        makePublisher({ id: 'pub-9', name: 'Bruno' }),
      ]),
    });

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() => expect(screen.getByText('Bruno')).toBeTruthy());
    await fireEvent.press(screen.getByText('Bruno'));
    await fireEvent.press(screen.getByText('Designar'));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const { message } = lastAlert();
    expect(message).toContain('Ana');
    expect(message).toContain('encerrada com a data de hoje');
    // The admin never said yes: nothing was written.
    expect(api.designate).not.toHaveBeenCalled();
  });

  it('confirmar a troca de dirigente designa o publicador escolhido e recarrega o cartão', async () => {
    const api = makeApi({
      listAssignments: jest.fn(async () => [
        makeAssignment({ publisher: { id: 'pub-1', name: 'Ana' } }),
      ]),
      listPublishers: jest.fn(async () => [
        makePublisher({ id: 'pub-1', name: 'Ana' }),
        makePublisher({ id: 'pub-9', name: 'Bruno' }),
      ]),
    });
    const onChanged = jest.fn();

    await render(
      <AssignmentPanel
        territory={makeTerritory({ id: 'terr-3' })}
        session={makeSession()}
        api={api}
        onChanged={onChanged}
      />,
    );

    await waitFor(() => expect(screen.getByText('Bruno')).toBeTruthy());
    await fireEvent.press(screen.getByText('Bruno'));
    await fireEvent.press(screen.getByText('Designar'));
    await confirmLastAlert();

    await waitFor(() =>
      expect(api.designate).toHaveBeenCalledWith('terr-3', 'pub-9'),
    );
    expect(api.listAssignments).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('concluir avisa que o publicador perde na hora o acesso, e confirmar chama a API', async () => {
    const api = makeApi({
      listAssignments: jest.fn(async () => [
        makeAssignment({ publisher: { id: 'pub-1', name: 'Ana' } }),
      ]),
    });
    const onChanged = jest.fn();

    await render(
      <AssignmentPanel
        territory={makeTerritory({ id: 'terr-5' })}
        session={makeSession()}
        api={api}
        onChanged={onChanged}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('Marcar como concluído')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Marcar como concluído'));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(lastAlert().message).toContain(
      'perde na hora o acesso para marcar quadras',
    );
    expect(api.completeAssignment).not.toHaveBeenCalled();

    await confirmLastAlert();

    await waitFor(() =>
      expect(api.completeAssignment).toHaveBeenCalledWith('terr-5'),
    );
    expect(api.completeAssignment).toHaveBeenCalledTimes(1);
    expect(api.listAssignments).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('apagar um registro avisa que não há como desfazer e apaga a linha tocada, não outra', async () => {
    const api = makeApi({
      listAssignments: jest.fn(async () => [
        makeAssignment({
          id: 'asg-old',
          publisher: { id: 'pub-1', name: 'Ana' },
          startedAt: new Date('2025-01-05T10:00:00Z'),
          completedAt: new Date('2025-04-05T10:00:00Z'),
        }),
        makeAssignment({
          id: 'asg-new',
          publisher: { id: 'pub-2', name: 'Carla' },
          startedAt: new Date('2025-06-01T10:00:00Z'),
          completedAt: new Date('2025-09-01T10:00:00Z'),
        }),
      ]),
    });
    const onChanged = jest.fn();

    await render(
      <AssignmentPanel
        territory={makeTerritory({ id: 'terr-2' })}
        session={makeSession()}
        api={api}
        onChanged={onChanged}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Apagar designação de Ana')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByLabelText('Apagar designação de Ana'));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const { message } = lastAlert();
    expect(message).toContain('Ana');
    expect(message).toContain('Não há como desfazer');
    expect(api.deleteAssignment).not.toHaveBeenCalled();

    await confirmLastAlert();

    await waitFor(() =>
      expect(api.deleteAssignment).toHaveBeenCalledWith('terr-2', 'asg-old'),
    );
    expect(api.deleteAssignment).toHaveBeenCalledTimes(1);
    expect(api.listAssignments).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('mostra o erro de designar numa região acessível, sem fechar o painel', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [
        makePublisher({ id: 'pub-9', name: 'Bruno' }),
      ]),
      designate: jest.fn(async () => {
        throw new Error('Publicador não encontrado nesta congregação.');
      }),
    });
    const onChanged = jest.fn();

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
        onChanged={onChanged}
      />,
    );

    await waitFor(() => expect(screen.getByText('Bruno')).toBeTruthy());
    await fireEvent.press(screen.getByText('Bruno'));
    await fireEvent.press(screen.getByText('Designar'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Publicador não encontrado nesta congregação.',
      ),
    );
    // Still the same panel, still usable: the admin can pick again.
    expect(screen.getByText('Designações de Centro')).toBeTruthy();
    expect(screen.getByText('Designar')).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('mostra o erro de concluir numa região acessível, sem fechar o painel', async () => {
    const api = makeApi({
      listAssignments: jest.fn(async () => [
        makeAssignment({ publisher: { id: 'pub-1', name: 'Ana' } }),
      ]),
      completeAssignment: jest.fn(async () => {
        throw new Error('Nenhuma designação aberta.');
      }),
    });

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('Marcar como concluído')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Marcar como concluído'));
    await confirmLastAlert();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Nenhuma designação aberta.',
      ),
    );
    expect(screen.getByText('Designações de Centro')).toBeTruthy();
  });

  it('mostra o erro de apagar numa região acessível, sem fechar o painel', async () => {
    const api = makeApi({
      listAssignments: jest.fn(async () => [
        makeAssignment({
          id: 'asg-old',
          publisher: { id: 'pub-1', name: 'Ana' },
          startedAt: new Date('2025-01-05T10:00:00Z'),
          completedAt: new Date('2025-04-05T10:00:00Z'),
        }),
      ]),
      deleteAssignment: jest.fn(async () => {
        throw new Error('Registro não encontrado.');
      }),
    });

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Apagar designação de Ana')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByLabelText('Apagar designação de Ana'));
    await confirmLastAlert();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Registro não encontrado.',
      ),
    );
    expect(screen.getByText('Designações de Centro')).toBeTruthy();
    // The row is still there -- nothing was deleted.
    expect(screen.getByLabelText('Apagar designação de Ana')).toBeTruthy();
  });

  it('mostra o erro de carregar o cartão em vez de um cartão vazio', async () => {
    const api = makeApi({
      listAssignments: jest.fn(async () => {
        throw new Error('Sem conexão com o servidor.');
      }),
    });

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Sem conexão com o servidor.',
      ),
    );
    // A failed load must not read as "this territory has nobody assigned".
    expect(screen.queryByText('Sem designação')).toBeNull();
  });

  it('só designa depois de escolher um publicador', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [
        makePublisher({ id: 'pub-9', name: 'Bruno' }),
      ]),
    });

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() => expect(screen.getByText('Bruno')).toBeTruthy());
    await fireEvent.press(screen.getByText('Designar'));

    expect(api.designate).not.toHaveBeenCalled();
    expect(screen.getByText('Designar')).toBeDisabled();
  });

  it('filtra publicadores sem diferenciar maiúsculas e mantém a seleção até confirmar', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [
        makePublisher({ id: 'pub-1', name: 'Ana' }),
        makePublisher({ id: 'pub-9', name: 'Bruno' }),
      ]),
    });

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('designate-pub-9')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('publisher-search'), 'BRU');
    });

    expect(screen.queryByTestId('designate-pub-1')).toBeNull();
    expect(screen.getByTestId('designate-pub-9')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('designate-pub-9'));

    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId('publisher-search'),
        'inexistente',
      );
    });

    expect(screen.getByText('Nenhum publicador encontrado.')).toBeTruthy();
    expect(screen.getByText('Bruno')).toBeTruthy();
    expect(
      screen.getByTestId('designate-pub-9').props.accessibilityState.selected,
    ).toBe(true);

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('publisher-search'), 'bru');
    });
    await fireEvent.press(screen.getByText('Designar'));

    await waitFor(() =>
      expect(api.designate).toHaveBeenCalledWith('terr-1', 'pub-9'),
    );
  });

  it('desabilita Designar e ignora o segundo toque enquanto a escrita está pendente', async () => {
    let resolveDesignate: () => void = () => {};
    const designate = jest.fn(
      () =>
        new Promise<void>(resolve => {
          resolveDesignate = resolve;
        }),
    );
    const api = makeApi({
      listPublishers: jest.fn(async () => [
        makePublisher({ id: 'pub-9', name: 'Bruno' }),
      ]),
      designate,
    });

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );
    await waitFor(() => expect(screen.getByText('Bruno')).toBeTruthy());
    await fireEvent.press(screen.getByText('Bruno'));
    await fireEvent.press(screen.getByText('Designar'));

    const designateButton = screen.getByText('Atualizando…');
    expect(designateButton).toBeDisabled();
    await fireEvent.press(designateButton);
    expect(designate).toHaveBeenCalledTimes(1);

    resolveDesignate();
    await waitFor(() => expect(screen.getByText('Designar')).toBeEnabled());
  });

  it('não oferece publicador desativado como opção de designação', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [
        makePublisher({ id: 'pub-9', name: 'Bruno' }),
        makePublisher({ id: 'pub-4', name: 'Elias', isActive: false }),
      ]),
    });

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() => expect(screen.getByText('Bruno')).toBeTruthy());
    expect(screen.queryByText('Elias')).toBeNull();
  });

  it('mostra um texto genérico quando a falha não traz mensagem nenhuma', async () => {
    const api = makeApi({
      listPublishers: jest.fn(async () => [
        makePublisher({ id: 'pub-9', name: 'Bruno' }),
      ]),
      // Not an Error, and nothing readable in it -- the panel still has to say
      // something instead of printing "[object Object]".
      designate: jest.fn(async () => {
        throw { unexpected: true };
      }),
    });

    await render(
      <AssignmentPanel
        territory={makeTerritory()}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() => expect(screen.getByText('Bruno')).toBeTruthy());
    await fireEvent.press(screen.getByText('Bruno'));
    await fireEvent.press(screen.getByText('Designar'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Não foi possível completar a operação.',
      ),
    );
  });

  it('permite abrir modal e editar a designação atual com novo publicador', async () => {
    const current = makeAssignment({
      id: 'asg-open',
      publisher: { id: 'pub-1', name: 'Ana' },
      startedAt: new Date('2026-01-10T12:00:00Z'),
      completedAt: null,
    });
    const api = makeApi({
      listAssignments: jest.fn(async () => [current]),
      listPublishers: jest.fn(async () => [
        makePublisher({ id: 'pub-1', name: 'Ana' }),
        makePublisher({ id: 'pub-9', name: 'Bruno' }),
      ]),
    });
    const onChanged = jest.fn();

    await render(
      <AssignmentPanel
        territory={makeTerritory({ id: 'terr-1' })}
        session={makeSession()}
        api={api}
        onChanged={onChanged}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Editar designação de Ana')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByLabelText('Editar designação de Ana'));

    expect(screen.getByText('Editar designação atual')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('edit-publisher-pub-9'));
    await fireEvent.press(screen.getByLabelText('Salvar alterações'));

    await waitFor(() =>
      expect(api.updateAssignment).toHaveBeenCalledWith(
        'terr-1',
        'asg-open',
        expect.objectContaining({
          publisherId: 'pub-9',
          startedAt: expect.any(Date),
        }),
      ),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('permite abrir modal de edição para designação passada e cancelar sem chamar a API', async () => {
    const past = makeAssignment({
      id: 'asg-past',
      publisher: { id: 'pub-1', name: 'Ana' },
      startedAt: new Date('2025-01-10T12:00:00Z'),
      completedAt: new Date('2025-03-10T12:00:00Z'),
    });
    const api = makeApi({
      listAssignments: jest.fn(async () => [past]),
      listPublishers: jest.fn(async () => [
        makePublisher({ id: 'pub-1', name: 'Ana' }),
      ]),
    });

    await render(
      <AssignmentPanel
        territory={makeTerritory({ id: 'terr-1' })}
        session={makeSession()}
        api={api}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Editar designação de Ana')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByLabelText('Editar designação de Ana'));
    expect(screen.getByText('Editar designação passada')).toBeTruthy();

    await fireEvent.press(screen.getByText('Cancelar'));

    expect(screen.queryByText('Editar designação passada')).toBeNull();
    expect(api.updateAssignment).not.toHaveBeenCalled();
  });
});
