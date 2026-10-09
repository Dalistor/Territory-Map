import {
  isUpdateAvailable,
  isUpdateMandatory,
  parseAppRelease,
} from './appUpdate';

describe('appUpdate domain', () => {
  describe('isUpdateAvailable', () => {
    it('returns true when remote version code is strictly greater than current code', () => {
      expect(isUpdateAvailable(10, 11)).toBe(true);
      expect(isUpdateAvailable(1, 2)).toBe(true);
    });

    it('returns false when remote version code is equal to current code', () => {
      expect(isUpdateAvailable(10, 10)).toBe(false);
    });

    it('returns false when remote version code is lower than current code', () => {
      expect(isUpdateAvailable(12, 10)).toBe(false);
    });
  });

  describe('isUpdateMandatory', () => {
    it('returns true when current code is lower than minVersionCode', () => {
      expect(isUpdateMandatory(9, 10)).toBe(true);
    });

    it('returns false when current code meets or exceeds minVersionCode', () => {
      expect(isUpdateMandatory(10, 10)).toBe(false);
      expect(isUpdateMandatory(11, 10)).toBe(false);
    });
  });

  describe('parseAppRelease', () => {
    it('converts server snake_case payload into AppRelease camelCase domain model', () => {
      const payload = {
        app: 'app',
        version_code: 15,
        version_name: '1.3.0',
        min_version_code: 12,
        download_url: '/updates/download/app',
        changelog: 'Melhorias de desempenho',
        published_at: '2026-10-09T16:00:00Z',
      };

      const result = parseAppRelease(payload);

      expect(result).toEqual({
        app: 'app',
        versionCode: 15,
        versionName: '1.3.0',
        minVersionCode: 12,
        downloadUrl: '/updates/download/app',
        changelog: 'Melhorias de desempenho',
        publishedAt: '2026-10-09T16:00:00Z',
      });
    });

    it('uses default minVersionCode of 1 when absent in payload', () => {
      const payload = {
        app: 'app',
        version_code: 5,
        version_name: '1.0.5',
        download_url: '/updates/download/app',
      };

      const result = parseAppRelease(payload);

      expect(result.minVersionCode).toBe(1);
    });
  });
});
