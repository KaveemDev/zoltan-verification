/**
 * LEGAL TEXT SHOWN TO CUSTOMERS. Your lawyer can edit the wording below.
 *
 * When you change ANY text in this file, also change LEGAL_TEXT_VERSION (e.g. to today's date).
 * The version is stored with each agreement, so you can always prove which wording a customer saw.
 * Placeholders in {curly braces} are filled in automatically.
 */
export const LEGAL_TEXT_VERSION = '2026-11-09';

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

  /**
   * Client Declaration from Zoltan's paper agreement, word for word. The customer must tick every
   * one before signing; the ticked list goes into the audit trail and onto the signed PDF.
   */
  declarations: [
    'I have carefully read and understood every page of this Agreement.',
    'I understand that Zoltan Global does not guarantee visa approval.',
    'I understand that the Embassy or Immigration Authority has the sole authority to approve or refuse my application.',
    'I confirm that every document submitted by me is genuine, authentic, and legally obtained.',
    'I understand that submitting false or forged documents may result in refusal, legal action, immigration bans, or prosecution, and I shall be solely responsible.',
    'I understand that professional consultancy fees paid to Zoltan Global are non-refundable once work has commenced.',
    'I authorize Zoltan Global to prepare, process, submit, and communicate with Embassies, Consulates, Visa Application Centres, Airlines, Hotels, Insurance Companies, and other relevant authorities on my behalf where permitted.',
    'I agree to provide any additional documents requested by the Embassy or the Company within the prescribed time.',
    'I voluntarily sign this Agreement without pressure, coercion, or undue influence.',
    'I accept all the terms and conditions mentioned in this Agreement.',
  ],

  /** Shown above the signature box. */
  signatureNotice:
    'By signing below, you are signing this agreement electronically. ' +
    'Your electronic signature has the same effect as a handwritten one.',

  /** Contact shown on the privacy page for questions and deletion requests. */
  privacyContactEmail: 'privacy@example.com',
} as const;

export const fillLegal = (text: string, vars: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
