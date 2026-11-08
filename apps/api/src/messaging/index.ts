import { env } from '../env.js';
import { ConsoleEmailProvider, ConsoleSmsProvider } from './console.provider.js';
import { Msg91Provider } from './msg91.provider.js';
import type { EmailProvider, SmsProvider } from './provider.js';
import { ZeptoMailProvider } from './zeptomail.provider.js';

export type { EmailProvider, SmsProvider } from './provider.js';

let email: EmailProvider | undefined;
export function getEmail(): EmailProvider {
  email ??=
    env.EMAIL_PROVIDER === 'zeptomail'
      ? new ZeptoMailProvider({
          apiKey: env.ZEPTOMAIL_API_KEY!,
          host: env.ZEPTOMAIL_API_HOST,
          from: { address: env.EMAIL_FROM, name: env.BUSINESS_NAME },
          replyTo: env.SUPPORT_EMAIL,
        })
      : new ConsoleEmailProvider();
  return email;
}

let sms: SmsProvider | undefined;
export function getSms(): SmsProvider {
  sms ??=
    env.SMS_PROVIDER === 'msg91'
      ? new Msg91Provider({
          authKey: env.MSG91_AUTH_KEY!,
          otpTemplateId: env.MSG91_OTP_TEMPLATE_ID!,
        })
      : new ConsoleSmsProvider();
  return sms;
}
