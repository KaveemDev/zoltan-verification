import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';
import type { EmailMessage, EmailProvider, SmsProvider } from './provider.js';

// Dev only (refused in production by env.ts): prints messages, including links and codes, to the log.

export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  async send(msg: EmailMessage) {
    const messageId = `console-${randomUUID()}`;
    logger.info(
      { to: msg.to.email, messageId },
      `[ConsoleProvider] Email "${msg.subject}"\n${msg.text}`,
    );
    return { messageId };
  }
}

export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  async sendOtp(to: string, code: string) {
    const messageId = `console-${randomUUID()}`;
    logger.info({ to, messageId }, `[ConsoleProvider] SMS code → ${code}`);
    return { messageId };
  }
}
