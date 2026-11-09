import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { afterAll, describe, expect, it } from 'vitest';
import { closePdfBrowser, fillTemplate, renderPdf } from '../services/pdf.service.js';

afterAll(() => closePdfBrowser());

describe('pdf.service', () => {
  it('fillTemplate escapes values and leaves unknown placeholders visible', () => {
    expect(
      fillTemplate('<p>{{ name }} {{missing}}</p>', { name: '<script>x</script> & "y"' }),
    ).toBe('<p>&lt;script&gt;x&lt;/script&gt; &amp; &quot;y&quot; {{missing}}</p>');
  });

  it('renders the default template to a valid A4 PDF', async () => {
    const tpl = await readFile(
      new URL('../../templates/default-agreement.html', import.meta.url),
      'utf8',
    );
    const pdf = await renderPdf(
      fillTemplate(tpl, { customerName: 'Asha Rao', agreementId: 'abc' }),
      'Agreement abc',
    );
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(Math.abs(doc.getPage(0).getWidth() - 595.28)).toBeLessThan(1); // A4 in points
  }, 60_000);
});
