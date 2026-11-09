/**
 * Demo mode (VITE_DEMO=true): no backend at all. Every /api/v1 call is answered here in the browser so a
 * client can click through staff + signing flows. The signing token *is* the customer's details
 * (base64url JSON), so a /sign link works on any device without a database.
 */
import type {
  AgreementDetail,
  AgreementListItem,
  CreateAgreement,
  PublicAgreementInfo,
  SigningDocument,
} from './shared/index';

export const DEMO = import.meta.env.VITE_DEMO === 'true';

type Stored = AgreementListItem & Omit<CreateAgreement, 'templateId'> & { signedAt: string | null };

const LIST_KEY = 'demo-agreements';
const load = (): Stored[] => {
  try {
    return JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]');
  } catch {
    return [];
  }
};
const save = (items: Stored[]) => {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(items));
  } catch {
    /* private mode: list just won't persist */
  }
};

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const unb64url = (s: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
  );

type TokenData = {
  n: string;
  p: string;
  e: string;
  t: Stored['packageType'];
  d: string;
  x: string;
  pr: number;
  c: string;
};
export const demoToken = (a: Stored) =>
  b64url(
    JSON.stringify({
      n: a.customerName,
      p: a.customerPhone,
      e: a.customerEmail,
      t: a.packageType,
      d: a.destination,
      x: a.tokenExpiresAt ?? '',
      pr: a.price,
      c: a.currency,
    } satisfies TokenData),
  );
const readToken = (token: string): TokenData | null => {
  try {
    const t = JSON.parse(unb64url(token));
    return typeof t?.n === 'string' ? t : null;
  } catch {
    return null;
  }
};

const ME = { id: 'demo', name: 'Demo Staff', email: 'demo@zoltanvisa.com', role: 'ADMIN' as const };
const progress = new Map<string, SigningDocument['progress']>();
const later = (ms: number) => new Date(Date.now() + ms).toISOString();

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const fail = (status: number, error: string, message: string) => json(status, { error, message });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- parsed request JSON, shape depends on route
function handle(method: string, path: string, query: URLSearchParams, body: any): Response {
  // ---- staff ----
  if (path === '/auth/me' || path === '/auth/login') return json(200, ME);
  if (path === '/auth/logout') return json(204);
  if (path === '/templates')
    return json(200, [{ id: 'demo', name: 'Visa Assistance Agreement', version: 1 }]);

  if (path === '/agreements' && method === 'POST') {
    const now = new Date().toISOString();
    const a: Stored = {
      ...body,
      id: crypto.randomUUID(),
      status: 'SENT',
      createdAt: now,
      tokenExpiresAt: later(72 * 3600_000),
      signedAt: null,
    };
    save([a, ...load()]);
    return json(201, a);
  }
  if (path === '/agreements') {
    const q = (query.get('q') ?? '').toLowerCase();
    const items = load().filter((a) => !q || a.customerName.toLowerCase().includes(q));
    return json(200, { items, total: items.length, page: 1, pageSize: 100 });
  }
  const detail = path.match(/^\/agreements\/([^/]+)(\/.*)?$/);
  if (detail) {
    const a = load().find((x) => x.id === detail[1]);
    if (!a) return fail(404, 'NOT_FOUND', 'Agreement not found');
    if (detail[2] === '/pdf-url')
      return json(200, { url: '/demo-agreement.pdf', expiresAt: later(3600_000) });
    if (detail[2]) return fail(501, 'DEMO', 'Not available in the demo');
    const d: AgreementDetail = {
      ...a,
      price: String(a.price),
      customerEmail: a.customerEmail,
      notes: a.notes ?? null,
      templateId: 'demo',
      templateVersion: 1,
      consentTextVersion: null,
      createdBy: { id: ME.id, name: ME.name },
      retentionDueAt: null,
      purgedAt: null,
      originalPdfSha256: null,
      signedPdfSha256: null,
      hasVideo: false,
      videoSha256: null,
      videoMimeType: null,
      videoDurationSec: null,
      events: [],
    };
    return json(200, d);
  }

  // ---- public signing ----
  const sign = path.match(/^\/sign\/([^/]+)(\/.*)?$/);
  if (sign) {
    const token = decodeURIComponent(sign[1]!);
    const t = readToken(token);
    if (!t) return fail(404, 'LINK_INVALID', 'Link not found');
    const p = progress.get(token) ?? {
      viewed: false,
      recordingConsented: false,
      videoRecorded: false,
    };
    progress.set(token, p);
    switch (sign[2] ?? '') {
      case '':
        return json(200, {
          businessName: 'Zoltan Visa',
          customerName: t.n,
          codeChannel: 'sms',
          codeDestination: `••••${t.p.slice(-4)}`,
          packageType: t.t,
          destination: t.d,
          expiresAt: t.x,
        } satisfies PublicAgreementInfo);
      case '/otp/send':
        return json(200, { expiresAt: later(600_000), resendAvailableAt: later(30_000) });
      case '/otp/verify':
        return json(200, { sessionToken: 'demo', expiresAt: later(3600_000) });
      case '/document':
        return json(200, {
          pdfUrl: '/demo-agreement.pdf',
          packageType: t.t,
          destination: t.d,
          price: String(t.pr ?? 0),
          currency: t.c ?? 'INR',
          progress: p,
        } satisfies SigningDocument);
      case '/events':
        if (body?.type === 'AGREEMENT_VIEWED') p.viewed = true;
        if (body?.type === 'RECORDING_CONSENT_GIVEN') p.recordingConsented = true;
        return json(204);
      case '/video/presign':
        return json(200, {
          uploadUrl: 'demo',
          headers: { 'Content-Type': body?.mimeType },
          uploadId: 'demo',
          expiresAt: later(600_000),
        });
      case '/video/confirm':
        p.videoRecorded = true;
        return json(204);
      case '/complete': {
        const signedAt = new Date().toISOString();
        // Same browser as the staff dashboard? Mark it signed there too.
        save(
          load().map((a) => (demoToken(a) === token ? { ...a, status: 'SIGNED', signedAt } : a)),
        );
        return json(200, { agreementId: crypto.randomUUID(), signedAt });
      }
    }
  }
  return fail(501, 'DEMO', 'Not available in the demo');
}

if (DEMO) {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const i = url.pathname.indexOf('/api/v1');
    if (i === -1) return realFetch(input, init);
    await new Promise((r) => setTimeout(r, 300)); // feel like a real network
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    return handle(init?.method ?? 'GET', url.pathname.slice(i + 7), url.searchParams, body);
  };
}
