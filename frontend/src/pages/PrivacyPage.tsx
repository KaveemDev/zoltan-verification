import { LEGAL_TEXT } from '../shared/index';

/** Placeholder: replace with your lawyer-approved privacy policy. */
export function PrivacyPage() {
  const mail = LEGAL_TEXT.privacyContactEmail;
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 text-lg leading-relaxed">
      <h1 className="text-2xl font-semibold">Privacy policy</h1>
      <p className="rounded-lg bg-amber-50 p-3 text-base text-amber-900">
        Placeholder text. Replace with the policy approved by your lawyer.
      </p>
      <h2 className="text-xl font-semibold">What we collect</h2>
      <p>
        Your name, phone number, email (if given), the agreement you sign, your signature, a short
        confirmation video, and technical details such as IP address, browser and device type at the
        time of signing.
      </p>
      <h2 className="text-xl font-semibold">Why</h2>
      <p>
        To deliver the service you asked for and to keep proof that you agreed to it, under the
        Digital Personal Data Protection Act, 2023.
      </p>
      <h2 className="text-xl font-semibold">How long</h2>
      <p>By default, 3 years after signing, unless the law requires us to keep it longer.</p>
      <h2 className="text-xl font-semibold">Your rights</h2>
      <p>You can ask to see, correct or delete your data at any time.</p>
      <a
        href={`mailto:${mail}?subject=${encodeURIComponent('Data deletion request')}&body=${encodeURIComponent('Please delete my personal data.\n\nName:\nPhone number:\nAgreement ID (if known):')}`}
        className="inline-block rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white"
      >
        Request deletion of my data
      </a>
      <p className="text-base text-slate-600">Or write to {mail}.</p>
    </main>
  );
}
