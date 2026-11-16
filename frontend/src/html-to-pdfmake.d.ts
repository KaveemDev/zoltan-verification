// html-to-pdfmake ships without types.
declare module 'html-to-pdfmake' {
  export default function htmlToPdfmake(html: string, options?: Record<string, unknown>): unknown;
}
