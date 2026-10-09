jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    API_BASE_URL: 'https://api.territorymap.test',
    APP_KEY: 'secret-key-123',
  },
}));

import { fetchLatestRelease } from './update-client';
import { ApiErrorException, NetworkException } from './api-client';

describe('update-client', () => {
  const fakeBaseUrl = 'https://api.territorymap.test';
  const fakeAppKey = 'secret-key-123';

  it('fetches latest release and parses response successfully', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          app: 'app',
          version_code: 10,
          version_name: '1.2.0',
          min_version_code: 5,
          download_url: '/updates/download/app',
          changelog: 'Correções importantes',
        }),
    });

    const release = await fetchLatestRelease('app', {
      fetchImpl: fakeFetch,
      baseUrl: fakeBaseUrl,
      appKey: fakeAppKey,
    });

    expect(fakeFetch).toHaveBeenCalledWith(
      `${fakeBaseUrl}/updates/latest?app=app`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-App-Key': fakeAppKey,
        }),
      })
    );

    expect(release).toEqual({
      app: 'app',
      versionCode: 10,
      versionName: '1.2.0',
      minVersionCode: 5,
      downloadUrl: '/updates/download/app',
      changelog: 'Correções importantes',
      publishedAt: undefined,
    });
  });

  it('returns null when server answers 404 (no release registered)', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      status: 404,
      text: async () => JSON.stringify({ code: 'release_not_found', detail: 'Not found' }),
    });

    const release = await fetchLatestRelease('app', {
      fetchImpl: fakeFetch,
      baseUrl: fakeBaseUrl,
      appKey: fakeAppKey,
    });

    expect(release).toBeNull();
  });

  it('throws ApiErrorException on non-200 / non-404 error response', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      status: 401,
      text: async () => JSON.stringify({ code: 'invalid_app_key', detail: 'Chave inválida' }),
    });

    await expect(
      fetchLatestRelease('app', {
        fetchImpl: fakeFetch,
        baseUrl: fakeBaseUrl,
        appKey: fakeAppKey,
      })
    ).rejects.toThrow(ApiErrorException);
  });

  it('throws NetworkException when fetch rejects', async () => {
    const fakeFetch = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(
      fetchLatestRelease('app', {
        fetchImpl: fakeFetch,
        baseUrl: fakeBaseUrl,
        appKey: fakeAppKey,
      })
    ).rejects.toThrow(NetworkException);
  });
});
