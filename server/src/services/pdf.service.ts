import puppeteer, { type Browser } from 'puppeteer';

export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Fills {{name}} placeholders with HTML-escaped values. Unknown placeholders stay visible so typos get noticed. */
export function fillTemplate(bodyHtml: string, vars: Record<string, string>): string {
  return bodyHtml.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) =>
    k in vars ? escapeHtml(vars[k]!) : m,
  );
}

const PAGE_CSS = `
  body { font-family: Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #111; }
  h1 { font-size: 18pt; margin: 0 0 12pt; }
  h2 { font-size: 13pt; margin: 16pt 0 6pt; }
  p { margin: 0 0 8pt; }
`;

let browserPromise: Promise<Browser> | undefined;
function getBrowser() {
  // --no-sandbox only inside containers, where Chrome's sandbox usually can't start.
  browserPromise ??= puppeteer.launch({
    args: process.env.PUPPETEER_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
  });
  return browserPromise;
}

export async function closePdfBrowser() {
  const b = await browserPromise;
  browserPromise = undefined;
  await b?.close();
}

/** Renders filled template HTML to an A4 PDF with the agreement ID and page numbers in the footer. */
export async function renderPdf(
  html: string,
  footerText: string,
  pageNumbers = true,
): Promise<Uint8Array> {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setJavaScriptEnabled(false);
    // Template is staff-authored HTML: allow no network access at all.
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith('data:') ? r.continue() : r.abort()));
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head><body>${html}</body></html>`,
    );
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '22mm', left: '18mm', right: '18mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:8pt;color:#555;width:100%;padding:0 18mm;display:flex;justify-content:space-between">
        <span>${escapeHtml(footerText)}</span>
        ${pageNumbers ? '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>' : ''}</div>`,
    });
  } finally {
    await page.close();
  }
}
