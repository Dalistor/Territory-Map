jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    API_BASE_URL: 'https://admin-api.territorymap.test',
    APP_KEY: 'admin-secret-key-456',
  },
}));

import { fetchLatestRelease } from './update-client';
import { ApiErrorException, NetworkException } from './api-client';

describe('update-client in admin-app', () => {
  const fakeBaseUrl = 'https://admin-api.territorymap.test';
  const fakeAppKey = 'admin-secret-key-456';

  it('fetches latest release for admin-app successfully', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          app: 'admin-app',
          version_code: 6,
          version_name: '1.1.0',
          min_version_code: 3,
          download_url: '/updates/download/admin-app',
          changelog: 'Melhorias de desempenho para admin.',
        }),
    });

    const release = await fetchLatestRelease('admin-app', {
      fetchImpl: fakeFetch,
      baseUrl: fakeBaseUrl,
      appKey: fakeAppKey,
    });

    expect(fakeFetch).toHaveBeenCalledWith(
      `${fakeBaseUrl}/updates/latest?app=admin-app`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-App-Key': fakeAppKey,
        }),
      })
    );

    expect(release).toEqual({
      app: 'admin-app',
      versionCode: 6,
      versionName: '1.1.0',
      minVersionCode: 3,
      downloadUrl: '/updates/download/admin-app',
      changelog: 'Melhorias de desempenho para admin.',
      publishedAt: undefined,
    });
  });

  it('returns null when server answers 404', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      status: 404,
      text: async () => JSON.stringify({ code: 'release_not_found', detail: 'Nenhuma versão' }),
    });

    const release = await fetchLatestRelease('admin-app', {
      fetchImpl: fakeFetch,
      baseUrl: fakeBaseUrl,
      appKey: fakeAppKey,
    });

    expect(release).toBeNull();
  });

  it('throws ApiErrorException on 401/500 responses', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      status: 401,
      text: async () => JSON.stringify({ code: 'invalid_app_key', detail: 'Negado' }),
    });

    await expect(
      fetchLatestRelease('admin-app', {
        fetchImpl: fakeFetch,
        baseUrl: fakeBaseUrl,
        appKey: fakeAppKey,
      })
    ).rejects.toThrow(ApiErrorException);
  });

  it('throws NetworkException on connection failure', async () => {
    const fakeFetch = jest.fn().mockRejectedValue(new Error('Connection lost'));

    await expect(
      fetchLatestRelease('admin-app', {
        fetchImpl: fakeFetch,
        baseUrl: fakeBaseUrl,
        appKey: fakeAppKey,
      })
    ).rejects.toThrow(NetworkException);
  });
});
