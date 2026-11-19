/** A panel's data source in words for users (owner 2026-11-13: names, never codes or field paths; no English on Arabic
 *  screens): the document types it reads — "CRM Deal + Sales Person.targets + Sales Order.sales_team" → CRM Deal ·
 *  Sales Person · Sales Order. The full technical line stays a Developer-mode note, since frappe screens never show it. */
export function sourceDocTypes(source: string | undefined): string[] {
  const out: string[] = [];
  for (const part of String(source ?? "").replace(/\([^)]*\)/g, " ").split(/\s*(?:\+|,|×|→|←|\/)\s*/)) {
    const lead = part.replace(/\.[a-z][\w]*(?:\.[a-z][\w]*)*/g, "").trim().match(/^[A-Z][\w]*(?:\s+[A-Z][\w]*)*/)?.[0];
    if (lead && !out.includes(lead)) out.push(lead);
  }
  return out;
}
/** The user-facing source line: document type names joined, translated by the caller's label function; names the
 *  dictionary cannot translate are left out on Arabic screens rather than shown in English. */
export function plainSource(source: string | undefined, tr: (s: string) => string = (s) => s, ar = false): string {
  return sourceDocTypes(source).map(tr).filter((s) => !ar || /[\u0600-\u06FF]/.test(s)).join(" · ");
}
