import { describe, expect, it, vi } from 'vitest';
import { Msg91Provider } from '../messaging/msg91.provider.js';
import { ZeptoMailProvider } from '../messaging/zeptomail.provider.js';

const respond = (status: number, body: unknown) =>
  vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status }));
const sentBody = (f: ReturnType<typeof respond>) => JSON.parse(f.mock.calls[0]![1].body as string);
const headers = (f: ReturnType<typeof respond>) =>
  f.mock.calls[0]![1].headers as Record<string, string>;

describe('ZeptoMailProvider', () => {
  const make = (f: typeof fetch) =>
    new ZeptoMailProvider({
      apiKey: 'Zoho-enczapikey secret-key',
      host: 'api.zeptomail.in',
      from: { address: 'noreply@zoltanvisa.com', name: 'Zoltan Visa' },
      replyTo: 'support@zoltanvisa.com',
      fetchImpl: f,
    });
  const msg = {
    to: { email: 'asha@example.com', name: 'Asha' },
    subject: 'Hi',
    html: '<p>Hi</p>',
    text: 'Hi',
  };

  it('posts to the v1.1 API with the key (prefix not doubled) and returns the request id', async () => {
    const f = respond(201, { request_id: 'req-1', data: [{ code: 'EM_104' }] });
    expect(await make(f as never).send(msg)).toEqual({ messageId: 'req-1' });
    expect(f.mock.calls[0]![0]).toBe('https://api.zeptomail.in/v1.1/email');
    expect(headers(f).authorization).toBe('Zoho-enczapikey secret-key');
    expect(sentBody(f)).toEqual({
      from: { address: 'noreply@zoltanvisa.com', name: 'Zoltan Visa' },
      to: [{ email_address: { address: 'asha@example.com', name: 'Asha' } }],
      reply_to: [{ address: 'support@zoltanvisa.com' }],
      subject: 'Hi',
      htmlbody: '<p>Hi</p>',
      textbody: 'Hi',
    });
  });

  it('throws on errors without echoing the message or key', async () => {
    const f = respond(401, { error: { code: 'TM_3201', message: 'Invalid API Token' } });
    const err = (await make(f as never)
      .send({ ...msg, text: 'link /sign/SECRET' })
      .catch((e) => e)) as Error;
    expect(err.message).toBe('ZeptoMail 401: TM_3201 Invalid API Token');
    expect(err.message).not.toMatch(/SECRET|secret-key/);
  });
});

describe('Msg91Provider', () => {
  const make = (f: typeof fetch) =>
    new Msg91Provider({ authKey: 'auth-123', otpTemplateId: 'tpl-9', fetchImpl: f });

  it('sends the code through the DLT template as ##otp##, number without +', async () => {
    const f = respond(200, { type: 'success', message: '3567685a6d58313334303637' });
    expect(await make(f as never).sendOtp('+919876543210', '482913')).toEqual({
      messageId: '3567685a6d58313334303637',
    });
    expect(f.mock.calls[0]![0]).toBe('https://control.msg91.com/api/v5/flow');
    expect(headers(f).authkey).toBe('auth-123');
    expect(sentBody(f)).toEqual({
      template_id: 'tpl-9',
      short_url: '0',
      recipients: [{ mobiles: '919876543210', otp: '482913' }],
    });
  });

  it('treats a 200 with type "error" as a failure, without leaking the code', async () => {
    const f = respond(200, { type: 'error', message: 'Template not approved' });
    const err = (await make(f as never)
      .sendOtp('+919876543210', '482913')
      .catch((e) => e)) as Error;
    expect(err.message).toBe('MSG91 200: Template not approved');
    expect(err.message).not.toContain('482913');
  });
});
