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
