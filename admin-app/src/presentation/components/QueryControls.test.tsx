import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  QueryListItem,
  QueryPagination,
  QuerySearchField,
  QuerySegmentedControl,
  QueryState,
} from './QueryControls';

describe('QuerySearchField', () => {
  it('passes typing through and clears the query from its visible action', async () => {
    const onChangeText = jest.fn();
    await render(
      <QuerySearchField
        accessibilityLabel="Buscar território"
        onChangeText={onChangeText}
        placeholder="Buscar"
        value="Centro"
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Buscar território'), 'Norte');
    await fireEvent.press(screen.getByRole('button', { name: 'Limpar busca' }));

    expect(onChangeText).toHaveBeenNthCalledWith(1, 'Norte');
    expect(onChangeText).toHaveBeenLastCalledWith('');
  });
});

describe('QuerySegmentedControl', () => {
  it('announces the selected segment and changes it on press', async () => {
    const onChange = jest.fn();
    await render(
      <QuerySegmentedControl
        accessibilityLabel="Modo de visualização"
        onChange={onChange}
        segments={[
          { value: 'list', label: 'Lista' },
          { value: 'map', label: 'Mapa' },
        ]}
        value="list"
      />,
    );

    expect(screen.getByRole('tab', { name: 'Lista' }).props.accessibilityState).toEqual({
      selected: true,
    });
    await fireEvent.press(screen.getByRole('tab', { name: 'Mapa' }));

    expect(onChange).toHaveBeenCalledWith('map');
  });
});

describe('QueryListItem', () => {
  it('opens its record through an accessible press target', async () => {
    const onPress = jest.fn();
    await render(
      <QueryListItem
        details={['Retirada: 02/09/2026', '2 quadras']}
        description="Ana Souza"
        onPress={onPress}
        status="Em andamento"
        title="Centro - N5"
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Centro - N5' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Em andamento')).toBeOnTheScreen();
    expect(screen.getByText('Retirada: 02/09/2026 · 2 quadras').props.numberOfLines).toBeUndefined();
  });
});

describe('QueryState', () => {
  it('keeps clear error text and retries without relying on color', async () => {
    const onRetry = jest.fn();
    await render(
      <QueryState
        kind="error"
        message="Verifique a conexão e tente novamente."
        onRetry={onRetry}
        title="Não foi possível carregar"
      />,
    );

    expect(screen.getByLabelText('Não foi possível carregar. Verifique a conexão e tente novamente.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('QueryPagination', () => {
  it('moves one page in either direction and disables unavailable directions', async () => {
    const onPageChange = jest.fn();
    const { rerender } = await render(
      <QueryPagination onPageChange={onPageChange} page={2} pageSize={10} total={27} />,
    );

    expect(screen.getByText('11–20 de 27')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Página anterior' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);

    await rerender(<QueryPagination onPageChange={onPageChange} page={1} pageSize={10} total={27} />);
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
  });
});
