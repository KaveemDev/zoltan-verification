import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

/**
 * Builds the agreement PDF in the staff member's browser from the server-filled HTML.
 * pdfmake makes real text PDFs (selectable, searchable). It's loaded only when an agreement is
 * created, so customers never download it. Limit: its built-in Roboto font covers Latin scripts;
 * Devanagari and other complex scripts won't join correctly.
 */
export async function buildAgreementPdf(html: string, footer: string): Promise<Uint8Array> {
  const [{ default: pdfMake }, { default: vfs }, { default: htmlToPdfmake }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
    import('html-to-pdfmake'),
  ]);
  pdfMake.addVirtualFileSystem(vfs);

  const content = htmlToPdfmake(html, {
    defaultStyles: {
      h1: { fontSize: 17, bold: true, marginBottom: 10 },
      h2: { fontSize: 12.5, bold: true, marginTop: 10, marginBottom: 4 },
      p: { marginBottom: 6 },
      ol: { marginBottom: 6 },
      li: { marginBottom: 2 },
      td: { margin: [4, 3, 4, 3] },
    },
  }) as Content;

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    // Bottom margin leaves room for the page-number footer and, once signed, the server's
    // "Electronically signed" stamp drawn just above it (server/src/services/signed-pdf.service.ts).
    pageMargins: [51, 57, 51, 62],
    content,
    defaultStyle: { fontSize: 10.5, lineHeight: 1.25, color: '#111111' },
    footer: (current: number, total: number) => ({
      columns: [{ text: footer }, { text: `Page ${current} of ${total}`, alignment: 'right' }],
      margin: [51, 30, 51, 0],
      fontSize: 7.5,
      color: '#555555',
    }),
    info: { title: footer, creator: 'Zoltan Visa agreements' },
  };
  return new Uint8Array(await pdfMake.createPdf(doc).getBuffer());
}
