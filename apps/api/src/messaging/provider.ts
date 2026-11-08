export interface SendResult {
  messageId: string;
}

export interface EmailMessage {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<SendResult>;
}

/** SMS is only used for one-time codes, sent through a pre-approved (DLT) template. */
export interface SmsProvider {
  readonly name: string;
  sendOtp(toE164: string, code: string): Promise<SendResult>;
}
