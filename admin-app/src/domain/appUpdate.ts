/**
 * Domain rules and types for in-app updates in admin-app.
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

export function parseAppRelease(payload: Record<string, unknown>): AppRelease {
  return {
    app: String(payload.app) as AppRelease['app'],
    versionCode: Number(payload.version_code),
    versionName: String(payload.version_name),
    minVersionCode: typeof payload.min_version_code === 'number' ? payload.min_version_code : 1,
    downloadUrl: String(payload.download_url),
    changelog: typeof payload.changelog === 'string' ? payload.changelog : '',
    publishedAt: typeof payload.published_at === 'string' ? payload.published_at : undefined,
  };
}
