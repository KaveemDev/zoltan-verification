import { escapeHtml } from '../services/pdf.service.js';

const BRAND = '#D6194A'; // Zoltan pink, darkened for readable white text

function layout(business: string, bodyHtml: string, footer: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f6f8;font-family:Inter,Arial,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;padding:28px">
<tr><td style="font-size:18px;font-weight:700;color:${BRAND};padding-bottom:16px">${escapeHtml(business)}</td></tr>
<tr><td style="font-size:16px;line-height:1.6">${bodyHtml}</td></tr>
<tr><td style="font-size:12px;color:#6e6e73;padding-top:24px;border-top:1px solid #eee">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

export function signingLinkEmail(p: {
  name: string;
  business: string;
  link: string;
  expiresAt: string;
  support: string;
}) {
  const subject = `Please review and sign your agreement with ${p.business}`;
  const html = layout(
    p.business,
    `<p>Hi ${escapeHtml(p.name)},</p>
<p>Your agreement with ${escapeHtml(p.business)} is ready. It takes about 3 minutes: confirm it's you with a one-time code, read the agreement, record a short confirmation video and sign.</p>
<p style="text-align:center;padding:12px 0"><a href="${escapeHtml(p.link)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:10px">Review and sign</a></p>
<p style="font-size:14px;color:#6e6e73">This link is personal to you and works until ${escapeHtml(p.expiresAt)}. Please don't forward it.</p>`,
    `Questions? Reply to this email or write to ${escapeHtml(p.support)}.`,
  );
  const text = `Hi ${p.name},\n\nYour agreement with ${p.business} is ready. Review and sign here:\n${p.link}\n\nThis link is personal to you and works until ${p.expiresAt}.\n\nQuestions? Write to ${p.support}.`;
  return { subject, html, text };
}

export function otpEmail(p: { business: string; code: string; support: string }) {
  const subject = `${p.code} is your ${p.business} verification code`;
  const html = layout(
    p.business,
    `<p>Your verification code is:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;text-align:center;padding:8px 0">${escapeHtml(p.code)}</p>
<p style="font-size:14px;color:#6e6e73">It works for 10 minutes. Never share this code with anyone, including our staff.</p>`,
    `If you didn't ask for this code, you can ignore this email. Questions? Write to ${escapeHtml(p.support)}.`,
  );
  const text = `Your ${p.business} verification code is ${p.code}. It works for 10 minutes. Never share it with anyone.`;
  return { subject, html, text };
}
