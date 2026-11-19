/**
 * DIGIT Construction money/quantity formulas — the single tested source (ported from the historical
 * src/domain/calc.ts, commercial.ts certMoney, cost.ts forecast and finance.ts release rules). Pure functions only:
 * no adapter reads, no tax policy. Unknown inputs return null so screens show "—" instead of a fabricated zero.
 */
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
export const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
export const lineAmount = (qty: unknown, rate: unknown) => r2(num(qty) * num(rate));
export const sumBy = <T,>(xs: T[], f: (x: T) => number) => r2(xs.reduce((s, x) => s + f(x), 0));
export const pct = (part: number, whole: number) => (whole ? r2((part / whole) * 100) : null);

// ---------------------------------------------------------------- estimating
export interface EstLine { qty?: unknown; cost_rate?: unknown; selling_rate?: unknown }
export function estimateTotals(lines: EstLine[]) {
  const cost = sumBy(lines, (l) => lineAmount(l.qty, l.cost_rate));
  const selling = sumBy(lines, (l) => lineAmount(l.qty, l.selling_rate));
  const margin = r2(selling - cost);
  return { cost, selling, margin, marginPct: pct(margin, selling) };
}
/** Lines that cannot become BOQ lines: missing selling rate, non-positive qty or missing unit (Tender→BOQ blocker). */
export function boqBlockers(lines: { line_key?: unknown; description?: unknown; qty?: unknown; selling_rate?: unknown; uom?: unknown }[]): string[] {
  const out: string[] = [];
  lines.forEach((l, i) => {
    const ref = `#${i + 1} ${String(l.description ?? "")}`.trim();
    if (!(num(l.qty) > 0)) out.push(`${ref}: quantity must be greater than zero`);
    if (!(num(l.selling_rate) > 0)) out.push(`${ref}: selling rate is missing`);
    if (!String(l.uom ?? "").trim()) out.push(`${ref}: unit of measure is missing`);
  });
  return out;
}
export const assemblyRate = (cs: { coefficient?: unknown; unit_rate?: unknown }[]) => sumBy(cs, (c) => lineAmount(c.coefficient, c.unit_rate));
/** Rate validity (warning only, P6 decides blocking). */
export function validityState(validUntil: unknown, today: string, warnDays = 30): "valid" | "expiring" | "expired" | "unknown" {
  const v = String(validUntil ?? ""); if (!v) return "unknown";
  if (v < today) return "expired";
  const days = (Date.parse(v) - Date.parse(today)) / 86400000;
  return days <= warnDays ? "expiring" : "valid";
}

// ---------------------------------------------------------------- client contract
export function contractValues(sov: { qty?: unknown; rate?: unknown; origin?: unknown }[]) {
  const original = sumBy(sov.filter((l) => l.origin !== "Variation"), (l) => lineAmount(l.qty, l.rate));
  const variations = sumBy(sov.filter((l) => l.origin === "Variation"), (l) => lineAmount(l.qty, l.rate));
  return { original, variations, revised: r2(original + variations) };
}
/** Claim line: cumulative to date may not exceed the contract (revised) quantity nor fall below previously claimed. */
export function claimLineProblem(l: { contract_qty?: unknown; previous_qty?: unknown; cumulative_qty?: unknown }): "below_previous" | "exceeds_contract" | null {
  const cum = num(l.cumulative_qty), prev = num(l.previous_qty), cq = num(l.contract_qty);
  if (cum + 1e-9 < prev) return "below_previous";
  if (cum > cq + 1e-9) return "exceeds_contract";
  return null;
}
/** Certificate line: accepted + rejected + disputed must equal the claimed quantity, none negative, reason when not all accepted. */
export function certLineProblem(l: { claimed_qty?: unknown; accepted_qty?: unknown; rejected_qty?: unknown; disputed_qty?: unknown; reason?: unknown }): "negative" | "reconcile" | "reason" | null {
  const a = num(l.accepted_qty), r = num(l.rejected_qty), d = num(l.disputed_qty), c = num(l.claimed_qty);
  if (a < 0 || r < 0 || d < 0) return "negative";
  if (Math.abs(r3(a + r + d) - r3(c)) > 1e-9) return "reconcile";
  if ((r > 0 || d > 0) && !String(l.reason ?? "").trim()) return "reason";
  return null;
}
export interface ContractTerms { advance_amount: number; advance_recovery_pct: number; retention_pct: number; retention_cap_pct: number; revised_value: number }
/**
 * Certificate money (port of commercial.ts certMoney): advance recovery and retention are applied per certificate in
 * sequence, capped by the remaining advance and the retention cap on the revised contract value. Percent inputs are 0–100.
 */
