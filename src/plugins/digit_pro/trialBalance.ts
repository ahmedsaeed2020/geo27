/** SC-F-11 Trial Balance selectors — read-only view over the Core Trial Balance runner (trial_balance.py port): collapse, search, totals. */
import type { Row } from "@/lib/reportRunner";

const n = (v: unknown) => Number(v) || 0;
export const TB_KEYS = ["opening_debit", "opening_credit", "debit", "credit", "closing_debit", "closing_credit"] as const;

/** Hide rows under collapsed groups (indent-based, same order as the runner); search keeps matches plus their ancestors. */
export function visibleRows(rows: Row[], collapsed: Set<string>, q: string): Row[] {
  const body = rows.filter((r) => r["account"] !== "Total");
  const needle = q.trim().toLowerCase();
  if (needle) {
    const keep = new Set<number>();
    body.forEach((r, i) => {
      if (!String(r["account"]).toLowerCase().includes(needle)) return;
      keep.add(i); let ind = n(r.indent);
      for (let j = i - 1; j >= 0 && ind > 0; j--) if (n(body[j]!.indent) < ind) { keep.add(j); ind = n(body[j]!.indent); }
    });
    return body.filter((_, i) => keep.has(i));
  }
  const out: Row[] = []; let hideBelow = Infinity;
  for (const r of body) {
    const ind = n(r.indent);
    if (ind > hideBelow) continue;
    hideBelow = Infinity;
    out.push(r);
    if (collapsed.has(String(r["account"]))) hideBelow = ind;
  }
  return out;
}

export function tbTotals(rows: Row[]) {
  const t = rows.find((r) => r["account"] === "Total") ?? {};
  const v = Object.fromEntries(TB_KEYS.map((k) => [k, n((t as Row)[k])])) as Record<(typeof TB_KEYS)[number], number>;
  return { ...v, periodOk: Math.abs(v.debit - v.credit) < 0.01, closingOk: Math.abs(v.closing_debit - v.closing_credit) < 0.01 };
}
