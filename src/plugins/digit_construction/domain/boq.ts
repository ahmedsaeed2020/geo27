/**
 * BOQ revision comparison (estimating plan §2.3). Read only: two Digit BOQ records of one project are compared line by
 * line on the stable `line_key` (kept by Duplicate / Amend and by the BOQ hook), falling back to a unique `code` match
 * when a line was re-keyed. Amounts use the BOQ hook's own rule (lineAmount(qty, rate)), so for saved BOQs the totals
 * equal each BOQ's total_amount. Nothing is stored.
 */
import type { Doc } from "@/lib/adapter";
import { lineAmount, num, r2 } from "./calc";
import { list, rows } from "./data";

export type BoqLineStatus = "Added" | "Removed" | "Changed" | "Unchanged";
export interface BoqSide { idx: number; qty: number; rate: number; amount: number; description: string; uom: string; code: string }
export interface BoqDiffLine {
  key: string; code: string; description: string; uom: string; status: BoqLineStatus;
  /** How the two rows were matched: same line_key, or the same unique code after a re-key. */
  matched: "line_key" | "code" | "";
  base?: BoqSide | undefined; target?: BoqSide | undefined;
  dq: number; dr: number; da: number; changed: ("qty" | "rate" | "description" | "uom")[];
}
export interface BoqComparison { lines: BoqDiffLine[]; totals: { base: number; target: number; delta: number }; counts: Record<BoqLineStatus, number> }

/** BOQs of a project, newest revision first (cancelled ones excluded — they are not part of the revision history). */
export function projectBoqs(project: string): Doc[] {
  return list("Digit BOQ", (b) => b["project"] === project && num(b.docstatus) !== 2)
    .sort((a, b) => num(b["revision"]) - num(a["revision"]) || String(b.name).localeCompare(String(a.name), undefined, { numeric: true }));
}
/** The BOQ a revision is compared with by default: its base_revision, else the BOQ it was amended from, else the next older BOQ of the project. */
export function defaultBase(target: Doc, boqs: Doc[]): Doc | undefined {
  const named = [target["base_revision"], target["amended_from"]].map((x) => String(x ?? "")).find((n) => n && n !== target.name && boqs.some((b) => b.name === n));
  if (named) return boqs.find((b) => b.name === named);
  const i = boqs.findIndex((b) => b.name === target.name);
  return i >= 0 ? boqs[i + 1] : undefined;
}

// amount = qty × rate by the same lineAmount rule the BOQ hook stores, so a row saved without the hook still compares correctly
const side = (l: Record<string, unknown>, i: number): BoqSide => ({ idx: num(l["idx"]) || i + 1, qty: num(l["qty"]), rate: num(l["rate"]), amount: lineAmount(l["qty"], l["rate"]), description: String(l["description"] ?? ""), uom: String(l["uom"] ?? ""), code: String(l["code"] ?? "") });

export function compareBoqs(base: Doc, target: Doc): BoqComparison {
  const b = rows(base, "items").map((l, i) => ({ key: String(l["line_key"] ?? ""), s: side(l, i) }));
  const t = rows(target, "items").map((l, i) => ({ key: String(l["line_key"] ?? ""), s: side(l, i) }));
  const used = new Set<number>();
  const codeCount = (xs: typeof b, code: string) => xs.filter((x) => x.s.code === code).length;
  const lines: BoqDiffLine[] = [];
  for (const x of t) {
    let j = x.key ? b.findIndex((y, k) => !used.has(k) && y.key === x.key) : -1;
    let matched: BoqDiffLine["matched"] = j >= 0 ? "line_key" : "";
    if (j < 0 && x.s.code && codeCount(t, x.s.code) === 1 && codeCount(b, x.s.code) === 1) { j = b.findIndex((y, k) => !used.has(k) && y.s.code === x.s.code); if (j >= 0) matched = "code"; }
    if (j < 0) { lines.push({ key: x.key, code: x.s.code, description: x.s.description, uom: x.s.uom, status: "Added", matched: "", target: x.s, dq: x.s.qty, dr: 0, da: x.s.amount, changed: [] }); continue; }
    used.add(j); const y = b[j]!.s;
    const changed: BoqDiffLine["changed"] = [];
    if (y.qty !== x.s.qty) changed.push("qty");
    if (y.rate !== x.s.rate) changed.push("rate");
    if (y.description !== x.s.description) changed.push("description");
    if (y.uom !== x.s.uom) changed.push("uom");
    lines.push({ key: x.key || b[j]!.key, code: x.s.code, description: x.s.description, uom: x.s.uom, status: changed.length ? "Changed" : "Unchanged", matched, base: y, target: x.s, dq: r2(x.s.qty - y.qty), dr: r2(x.s.rate - y.rate), da: r2(x.s.amount - y.amount), changed });
  }
  b.forEach((y, k) => { if (!used.has(k)) lines.push({ key: y.key, code: y.s.code, description: y.s.description, uom: y.s.uom, status: "Removed", matched: "", base: y.s, dq: -y.s.qty, dr: 0, da: -y.s.amount, changed: [] }); });
  lines.sort((p, q) => (p.code || "").localeCompare(q.code || "", undefined, { numeric: true }) || p.status.localeCompare(q.status));
  const totals = { base: r2(b.reduce((s, x) => s + x.s.amount, 0)), target: r2(t.reduce((s, x) => s + x.s.amount, 0)), delta: 0 };
  totals.delta = r2(totals.target - totals.base);
  const counts = { Added: 0, Removed: 0, Changed: 0, Unchanged: 0 } as Record<BoqLineStatus, number>;
  for (const l of lines) counts[l.status]++;
  return { lines, totals, counts };
}