export function certMoney(terms: ContractTerms, gross: number, prior: { gross: number }[], other = 0) {
  const ar = terms.advance_recovery_pct / 100, rt = terms.retention_pct / 100, cap = (terms.retention_cap_pct || 100) / 100 * terms.revised_value;
  let recPrior = 0, retPrior = 0, grossPrior = 0;
  for (const p of prior) {
    grossPrior += p.gross;
    const rec = Math.max(0, Math.min(p.gross * ar, terms.advance_amount - recPrior)); recPrior += rec;
    const ret = Math.max(0, Math.min(p.gross * rt, cap - retPrior)); retPrior += ret;
  }
  const recovery = r2(Math.max(0, Math.min(gross * ar, terms.advance_amount - recPrior)));
  const retention = r2(Math.max(0, Math.min(gross * rt, cap - retPrior)));
  const net = r2(gross - recovery - retention - other);
  return { gross: r2(gross), previousGross: r2(grossPrior), cumulativeGross: r2(grossPrior + gross), recovery, previousRecovery: r2(recPrior), retention, previousRetention: r2(retPrior), other: r2(other), net };
}
/** Tax amount from verified template rows ("On Net Total" only); any other charge type is unverified → null. */
export function taxFromTemplate(net: number, rows: { charge_type?: unknown; rate?: unknown }[]): number | null {
  if (!rows.length) return 0;
  if (rows.some((r) => r.charge_type !== "On Net Total")) return null;
  return sumBy(rows, (r) => (net * num(r.rate)) / 100);
}

// ---------------------------------------------------------------- subcontract measurement & bills
export function entryQuantity(e: { nos?: unknown; length?: unknown; breadth?: unknown; depth?: unknown; quantity?: unknown; is_deduction?: unknown }) {
  const dims = [e.nos, e.length, e.breadth, e.depth].map(num).filter((x) => x !== 0);
  const raw = dims.length ? dims.reduce((a, b) => a * b, 1) : Math.abs(num(e.quantity));
  return r3(num(e.is_deduction) ? -Math.abs(raw) : Math.abs(raw));
}
/** Effective certified qty: reviewed accepted qty (signed like the measurement) or the measured qty when not reviewed. */
export const effectiveQty = (e: { quantity?: unknown; accepted_qty?: unknown }) => (e.accepted_qty === undefined || e.accepted_qty === null || e.accepted_qty === "" ? num(e.quantity) : Math.sign(num(e.quantity) || 1) * num(e.accepted_qty));
export function reviewProblem(measured: number, accepted: number, rejected: number, reason: unknown): "negative" | "reconcile" | "reason" | null {
  if (!(accepted >= 0) || !(rejected >= 0)) return "negative";
  if (Math.abs(r3(accepted + rejected) - r3(Math.abs(measured))) > 1e-9) return "reconcile";
  if (rejected > 0 && !String(reason ?? "").trim()) return "reason";
  return null;
}
export function billTotals(p: { gross: number; retentionPct: number; advanceAmount: number; advanceRecoveryPct: number; priorRecovered: number; other: number }) {
  const gross = r2(p.gross);
  const retention = r2(gross * p.retentionPct / 100);
  const advance = r2(Math.max(0, Math.min(gross * p.advanceRecoveryPct / 100, p.advanceAmount - p.priorRecovered)));
  const net = r2(gross - retention - advance - p.other);
  return { gross, retention, advance, other: r2(p.other), net };
}

