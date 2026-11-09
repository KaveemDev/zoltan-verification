/**
 * All customer-facing copy for the signing flow, in one place so it can move to react-i18next
 * (one JSON file per language) without touching components. {placeholders} are filled by `fill`.
 * Legal wording lives in src/shared/legal.ts instead.
 */
export const copy = {
  steps: { verify: 'Verify', read: 'Read', consent: 'Consent', video: 'Video', sign: 'Sign' },
  progress: 'Step {current} of {total}',
  common: {
    continue: 'Continue',
    tryAgain: 'Try again',
    loading: 'Loading…',
    genericError: 'Something went wrong. Please check your internet connection and try again.',
  },
  landing: {
    title: 'Hi {name}',
    body: '{business} has sent you an agreement for your {package} application for {destination}.',
    how: 'It takes about 3 minutes: confirm it’s you with a one-time code, read the agreement, record a short video and sign.',
    start: 'Get started',
    expires: 'This link is valid until {date}.',
  },
  otp: {
    title: 'Confirm it’s you',
    body: {
      sms: "We'll text a 6-digit code to your mobile number ending in {destination}.",
      email: "We'll email a 6-digit code to {destination}.",
    },
    send: 'Send code',
    sending: 'Sending…',
    sent: {
      sms: 'We sent you a code by SMS. It is valid for 10 minutes.',
      email:
        'We emailed you a code. It is valid for 10 minutes. Check your spam folder if you can’t see it.',
    },
    label: '6-digit code',
    verify: 'Verify',
    verifying: 'Checking…',
    resendIn: 'You can ask for a new code in {seconds}s',
    resend: 'Send a new code',
    attemptsLeft: 'That code is not right. {count} tries left.',
    sessionExpired: 'For your security, please confirm with a new code.',
  },
  read: {
    title: 'Read your agreement',
    summaryTitle: 'In short',
    summary: [
      'You are asking {business} to help with your {package} application for {destination}.',
      'The fee is {currency} {price}. Government and embassy fees are separate.',
      'Visa approval is decided by the authorities and is not guaranteed.',
    ],
    scrollHint: 'Scroll to the end of the agreement to continue.',
    pagesSeen: 'Read {seen} of {total} pages',
    loadFailed: "We couldn't load the agreement.",
  },
  consent: {
    title: 'Quick confirmation video',
    privacy: 'Privacy policy',
  },
  video: {
    title: 'Quick confirmation video',
    intro:
      'Hold your phone at eye level in a well-lit place. When you tap Start, read the sentence on screen out loud.',
    say: 'Please say:',
    script: 'I, {name}, agree to proceed with my {package} application with {business}.',
    enableCamera: 'Turn on camera',
    starting: 'Starting camera…',
    start: 'Start recording',
    stop: 'Stop',
    minHint: 'Keep going… you can stop after {seconds}s',
    recording: 'Recording {seconds}s / {max}s',
    reviewTitle: 'Check your video',
    reviewBody: 'Make sure we can see your face and hear you clearly.',
    retake: 'Retake',
    use: 'Use this video',
    preparing: 'Preparing upload…',
    uploading: 'Uploading… {percent}%',
    uploadFailed: "The upload didn't finish. Please check your internet connection.",
    retry: 'Try upload again',
    deniedTitle: 'We need your camera and microphone',
    deniedBody: 'Your browser blocked the camera or microphone. To allow them:',
    deniedAndroid:
      'Android (Chrome): tap the icon left of the web address, then Permissions, and allow Camera and Microphone.',
    deniedIos:
      'iPhone (Safari): tap "aA" in the address bar, then Website Settings, and allow Camera and Microphone.',
    deniedRetry: 'I have allowed it, try again',
    unsupportedTitle: "This browser can't record video",
    unsupportedBody:
      'Please open this link in Chrome (Android) or Safari (iPhone). If you opened it inside another app, use "Open in browser".',
    busyTitle: 'Your camera is in use',
    busyBody: 'Close other apps that might be using the camera, then try again.',
    stillStuck:
      "Still not working? Please contact {business}. We can't finish your agreement without this video.",
  },
  sign: {
    title: 'Sign the agreement',
    nameLabel: 'Type your full name',
    padLabel: 'Draw your signature',
    padHint: 'Use your finger or mouse in the box below.',
    clear: 'Clear',
    submit: 'Sign agreement',
    submitting: 'Signing…',
    needSignature: 'Please draw your signature.',
    needName: 'Please type your full name.',
    needDeclarations: 'Please tick every statement in the Client Declaration.',
    declarationsTitle: 'Client Declaration',
    declarationsHint: 'Please tick each statement before signing.',
  },
  done: {
    title: 'All done, thank you!',
    body: 'You signed your agreement with {business} on {date}.',
    id: 'Agreement ID',
    next: '{business} will share a copy with you. You can close this page.',
  },
  errors: {
    LINK_INVALID: {
      title: 'This link does not work',
      body: 'Please check you opened the full link, or ask {business} to send a new one.',
    },
    LINK_EXPIRED: {
      title: 'This link has expired',
      body: 'Please ask {business} to send you a new link.',
    },
    LINK_CANCELLED: {
      title: 'This agreement was cancelled',
      body: 'Please contact {business} if you think this is a mistake.',
    },
    ALREADY_SIGNED: {
      title: 'Already signed',
      body: 'This agreement has already been signed. There is nothing more to do.',
    },
    RATE_LIMITED: {
      title: 'Please wait a moment',
      body: 'There were too many attempts. Please try again in a few minutes.',
    },
  },
} as const;

export const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export const PACKAGE_LABEL = { VISA: 'visa', TRAVEL: 'travel', BOTH: 'visa and travel' } as const;
