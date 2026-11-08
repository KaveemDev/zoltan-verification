/**
 * LEGAL TEXT SHOWN TO CUSTOMERS. Your lawyer can edit the wording below.
 *
 * When you change ANY text in this file, also change LEGAL_TEXT_VERSION (e.g. to today's date).
 * The version is stored with each agreement, so you can always prove which wording a customer saw.
 * Placeholders in {curly braces} are filled in automatically.
 */
export const LEGAL_TEXT_VERSION = '2026-11-07';

export const LEGAL_TEXT = {
  /** Shown next to the checkbox at the end of the agreement. */
  agreementConsent: 'I have read and understood the agreement above, and I agree to its terms.',

  /** Shown before the selfie video. Mentions the DPDP Act, 2023. */
  recordingNotice:
    'We will record a short selfie video of you confirming this agreement. ' +
    'It is stored securely and used only as proof of your consent. ' +
    '{businessName} processes this video and your other personal data under the ' +
    'Digital Personal Data Protection Act, 2023, keeps it only as long as needed for this purpose ' +
    'or as required by law, and you can ask us to delete it at any time.',

  recordingConsent: 'I agree to record a short confirmation video.',

  /** Shown above the signature box. */
  signatureNotice:
    'By signing below, you are signing this agreement electronically. ' +
    'Your electronic signature has the same effect as a handwritten one.',

  /** Contact shown on the privacy page for questions and deletion requests. */
  privacyContactEmail: 'privacy@example.com',
} as const;

export const fillLegal = (text: string, vars: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