// ---------------------------------------------------------------- cost control
export const revisedBudget = (original: number, m: { revisions: number; transferIn: number; transferOut: number }) => r2(original + m.revisions + m.transferIn - m.transferOut);
export function transferProblems(t: { from_line: string; to_line: string; amount: number }, lines: string[], available: number): string[] {
  const e: string[] = [];
  if (t.from_line === t.to_line) e.push("From and To budget lines must differ");
  if (!lines.includes(t.from_line) || !lines.includes(t.to_line)) e.push("Both lines must belong to the selected budget");
  if (!(t.amount > 0)) e.push("Transfer amount must be greater than zero");
  if (t.amount > available + 0.01) e.push(`Transfer exceeds the available balance of the source line (${r2(available)})`);
  return e;
}
export type EtcMethod = "Budget Remaining" | "Committed + Uncommitted" | "Manual ETC" | "Qty × Rate" | "Average Performance" | "Percent Complete" | "Burn Rate";
export const ETC_METHODS: EtcMethod[] = ["Budget Remaining", "Committed + Uncommitted", "Manual ETC", "Qty × Rate", "Average Performance", "Percent Complete", "Burn Rate"];
/**
 * ETC per method; Manual without a value and Committed+Uncommitted without the uncommitted estimate are unknown (null).
 * F06-09-1 adds Qty × Rate = (budget qty − installed) × unit rate and Average Performance = (actual ÷ installed) ×
 * (budget qty − installed); a blank (0) budget quantity / rate, or no installed quantity for performance, is unknown.
 * Phase 4 C4-07 adds Percent Complete = actual × (100 − %) ÷ % (blank / 0 % unknown, 100 % = 0) and Burn Rate =
 * (actual ÷ days elapsed since the project start) × days left to the line's planned finish (no start, no elapsed day or
 * no planned finish = unknown; a planned finish on or before the cut-off leaves 0 days).
 */
