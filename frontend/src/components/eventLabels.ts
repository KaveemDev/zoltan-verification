/** Human labels for audit event types shown in the timeline. Unknown types show as-is. */
export const EVENT_LABEL: Record<string, string> = {
  CREATED: 'Agreement created',
  MESSAGE_SENT: 'Signing link emailed',
  MESSAGE_FAILED: 'Emailing the link failed',
  OPENED: 'Customer opened the link',
  OTP_SENT: 'Verification code sent',
  OTP_FAILED: 'Wrong verification code entered',
  OTP_VERIFIED: 'Customer verified with code',
  AGREEMENT_VIEWED: 'Customer read the agreement',
  RECORDING_CONSENT_GIVEN: 'Customer agreed to recording',
  VIDEO_RECORDED: 'Confirmation video uploaded',
  SIGNED: 'Agreement signed',
  RESENT: 'New link issued',
  EXPIRY_EXTENDED: 'Link expiry extended',
  CANCELLED: 'Agreement cancelled',
  EXPIRED: 'Link expired',
};
