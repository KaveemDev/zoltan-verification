import type { DeviceInfo } from '@app/shared';
import { API_BASE } from '../lib/api';

export class SignApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: Record<string, unknown>,
  ) {
    super(message);
  }
}

const deviceInfo: DeviceInfo = {
  screen: `${screen.width}x${screen.height}`,
  dpr: Math.round(devicePixelRatio * 100) / 100,
  platform: navigator.platform,
  language: navigator.language,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

const sessionKey = (token: string) => `sign-session:${token}`;
export const session = {
  get: (token: string) => {
    try {
      return sessionStorage.getItem(sessionKey(token));
    } catch {
      return null;
    }
  },
  set: (token: string, value: string) => {
    try {
      sessionStorage.setItem(sessionKey(token), value);
    } catch {
      /* private mode: the session just won't survive a reload */
    }
  },
  clear: (token: string) => {
    try {
      sessionStorage.removeItem(sessionKey(token));
    } catch {
      /* ignore */
    }
  },
};

export async function signApi<T>(
  token: string,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'x-device-info': JSON.stringify(deviceInfo) };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const s = init.auth ? session.get(token) : null;
  if (s) headers.authorization = `Bearer ${s}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/sign/${encodeURIComponent(token)}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new SignApiError(0, 'NETWORK', 'Network error', {});
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new SignApiError(
      res.status,
      data.error ?? 'ERROR',
      data.message ?? 'Request failed',
      data,
    );
  return data as T;
}
