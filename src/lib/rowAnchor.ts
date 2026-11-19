/**
 * Child-row deep link for native forms: `?row=<table fieldname>:<idx>` (e.g. `?row=items:3`).
 * The form opens the tab and section holding that table and highlights the row whose `idx` matches, so a report
 * amount can drill to the exact child row it came from. Display only: nothing is stored, and a form opened without
 * the parameter behaves exactly as before. Virtual Core presentation; real Frappe Desk has no such URL parameter.
 */
export interface RowAnchor { table: string; idx: number }

/** Search-param value for a child row anchor; undefined when the table or row number is not usable. */
export function formatRowAnchor(table: string | undefined, idx: unknown): string | undefined {
  const n = Number(idx);
  return table && /^[A-Za-z0-9_]+$/.test(table) && Number.isInteger(n) && n >= 1 ? `${table}:${n}` : undefined;
}

/** Parses `?row=` (string `table:idx`); anything else (missing, malformed, idx < 1) is ignored. */
export function parseRowAnchor(v: unknown): RowAnchor | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^([A-Za-z0-9_]+):(\d+)$/.exec(v.trim());
  if (!m) return undefined;
  const idx = Number(m[2]);
  return idx >= 1 ? { table: m[1]!, idx } : undefined;
}
