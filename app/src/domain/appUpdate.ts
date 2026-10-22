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

/** The release manifest as the server sends it (snake_case JSON). */
interface AppReleasePayload {
  readonly app: string;
  readonly version_code: number;
  readonly version_name: string;
  readonly min_version_code?: unknown;
  readonly download_url: string;
  readonly changelog?: string;
  readonly published_at?: string;
}

export function parseAppRelease(payload: AppReleasePayload): AppRelease {
  return {
    app: payload.app as AppRelease['app'],
    versionCode: payload.version_code,
    versionName: payload.version_name,
    minVersionCode: typeof payload.min_version_code === 'number' ? payload.min_version_code : 1,
    downloadUrl: payload.download_url,
    changelog: payload.changelog,
    publishedAt: payload.published_at,
  };
}
