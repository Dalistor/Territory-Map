import { render, screen, fireEvent } from '@testing-library/react-native';
import { UpdateModal } from './UpdateModal';
import type { AppRelease } from '../../domain/appUpdate';

describe('UpdateModal in admin-app', () => {
  const mockRelease: AppRelease = {
    app: 'admin-app',
    versionCode: 8,
    versionName: '1.2.0',
    minVersionCode: 5,
    downloadUrl: '/updates/download/admin-app',
    changelog: 'Recursos administrativos avançados.',
  };

  it('renders modal with update info', async () => {
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
    expect(screen.getByText('Versão 1.2.0')).toBeTruthy();
    expect(screen.getByText('Recursos administrativos avançados.')).toBeTruthy();
    expect(screen.getByText('Atualizar agora')).toBeTruthy();
    expect(screen.getByText('Depois')).toBeTruthy();
  });

  it('hides dismiss button when mandatory', async () => {
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

  it('triggers onUpdate on button press', async () => {
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

  it('renders progress bar while downloading', async () => {
    await render(
      <UpdateModal
        visible={true}
        release={mockRelease}
        isMandatory={false}
        downloading={true}
        downloadProgress={70}
        onUpdate={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.getByText('Baixando atualização... 70%')).toBeTruthy();
  });
});
