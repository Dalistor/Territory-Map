import Config from 'react-native-config';
import { AppRelease, parseAppRelease } from '../domain/appUpdate';
import {
  ApiErrorException,
  FetchImpl,
  NetworkException,
} from './api-client';

export interface UpdateClientOptions {
  readonly fetchImpl?: FetchImpl;
  readonly baseUrl?: string;
  readonly appKey?: string;
}

const APP_KEY_HEADER = 'X-App-Key';

export async function fetchLatestRelease(
  appId: 'app' | 'admin-app',
  options: UpdateClientOptions = {}
): Promise<AppRelease | null> {
  const fetchImpl: FetchImpl =
    options.fetchImpl ?? ((url, init) => (globalThis as unknown as { fetch: FetchImpl }).fetch(url, init));
  const baseUrl = (options.baseUrl ?? Config.API_BASE_URL ?? '').replace(/\/+$/, '');
  const appKey = options.appKey ?? Config.APP_KEY ?? '';

  const url = `${baseUrl}/updates/latest?app=${appId}`;

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        [APP_KEY_HEADER]: appKey,
      },
    });
  } catch (err) {
    throw new NetworkException(
      err instanceof Error ? err.message : 'Falha na conexão com o servidor.'
    );
  }

  if (response.status === 404) {
    return null;
  }

  const rawText = await response.text();

  if (response.status >= 400) {
    try {
      const errorJson = JSON.parse(rawText);
      throw new ApiErrorException(
        response.status,
        errorJson.code ?? 'unknown_error',
        errorJson.detail ?? 'Erro ao verificar atualizações.'
      );
    } catch (e) {
      if (e instanceof ApiErrorException) {
        throw e;
      }
      throw new NetworkException(`Servidor retornou status ${response.status}.`);
    }
  }

  try {
    const data = JSON.parse(rawText);
    return parseAppRelease(data);
  } catch {
    throw new NetworkException('Resposta inválida do servidor ao consultar atualizações.');
  }
}
