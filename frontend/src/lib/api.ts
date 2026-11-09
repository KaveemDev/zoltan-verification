/**
 * API origin. Empty in dev (Vite proxies /api); in production the API lives on its own subdomain,
 * e.g. VITE_API_URL=https://api.zoltanvisa.com, and staff cookies are shared via COOKIE_DOMAIN.
 */
export const API_BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function csrfToken() {
  return document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/)?.[1];
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const csrf = csrfToken();
  if (method !== 'GET' && csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(res.status, data.error ?? 'ERROR', data.message ?? 'Request failed');
  return data as T;
}
