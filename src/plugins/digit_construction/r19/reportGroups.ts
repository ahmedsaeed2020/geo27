/**
 * Grouped totals of a report's own rows (Full reports tab): one entry per value of the grouping column with its row count
 * and the sum of the measure column, in first-seen order. The grand total of the groups equals the report total.
 */
export type GroupTotal = [key: string, total: { n: number; v: number }];
export function groupRows(rows: Record<string, unknown>[], group: string, measure?: string): GroupTotal[] {
  const m = new Map<string, { n: number; v: number }>();
  for (const r of rows) { const k = String(r[group] ?? ""); const g = m.get(k) ?? { n: 0, v: 0 }; g.n++; g.v += measure ? Number(r[measure]) || 0 : 0; m.set(k, g); }
  return [...m];
}
