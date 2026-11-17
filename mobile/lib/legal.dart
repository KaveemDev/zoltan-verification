// Mirrors server/src/shared/legal.ts. Keep legalTextVersion identical to the server's
// LEGAL_TEXT_VERSION, or completeSigning is rejected with LEGAL_TEXT_CHANGED.
const legalTextVersion = '2026-11-09';

const recordingNotice =
    'We will record a short selfie video of you confirming this agreement. '
    'It is stored securely and used only as proof of your consent. '
    '{businessName} processes this video and your other personal data under the '
    'Digital Personal Data Protection Act, 2023, keeps it only as long as needed for this purpose '
    'or as required by law, and you can ask us to delete it at any time.';

const recordingConsent = 'I agree to record a short confirmation video.';

const agreementConsent = 'I have read and understood the agreement above, and I agree to its terms.';

const declarations = [
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
];

const signatureNotice =
    'By signing below, you are signing this agreement electronically. '
    'Your electronic signature has the same effect as a handwritten one.';

const packageLabel = {'VISA': 'visa', 'TRAVEL': 'travel', 'BOTH': 'visa and travel'};
