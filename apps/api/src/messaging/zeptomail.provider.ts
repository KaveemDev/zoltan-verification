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
    const key = this.cfg.apiKey.replace(/^Zoho-enczapikey\s+/i, '').trim();
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
      error?: { code?: string; message?: string };
    };
    if (!res.ok || !data.request_id) {
      // Code and message only: never include the body (it carries the link or code).
      throw new Error(
        `ZeptoMail ${res.status}: ${data.error?.code ?? ''} ${data.error?.message ?? 'no request id'}`,
      );
    }
    return { messageId: data.request_id };
  }
}
