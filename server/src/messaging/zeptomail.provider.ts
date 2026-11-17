import type { EmailMessage, EmailProvider, SendResult } from './provider.js';

export interface ZeptoMailConfig {
  apiKey: string;
  /** api.zeptomail.in for India-region accounts, api.zeptomail.com otherwise. */
  host: string;
  from: { address: string; name: string };
  replyTo?: string;
  fetchImpl?: typeof fetch;
}

/** Zoho ZeptoMail over HTTPS (port 443: DigitalOcean blocks outbound SMTP ports). */
export class ZeptoMailProvider implements EmailProvider {
  readonly name = 'zeptomail';
  constructor(private cfg: ZeptoMailConfig) {}

  async send(msg: EmailMessage): Promise<SendResult> {
    // The dashboard shows the key as "Zoho-enczapikey <key>"; accept it either way.
    const key = this.key;
    const res = await (this.cfg.fetchImpl ?? fetch)(`https://${this.cfg.host}/v1.1/email`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Zoho-enczapikey ${key}`,
      },
      body: JSON.stringify({
        from: this.cfg.from,
        to: [{ email_address: { address: msg.to.email, name: msg.to.name ?? msg.to.email } }],
        ...(this.cfg.replyTo && { reply_to: [{ address: this.cfg.replyTo }] }),
        subject: msg.subject,
        htmlbody: msg.html,
        textbody: msg.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      request_id?: string;
      error?: ZeptoError;
    };
    if (!res.ok || !data.request_id) {
      // Codes and messages only: never include the body (it carries the link or code).
      throw new Error(`ZeptoMail ${res.status}: ${describe(data.error) || 'no request id'}`);
    }
    return { messageId: data.request_id };
  }

  /**
   * Asks ZeptoMail whether it accepts the configured key, without sending anything: an empty request
   * is rejected as "bad syntax" (400) when the key is good and "access denied" (401) when it isn't.
   */
  async checkKey(): Promise<{ ok: boolean; detail: string }> {
    const res = await (this.cfg.fetchImpl ?? fetch)(`https://${this.cfg.host}/v1.1/email`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Zoho-enczapikey ${this.key}`,
      },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: ZeptoError };
    return { ok: res.status !== 401, detail: `${res.status} ${describe(data.error)}`.trim() };
  }

  private get key() {
    return this.cfg.apiKey.replace(/^Zoho-enczapikey\s+/i, '').trim();
  }
}

interface ZeptoError {
  code?: string;
  message?: string;
  details?: { code?: string; message?: string }[];
}

const describe = (e?: ZeptoError) =>
  [
    e?.code,
    e?.message,
    ...(e?.details ?? []).map((d) => `${d.code ?? ''} ${d.message ?? ''}`.trim()),
  ]
    .filter(Boolean)
    .join(' ');
