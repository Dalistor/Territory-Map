/**
 * Domain rules and types for in-app updates.
 */

export interface AppRelease {
  readonly app: 'app' | 'admin-app';
  readonly versionCode: number;
  readonly versionName: string;
  readonly minVersionCode: number;
  readonly downloadUrl: string;
  readonly changelog?: string;
  readonly publishedAt?: string;
}

export function isUpdateAvailable(currentCode: number, remoteCode: number): boolean {
  return remoteCode > currentCode;
}

export function isUpdateMandatory(currentCode: number, minVersionCode: number): boolean {
  return currentCode < minVersionCode;
}

export function parseAppRelease(payload: any): AppRelease {
  return {
    app: payload.app,
    versionCode: payload.version_code,
    versionName: payload.version_name,
    minVersionCode: typeof payload.min_version_code === 'number' ? payload.min_version_code : 1,
    downloadUrl: payload.download_url,
    changelog: payload.changelog,
    publishedAt: payload.published_at,
  };
}
