import type { SendResult, SmsProvider } from './provider.js';

export interface Msg91Config {
  authKey: string;
  /** MSG91 template ID of the DLT-approved OTP template. Its variable must be named ##otp##. */
  otpTemplateId: string;
  fetchImpl?: typeof fetch;
}

/** MSG91 Flow API. Indian SMS must use a DLT-registered sender and template, set up in MSG91. */
export class Msg91Provider implements SmsProvider {
  readonly name = 'msg91';
  constructor(private cfg: Msg91Config) {}

  async sendOtp(toE164: string, code: string): Promise<SendResult> {
    const res = await (this.cfg.fetchImpl ?? fetch)('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authkey: this.cfg.authKey,
      },
      body: JSON.stringify({
        template_id: this.cfg.otpTemplateId,
        short_url: '0',
        recipients: [{ mobiles: toE164.replace(/^\+/, ''), otp: code }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    // MSG91 can answer 200 with type "error", so check both.
    if (!res.ok || data.type !== 'success' || !data.message) {
      throw new Error(
        `MSG91 ${res.status}: ${data.type === 'error' ? data.message : 'unexpected response'}`,
      );
    }
    return { messageId: data.message };
  }
}
