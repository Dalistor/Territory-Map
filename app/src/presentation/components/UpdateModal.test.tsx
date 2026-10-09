import { render, screen, fireEvent } from '@testing-library/react-native';
import { UpdateModal } from './UpdateModal';
import type { AppRelease } from '../../domain/appUpdate';

describe('UpdateModal', () => {
  const mockRelease: AppRelease = {
    app: 'app',
    versionCode: 15,
    versionName: '1.3.0',
    minVersionCode: 10,
    downloadUrl: '/updates/download/app',
    changelog: 'Melhorias de desempenho e novas funções.',
  };

  it('renders modal when visible with release details', async () => {
    await render(
      <UpdateModal
        visible={true}
        release={mockRelease}
        isMandatory={false}
        onUpdate={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.getByText('Nova versão disponível')).toBeTruthy();
    expect(screen.getByText('Versão 1.3.0')).toBeTruthy();
    expect(screen.getByText('Melhorias de desempenho e novas funções.')).toBeTruthy();
    expect(screen.getByText('Atualizar agora')).toBeTruthy();
    expect(screen.getByText('Depois')).toBeTruthy();
  });

  it('hides dismiss button when update is mandatory', async () => {
    await render(
      <UpdateModal
        visible={true}
        release={mockRelease}
        isMandatory={true}
        onUpdate={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.getByText('Atualização obrigatória para continuar.')).toBeTruthy();
    expect(screen.queryByText('Depois')).toBeNull();
  });

  it('calls onUpdate when user presses update button', async () => {
    const onUpdate = jest.fn();
    await render(
      <UpdateModal
        visible={true}
        release={mockRelease}
        isMandatory={false}
        onUpdate={onUpdate}
        onDismiss={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText('Atualizar agora'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('shows progress indicator when downloading', async () => {
    await render(
      <UpdateModal
        visible={true}
        release={mockRelease}
        isMandatory={false}
        downloading={true}
        downloadProgress={45}
        onUpdate={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.getByText('Baixando atualização... 45%')).toBeTruthy();
  });
});
