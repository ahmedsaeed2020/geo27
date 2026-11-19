/**
 * SC-F-09 Cost Center & Dimensions selectors — native Cost Center hierarchy (parent_cost_center) with posted GL
 * Entry debit/credit per cost center rolled up to groups (read-only sums of stored GL rows, is_cancelled = 0),
 * plus configured Accounting Dimensions. No posting, no allocation, no budget math.
 */
import type { Doc } from "@/lib/adapter";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface CcNode { name: string; label: string; isGroup: boolean; disabled: boolean; depth: number; debit: number; credit: number; entries: number; children: CcNode[] }

export function costCenterTree(ccs: Doc[], gl: Doc[] | null, company: string): { roots: CcNode[]; flat: CcNode[] } {
  const rows = ccs.filter((c) => !company || !c["company"] || c["company"] === company);
  const by = new Map<string, CcNode>(rows.map((c) => [c.name, { name: c.name, label: String(c["cost_center_name"] ?? c.name), isGroup: n(c["is_group"]) === 1, disabled: n(c["disabled"]) === 1, depth: 0, debit: 0, credit: 0, entries: 0, children: [] }]));
  const parent = new Map(rows.map((c) => [c.name, String(c["parent_cost_center"] ?? "")]));
  const roots: CcNode[] = [];
  for (const node of by.values()) { const p = by.get(parent.get(node.name) ?? ""); (p && p !== node ? p.children : roots).push(node); }
  for (const g of gl ?? []) {
    if (n(g["is_cancelled"]) || (company && g["company"] && g["company"] !== company)) continue;
    let cur = by.get(String(g["cost_center"] ?? "")); const seen = new Set<string>();
    while (cur && !seen.has(cur.name)) { seen.add(cur.name); cur.debit = r2(cur.debit + n(g["debit"])); cur.credit = r2(cur.credit + n(g["credit"])); cur.entries++; cur = by.get(parent.get(cur.name) ?? ""); }
  }
  const flat: CcNode[] = [];
  const walk = (x: CcNode, d: number) => { x.depth = d; flat.push(x); x.children.sort((a, b) => a.name.localeCompare(b.name)).forEach((c) => walk(c, d + 1)); };
  roots.sort((a, b) => a.name.localeCompare(b.name)).forEach((r) => walk(r, 0));
  return { roots, flat };
}

export interface Dimension { name: string; label: string; documentType: string; disabled: boolean; mandatoryFor: string[] }
export function dimensions(dims: Doc[], company: string): Dimension[] {
  return dims.map((d) => {
    const defs = Array.isArray(d["dimension_defaults"]) ? (d["dimension_defaults"] as Record<string, unknown>[]) : [];
    const mine = defs.filter((x) => !company || x["company"] === company);
    const mandatoryFor = [...(mine.some((x) => n(x["mandatory_for_bs"])) ? ["Balance Sheet"] : []), ...(mine.some((x) => n(x["mandatory_for_pl"])) ? ["Profit and Loss"] : [])];
    return { name: d.name, label: String(d["label"] ?? d.name), documentType: String(d["document_type"] ?? ""), disabled: n(d["disabled"]) === 1, mandatoryFor };
  }).sort((a, b) => a.label.localeCompare(b.label));
}