export function lineEtc(method: EtcMethod, p: { revised: number; committed: number; actual: number; uncommitted?: unknown; manual?: unknown; qtyBudget?: unknown; qtyInstalled?: unknown; unitRate?: unknown; pctComplete?: unknown; burn?: { elapsed: number | null; left: number | null } | undefined }): number | null {
  if (method === "Percent Complete") { const pc = num(p.pctComplete); return pc > 0 && pc <= 100 ? r2((p.actual * (100 - pc)) / pc) : null; }
  if (method === "Burn Rate") { const b = p.burn; return b && b.elapsed !== null && b.elapsed > 0 && b.left !== null ? r2((p.actual / b.elapsed) * b.left) : null; }
  if (method === "Manual ETC") return p.manual === undefined || p.manual === null || p.manual === "" ? null : r2(num(p.manual));
  if (method === "Committed + Uncommitted") return p.uncommitted === undefined || p.uncommitted === null || p.uncommitted === "" ? null : r2(p.committed + num(p.uncommitted));
  const qb = num(p.qtyBudget), qi = num(p.qtyInstalled), left = Math.max(0, qb - qi);
  if (method === "Qty × Rate") return qb > 0 && num(p.unitRate) > 0 ? r2(left * num(p.unitRate)) : null;
  if (method === "Average Performance") return qb > 0 && qi > 0 ? r2((p.actual / qi) * left) : null;
  // phase 5 (EAC = actual + ETC, ETC includes the open commitment): the remaining budget never forecasts less than what is already committed
  return r2(Math.max(0, p.revised - p.actual, p.committed));
}
const dayNo = (d: unknown) => { const x = String(d ?? "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(x) ? Math.round(Date.parse(`${x}T00:00:00Z`) / 86400000) : null; };
/** Burn-rate days: elapsed = cut-off − project start, left = max(0, planned finish − cut-off); a missing date is null. */
export function burnDays(start: unknown, cutoff: unknown, plannedFinish: unknown): { elapsed: number | null; left: number | null } {
  const a = dayNo(start), c = dayNo(cutoff), f = dayNo(plannedFinish);
  return { elapsed: a === null || c === null ? null : Math.max(0, c - a), left: c === null || f === null ? null : Math.max(0, f - c) };
}
export const eac = (actual: number, etc: number | null) => (etc === null ? null : r2(actual + etc));
export const vac = (revised: number, e: number | null) => (e === null ? null : r2(revised - e));
export function margin(revenue: number | null, e: number | null) {
  if (revenue === null || e === null) return { profit: null, marginPct: null };
  const p = r2(revenue - e); return { profit: p, marginPct: revenue ? r2((p / revenue) * 100) : null };
}

// ---------------------------------------------------------------- finance & closeout
export function retentionEligible(held: number, released: number, reserved: number) { return r2(Math.max(0, held - released - reserved)); }
export type Gate = "Complete" | "Pending" | "Not Started";
/** Area gate: every row Done, or Not Applicable with an approval; empty area = Not Started. */
export function areaGate(rows: { status?: unknown; na_approved_by?: unknown }[]): { gate: Gate; open: number } {
  if (!rows.length) return { gate: "Not Started", open: 0 };
  const open = rows.filter((r) => !(r.status === "Done" || (r.status === "Not Applicable" && String(r.na_approved_by ?? "").trim()))).length;
  return { gate: open ? "Pending" : "Complete", open };
}
/**
 * Policy P8 (owner ruling W0-02): the Director approves a subcontractor profile against a checklist — commercial
 * registration, VAT registration, insurance and safety record. A checklist item counts when the profile field or a
 * compliance document of that type is present and not expired on `today`. Returns the missing items in checklist order.
 */
export const P8_CHECKLIST: [key: string, en: string, ar: string][] = [["CR", "commercial registration", "السجل التجاري"], ["VAT", "VAT registration", "التسجيل الضريبي"], ["Insurance", "insurance", "التأمين"], ["Safety", "safety record", "سجل السلامة"]];
export function p8Missing(profile: Record<string, unknown>, docs: { doc_type?: unknown; number?: unknown; expiry?: unknown; file?: unknown }[], today: string): string[] {
  const live = (exp: unknown) => !String(exp ?? "") || String(exp) >= today;
  const doc = (k: string) => docs.some((d) => d.doc_type === k && (String(d.number ?? "").trim() || String(d.file ?? "").trim()) && live(d.expiry));
  const has: Record<string, boolean> = {
    CR: (!!String(profile["cr_number"] ?? "").trim() && live(profile["cr_expiry"])) || doc("CR"),
    VAT: !!String(profile["vat_number"] ?? "").trim() || doc("VAT"),
    Insurance: (!!String(profile["insurance_expiry"] ?? "") && live(profile["insurance_expiry"])) || doc("Insurance"),
    Safety: doc("Safety"),
  };
  return P8_CHECKLIST.filter(([k]) => !has[k]).map(([, en]) => en);
}
/**
 * P5 (owner ruling W0-02): per-line matching tolerance — percent on quantity (invoiced vs received) and on price
 * (invoice rate vs order rate) plus an absolute cap on the variance amount. The values are Finance's; when neither
 * percent is set the variance is report only ("none": no block).
 */
export interface MatchTol { qtyPct: number | null; pricePct: number | null; cap: number | null }
export function matchTolerance(received: number, invoiced: number, poRate: number, invRate: number | null, tol: MatchTol): "none" | "within" | "beyond" {
  if (tol.qtyPct === null && tol.pricePct === null) return "none";
  const dq = Math.abs(invoiced - received), dp = invRate === null ? 0 : Math.abs(invRate - poRate);
  const qPct = received > 0 ? (dq / received) * 100 : dq > 1e-9 ? 100 : 0;
  const pPct = poRate > 0 ? (dp / poRate) * 100 : dp > 0.005 ? 100 : 0;
  const amount = dq * poRate + dp * invoiced;
  const beyond = (tol.qtyPct !== null && qPct > tol.qtyPct + 1e-9) || (tol.pricePct !== null && pPct > tol.pricePct + 1e-9) || (tol.cap !== null && amount > tol.cap + 0.005);
  return beyond ? "beyond" : "within";
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export function agingBucket(due: string, today: string): "Not due" | "1-30" | "31-60" | "61-90" | "90+" {
  const d = daysBetween(due, today);
  return d <= 0 ? "Not due" : d <= 30 ? "1-30" : d <= 60 ? "31-60" : d <= 90 ? "61-90" : "90+";
}
