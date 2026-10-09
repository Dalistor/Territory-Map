import {
  isUpdateAvailable,
  isUpdateMandatory,
  parseAppRelease,
} from './appUpdate';

describe('appUpdate domain in admin-app', () => {
  describe('isUpdateAvailable', () => {
    it('returns true when remote version code is greater than current code', () => {
      expect(isUpdateAvailable(5, 6)).toBe(true);
    });

    it('returns false when remote version code is equal or lower', () => {
      expect(isUpdateAvailable(6, 6)).toBe(false);
      expect(isUpdateAvailable(7, 6)).toBe(false);
    });
  });

  describe('isUpdateMandatory', () => {
    it('returns true when current code is lower than minVersionCode', () => {
      expect(isUpdateMandatory(4, 5)).toBe(true);
    });

    it('returns false when current code is at least minVersionCode', () => {
      expect(isUpdateMandatory(5, 5)).toBe(false);
      expect(isUpdateMandatory(6, 5)).toBe(false);
    });
  });

  describe('parseAppRelease', () => {
    it('parses valid payload into AppRelease', () => {
      const payload = {
        app: 'admin-app',
        version_code: 8,
        version_name: '1.1.2',
        min_version_code: 5,
        download_url: '/updates/download/admin-app',
        changelog: 'Ajustes no painel de quadras',
        published_at: '2026-10-09T16:00:00Z',
      };

      const release = parseAppRelease(payload);
      expect(release).toEqual({
        app: 'admin-app',
        versionCode: 8,
        versionName: '1.1.2',
        minVersionCode: 5,
        downloadUrl: '/updates/download/admin-app',
        changelog: 'Ajustes no painel de quadras',
        publishedAt: '2026-10-09T16:00:00Z',
      });
    });
  });
});
