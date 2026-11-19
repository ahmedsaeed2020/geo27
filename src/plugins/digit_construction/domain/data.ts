/**
 * Read side of DIGIT Construction: every figure is computed at render time from canonical adapter records the session
 * user may read (src/lib/scope.ts), so lists, Project 360, KPIs and reports reconcile to the same documents.
 * Measures stay separate (contract ≠ certified ≠ invoiced ≠ collected; budget ≠ commitment ≠ actual).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm } from "@/lib/session";
import { canSeeRecord, restrictedLabel } from "./access";
import { burnDays, contractValues, eac, lineEtc, margin, num, r2, sumBy, vac, type EtcMethod } from "./calc";

export const APP = "digit_construction";
/** Receivable/payable amount of an invoice — same rule as posting.ts `payable` (rounded_total unless disable_rounded_total); not imported to keep the manifest → reports → data graph free of posting.ts. */
const payable = (d: Doc) => r2(num(d["disable_rounded_total"]) || !d["rounded_total"] ? num(d["grand_total"]) : num(d["rounded_total"]));
export const today = () => new Date().toISOString().slice(0, 10);
export const rows = (d: Doc | undefined, f: string): Record<string, unknown>[] => (d && Array.isArray(d[f]) ? (d[f] as Record<string, unknown>[]) : []);
let system = 0;
/** Run with unscoped reads (demo installer / reconciliation tests): computations then never depend on the switched user. */
export function asSystem<T>(fn: () => T): T { system++; try { return fn(); } finally { system--; } }
/** True inside asSystem (demo install, read models over all records). */
export const inSystem = () => system > 0;
let asOfDay: string | null = null;
/** The record's own date (posting / transaction date, else creation); undated records always count. */
const recordDay = (d: Doc) => String(d["posting_date"] ?? d["transaction_date"] ?? d["creation"] ?? "").slice(0, 10);
/**
 * Read as the records stood on `on`: records dated after it are left out (trend points and deltas of workspace figures).
 * Later status changes are not replayed, so a trend point is "records that existed by that date", labelled as such.
 */
export function asOfRecords<T>(on: string, fn: () => T): T { const prev = asOfDay; asOfDay = on; try { return fn(); } finally { asOfDay = prev; } }
/** The as-of day of the current read (asOfRecords), else today. */
export const readDay = () => asOfDay ?? today();
/**
 * Gate G02: a sales invoice's outstanding on a past day = today's outstanding + what was settled after that day (payment
 * entry references, journal entry lines against the invoice, credit notes), so dated receivables never show today's balance;
 * on or after today it is the invoice's own outstanding_amount.
 */
export function outstandingAsOf(si: Doc, on: string): number {
  const now = num(si["outstanding_amount"]); if (!on || on >= today()) return now;
  const after = (d: Doc) => num(d.docstatus) === 1 && String(d["posting_date"] ?? "").slice(0, 10) > on;
  let later = 0;
  for (const pe of adapter.list("Payment Entry")) if (after(pe)) for (const r of rows(pe, "references")) if (r["reference_doctype"] === "Sales Invoice" && r["reference_name"] === si.name) later += num(r["allocated_amount"]);
  for (const je of adapter.list("Journal Entry")) if (after(je)) for (const a of rows(je, "accounts")) if (a["reference_type"] === "Sales Invoice" && a["reference_name"] === si.name) later += num(a["credit_in_account_currency"] ?? a["credit"]) - num(a["debit_in_account_currency"] ?? a["debit"]);
  for (const cn of adapter.list("Sales Invoice")) if (after(cn) && num(cn["is_return"]) === 1 && cn["return_against"] === si.name) later += Math.abs(num(cn["grand_total"]));
  return r2(now + later);
}
/** Saved records the user may read (local unsaved drafts excluded). */
export const list = (dt: string, pred?: (d: Doc) => boolean): Doc[] => { try { return (system ? adapter.list(dt) : scopedList(dt)).filter((d) => !d["__islocal"] && (!asOfDay || !(recordDay(d) > asOfDay)) && (!pred || pred(d))); } catch { return []; } };
export const get = (dt: string, name: unknown): Doc | undefined => (name ? adapter.get(dt, String(name)) : undefined);
export const state = (d: Doc) => String(d["workflow_state"] ?? d["status"] ?? "");
export const isSubmitted = (d: Doc) => num(d.docstatus) === 1;
export const byProject = (dt: string, project: string, field = "project") => list(dt, (d) => d[field] === project);

// ---------------------------------------------------------------- projects
export interface Ctx { company?: string | undefined; project?: string | undefined; from?: string | undefined; to?: string | undefined }
export function projects(ctx: Ctx = {}): Doc[] {
  return list("Project", (p) => (!ctx.company || p["company"] === ctx.company) && (!ctx.project || p.name === ctx.project));
}
/** Display title: Arabic project_name, or the English name custom field (digit_name_en) when `en`. */
export const projectTitle = (p: Doc | undefined, en = false) => String((en && p?.["digit_name_en"]) || p?.["project_name"] || p?.name || "");
/** Customer display name (English custom field digit_customer_name_en when `en`). */
export const customerName = (name: unknown, en = false) => {
  // a customer the session user may not read is never shown by name or code (domain/access.ts)
  if (name && !canSeeRecord("Customer", name)) return restrictedLabel(en);
  const c = name ? adapter.get("Customer", String(name)) : undefined; return String((en && c?.["digit_customer_name_en"]) || c?.["customer_name"] || name || "");
};
export const inPeriod = (date: unknown, ctx: Ctx) => { const d = String(date ?? ""); return (!ctx.from || d >= ctx.from) && (!ctx.to || d <= ctx.to); };
export function tasksOf(project: string) { return list("Task", (t) => t["project"] === project); }
export function overdueTasks(project: string, on = today()) { return tasksOf(project).filter((t) => t["exp_end_date"] && String(t["exp_end_date"]) < on && num(t["progress"]) < 100 && !["Completed", "Cancelled"].includes(String(t["status"]))); }
export function scheduleSlipDays(project: string, on = today()): number | null {
  const ts = tasksOf(project).filter((t) => t["exp_end_date"]); if (!ts.length) return null;
  const late = ts.filter((t) => String(t["exp_end_date"]) < on && num(t["progress"]) < 100).map((t) => (Date.parse(on) - Date.parse(String(t["exp_end_date"]))) / 86400000);
  return late.length ? Math.round(Math.max(...late)) : 0;
}

// ---------------------------------------------------------------- commercial (client)
export function contractsOf(project?: string) { return list("Digit Client Contract", (c) => !project || c["project"] === project); }
export function certificatesOf(contract: string) { return list("Digit Client Certificate", (c) => c["contract"] === contract && isSubmitted(c)).sort((a, b) => String(a["cert_date"]).localeCompare(String(b["cert_date"])) || a.name.localeCompare(b.name)); }
export function invoicesOfCert(cert: string) { return list("Sales Invoice", (s) => s["digit_client_certificate"] === cert && num(s.docstatus) !== 2); }
export interface ContractPosition {
  original: number; variations: number; revised: number; claimedPending: number; certifiedGross: number; advanceRecovered: number; advanceOutstanding: number;
  retentionHeld: number; retentionReleased: number; netCertified: number; invoicedNet: number; invoicedGross: number; collected: number; outstanding: number; certifiedNotInvoiced: number; draftInvoices: number;
}
export function contractPosition(c: Doc): ContractPosition {
  const v = contractValues(rows(c, "sov_lines"));
  const certs = certificatesOf(c.name);
  const sis = certs.flatMap((x) => invoicesOfCert(x.name));
  const posted = sis.filter(isSubmitted);
  const claims = list("Digit Client Claim", (x) => x["contract"] === c.name && x["workflow_state"] === "Submitted");
  const released = list("Digit Retention Release Request", (x) => x["contract"] === c.name && isSubmitted(x));
  const certifiedGross = sumBy(certs, (x) => num(x["gross_this"]));
  const advanceRecovered = sumBy(certs, (x) => num(x["advance_recovery"]));
  const retentionHeld = sumBy(certs, (x) => num(x["retention"]));
  const netCertified = sumBy(certs, (x) => num(x["net_certified"]));
  const invoicedNet = sumBy(posted, (x) => num(x["net_total"]));
  return {
    ...v, claimedPending: sumBy(claims, (x) => num(x["this_claim"])), certifiedGross, advanceRecovered, advanceOutstanding: r2(Math.max(0, num(c["advance_amount"]) - advanceRecovered)),
    retentionHeld, retentionReleased: sumBy(released, (x) => num(x["requested_amount"])), netCertified, invoicedNet, invoicedGross: sumBy(posted, (x) => payable(x)),
    collected: sumBy(posted, (x) => payable(x) - num(x["outstanding_amount"])), outstanding: sumBy(posted, (x) => num(x["outstanding_amount"])),
    certifiedNotInvoiced: r2(netCertified - invoicedNet), draftInvoices: sis.filter((x) => num(x.docstatus) === 0).length,
  };
}
export function projectCommercial(project: string) {
  const cs = contractsOf(project).filter((c) => c["workflow_state"] !== "Draft");
  const ps = cs.map(contractPosition);
  const k = <K extends keyof ContractPosition>(key: K) => sumBy(ps, (p) => p[key]);
  return { contracts: cs, revised: k("revised"), original: k("original"), variations: k("variations"), certifiedGross: k("certifiedGross"), netCertified: k("netCertified"), retentionHeld: k("retentionHeld"),
    retentionReleased: k("retentionReleased"), advanceOutstanding: k("advanceOutstanding"), invoicedNet: k("invoicedNet"), invoicedGross: k("invoicedGross"), collected: k("collected"), outstanding: k("outstanding"),
    certifiedNotInvoiced: k("certifiedNotInvoiced"), claimedPending: k("claimedPending") };
}

/** Claim stages as one partition for the stage bar: submitted claims awaiting a certificate → certified, not invoiced → invoiced, not collected → collected (all from projectCommercial). */
export function claimStages(project: string) {
  const c = projectCommercial(project);
  return { claimed: r2(Math.max(0, c.claimedPending)), certified: r2(Math.max(0, c.certifiedNotInvoiced)), invoiced: r2(Math.max(0, c.outstanding)), collected: r2(Math.max(0, c.collected)) };
}

// ---------------------------------------------------------------- cost control
export const UNALLOCATED = "UNALLOCATED";
export function approvedBudget(project: string): Doc | undefined {
  return list("Digit Project Cost Budget", (b) => b["project"] === project && isSubmitted(b) && b["workflow_state"] !== "Superseded").sort((a, b) => num(b["version"]) - num(a["version"]))[0];
}
/** `table` + `row` = the child table fieldname and idx of the exact source row (form deep link ?row=table:idx). */
export interface CostSource { doctype: string; name: string; amount: number; kind: "commitment" | "actual"; table: string; row: number; detail: string; allocation?: string | undefined; source_code?: string | undefined; category?: string | undefined; line?: string | undefined }
/** One raw cost source row as recorded on its document (cost code as entered, before any Digit Cost Allocation). */
export interface SourceRow { doctype: string; name: string; table: string; row: number; detail: string; kind: "commitment" | "actual"; amount: number; code: string; date: string; party: string; status: string; modified: string; po_detail: string; row_name: string; category: string }
interface Bucket { committed: number; actual: number; sources: CostSource[] }
/** Child table each cost source DocType sums (Purchase Order/Invoice items, work order lines, journal accounts). */
export const COST_SOURCE_TABLE: Record<string, string> = { "Purchase Order": "items", "Digit Subcontract Work Order": "lines", "Purchase Invoice": "items", "Journal Entry": "accounts" };
export const allocKey = (doctype: string, name: string, row: number) => `${doctype}|${name}|${row}`;
/** Submitted Digit Cost Allocations of a project by source row (one live allocation per row, enforced by its hook). */
export function activeAllocations(project: string): Map<string, Doc> {
  return new Map(list("Digit Cost Allocation", (a) => a["project"] === project && isSubmitted(a)).map((a) => [allocKey(String(a["source_doctype"]), String(a["source_name"]), num(a["source_row"])), a] as const));
}
/**
 * DEC-084 / DEC-122 / DEC-146 (owner ruling): a Purchase Invoice tax row is a cost when it is booked to an Expense
 * account or carries a valuation category (non-recoverable VAT); recoverable VAT stays apart. "Deduct" rows on an
 * Expense account (cost recoveries) count negative, while deductions to a payable (retention) never reduce cost.
 * The signed total is spread over the invoice rows by net amount (the last row takes the remainder).
 */
export function invoiceTaxCost(pi: Doc): number {
  return r2(sumBy(rows(pi, "taxes").filter((t) => ["Valuation", "Valuation and Total"].includes(String(t["category"] ?? "")) || String(adapter.get("Account", String(t["account_head"] ?? ""))?.["root_type"] ?? "") === "Expense"),
    (t) => (t["add_deduct_tax"] === "Deduct" ? -1 : 1) * Math.abs(num(t["base_tax_amount_after_discount_amount"] ?? t["tax_amount_after_discount_amount"] ?? t["tax_amount"]))));
}
export function invoiceTaxCostShares(pi: Doc): number[] {
  const its = rows(pi, "items"); const tc = invoiceTaxCost(pi); if (!tc || !its.length) return its.map(() => 0);
  const nets = its.map((it) => num(it["net_amount"] ?? it["amount"])); const tot = nets.reduce((a, b) => a + b, 0);
  let left = tc;
  return nets.map((v, i) => { const x = i === nets.length - 1 ? r2(left) : r2(tot ? (tc * v) / tot : 0); left = r2(left - x); return x; });
}
/** Open commitments (PO not yet billed, active subcontract work orders not yet billed) and posted actuals (submitted Purchase Invoices, Journal Entry expense lines), row by row, with the cost code entered on each row. */
export function costSourceRows(project: string, asOf?: string): SourceRow[] {
  const out: SourceRow[] = [];
  const okDate = (d: unknown) => !asOf || String(d ?? "") <= asOf;
  const add = (doctype: string, doc: Doc, kind: SourceRow["kind"], amount: number, row: unknown, detail: unknown, code: unknown, date: unknown, party: unknown, extra: { po_detail?: unknown; row_name?: unknown; category?: unknown } = {}) => {
    if (!amount) return;
    out.push({ doctype, name: doc.name, table: COST_SOURCE_TABLE[doctype] ?? "", row: num(row), detail: String(detail ?? ""), kind, amount: r2(amount), code: String(code ?? ""), date: String(date ?? ""), party: String(party ?? ""),
      status: String(doc["workflow_state"] ?? doc["status"] ?? ""), modified: String(doc["modified"] ?? doc["creation"] ?? ""), po_detail: String(extra.po_detail ?? ""), row_name: String(extra.row_name ?? ""), category: String(extra.category ?? "") });
  };
  for (const po of list("Purchase Order", (d) => isSubmitted(d) && !["Closed", "Cancelled"].includes(String(d["status"])) && okDate(d["transaction_date"])))
    rows(po, "items").forEach((it, i) => { if ((it["project"] ?? po["project"]) === project) add("Purchase Order", po, "commitment", Math.max(0, num(it["net_amount"] ?? it["amount"]) - num(it["billed_amt"])), it["idx"] ?? i + 1, it["item_code"], it["digit_cost_code"], po["transaction_date"], po["supplier"], { row_name: it["name"], category: it["digit_cost_category"] }); });
  // F05-12-1: an approved subcontract final account closes the work order, so its remaining commitment is zero
  const settled = new Set(list("Digit Subcontract Final Account", (f) => f["workflow_state"] === "Approved").map((f) => String(f["work_order"] ?? "")));
  for (const wo of list("Digit Subcontract Work Order", (d) => d["project"] === project && isSubmitted(d) && d["workflow_state"] !== "Cancelled" && okDate(d["wo_date"]) && !settled.has(d.name))) {
    const bills = list("Digit Subcontractor Bill", (b) => b["work_order"] === wo.name && isSubmitted(b) && okDate(b["bill_date"]));
    rows(wo, "lines").forEach((l, i) => {
      const billed = sumBy(bills.flatMap((b) => rows(b, "lines")).filter((x) => x["wo_line_key"] === l["line_key"]), (x) => num(x["amount"]));
      add("Digit Subcontract Work Order", wo, "commitment", Math.max(0, num(l["amount"]) - billed), l["idx"] ?? i + 1, l["description"] ?? l["line_key"], l["cost_code"], wo["wo_date"], wo["subcontractor"], { row_name: l["line_key"], category: l["cost_category"] });
    });
  }
  // DEC-084 / DEC-122 / DEC-146: an invoice row costs its net amount plus its share of the invoice's cost-type tax rows (non-recoverable VAT)
  for (const pi of list("Purchase Invoice", (d) => isSubmitted(d) && okDate(d["posting_date"]))) {
    const extra = invoiceTaxCostShares(pi);
    rows(pi, "items").forEach((it, i) => { if ((it["project"] ?? pi["project"]) === project) add("Purchase Invoice", pi, "actual", r2(num(it["net_amount"] ?? it["amount"]) + (extra[i] ?? 0)), it["idx"] ?? i + 1, it["item_code"], it["digit_cost_code"], pi["posting_date"], pi["supplier"], { po_detail: it["po_detail"], row_name: it["name"], category: it["digit_cost_category"] }); });
  }
  for (const je of list("Journal Entry", (d) => isSubmitted(d) && okDate(d["posting_date"])))
    rows(je, "accounts").forEach((a, i) => { if (a["project"] === project && String(adapter.get("Account", String(a["account"]))?.["root_type"] ?? "") === "Expense") add("Journal Entry", je, "actual", num(a["debit"] ?? a["debit_in_account_currency"]) - num(a["credit"] ?? a["credit_in_account_currency"]), a["idx"] ?? i + 1, a["account"], a["digit_cost_code"], je["posting_date"], a["party"], { row_name: a["name"], category: a["digit_cost_category"] }); });
  return out;
}
/**
 * Commitments and actuals by cost code. A submitted Digit Cost Allocation re-attributes its one source row to the
 * allocation's budget line cost code (the source document is never edited); every other row keeps its own code.
 */
export function costBuckets(project: string, asOf?: string): Map<string, Bucket> {
  const m = new Map<string, Bucket>();
  const alloc = activeAllocations(project);
  for (const s of costSourceRows(project, asOf)) {
    const a = alloc.get(allocKey(s.doctype, s.name, s.row));
    for (const part of allocationParts(a, s.code, s.amount)) {
      const k = String(part.code || UNALLOCATED);
      const b = m.get(k) ?? { committed: 0, actual: 0, sources: [] }; if (s.kind === "commitment") b.committed = r2(b.committed + part.amount); else b.actual = r2(b.actual + part.amount);
      b.sources.push({ doctype: s.doctype, name: s.name, amount: part.amount, kind: s.kind, table: s.table, row: s.row, detail: s.detail, ...(a ? { allocation: a.name, source_code: s.code } : {}), ...(s.category ? { category: s.category } : {}), ...(part.line ? { line: part.line } : {}) }); m.set(k, b);
    }
  }
  return m;
}
/**
 * F06-07-1 / DEC-083: an allocation re-attributes its source row to one budget line, or — with splits — to several by
 * their stored percent of the current source amount (the last split takes the rounding remainder, so the parts always
 * add up to the source row exactly).
 */
export function allocationParts(a: Doc | undefined, code: string, amount: number): { code: string; amount: number; line?: string }[] {
  if (!a) return [{ code, amount }];
  const sp = rows(a, "allocation_splits").filter((x) => String(x["cost_code"] ?? "") && num(x["percent"]) > 0);
  if (!sp.length) return [{ code: String(a["cost_code"] ?? ""), amount, ...(a["budget_line"] ? { line: String(a["budget_line"]) } : {}) }];
  let left = amount;
  return sp.map((x, i) => { const v = i === sp.length - 1 ? r2(left) : r2((amount * num(x["percent"])) / 100); left = r2(left - v); return { code: String(x["cost_code"]), amount: v }; });
}
/** Every source row behind the project's commitments and actuals (the rows costBuckets sums), with its bucket cost code. */
export function costSources(project: string, asOf?: string): (CostSource & { cost_code: string })[] {
  return [...costBuckets(project, asOf).entries()].flatMap(([cost_code, b]) => b.sources.map((x) => ({ ...x, cost_code })));
}
export interface CostLine { line_key: string; cost_code: string; description: string; category: string; original: number; revisions: number; transferIn: number; transferOut: number; revised: number; committed: number; actual: number; etc: number | null; eac: number | null; variance: number | null; sources?: CostSource[] }
/**
 * Owner ruling (budget lines by cost code × category): a source row belongs to the budget line its allocation names,
 * else to the line with its cost code and category; a row without a category belongs to its code's line only when
 * the code has exactly one line. Anything else stays visible as unallocated.
 */
export function sourceFitsLine(x: CostSource, line: { line_key: string; category: string }, linesOfCode: number): boolean {
  if (x.line) return x.line === line.line_key;
  return x.category ? x.category === line.category : linesOfCode === 1;
}
export function budgetMovements(budget: Doc) {
  const revs = list("Digit Budget Revision", (r) => r["budget"] === budget.name && isSubmitted(r));
  const trs = list("Digit Budget Transfer", (t) => t["budget"] === budget.name && isSubmitted(t));
  return { revs, trs };
}
export function costPosition(project: string, asOf?: string) {
  const budget = approvedBudget(project);
  const buckets = costBuckets(project, asOf);
  const fc = latestForecast(project);
  const lines: CostLine[] = [];
  const pj = get("Project", project); const projStart = pj?.["actual_start_date"] || pj?.["expected_start_date"] || "";
  if (budget) {
    const { revs, trs } = budgetMovements(budget);
    const perCode = new Map<string, number>(); for (const l of rows(budget, "lines")) perCode.set(String(l["cost_code"]), (perCode.get(String(l["cost_code"])) ?? 0) + 1);
    const taken = new Set<CostSource>();
    for (const l of rows(budget, "lines")) {
      const key = String(l["line_key"]), code = String(l["cost_code"]), category = String(l["category"] ?? "");
      const revisions = sumBy(revs.flatMap((r) => rows(r, "deltas")).filter((d) => d["line_key"] === key), (d) => num(d["delta_amount"]));
      const transferIn = sumBy(trs.filter((t) => t["to_line"] === key), (t) => num(t["amount"])), transferOut = sumBy(trs.filter((t) => t["from_line"] === key), (t) => num(t["amount"]));
      const original = num(l["original_amount"]); const revised = r2(original + revisions + transferIn - transferOut);
      const mine = (buckets.get(code)?.sources ?? []).filter((x) => !taken.has(x) && sourceFitsLine(x, { line_key: key, category }, perCode.get(code) ?? 0));
      for (const x of mine) taken.add(x);
      const committed = r2(sumBy(mine.filter((x) => x.kind === "commitment"), (x) => x.amount)), actual = r2(sumBy(mine.filter((x) => x.kind === "actual"), (x) => x.amount));
      const fl = rows(fc, "lines").find((x) => x["line_key"] === key);
      const etc = lineEtc((fl?.["method"] as EtcMethod) ?? "Budget Remaining", { revised, committed, actual, uncommitted: fl?.["uncommitted_remaining"], manual: fl?.["manual_etc"], qtyBudget: fl?.["qty_budget"], qtyInstalled: fl?.["qty_installed"], unitRate: fl?.["unit_rate"],
        pctComplete: fl?.["pct_complete"], burn: burnDays(projStart, fc?.["cutoff_date"] || asOf || today(), fl?.["planned_finish"]) });
      const e = eac(actual, etc);
      lines.push({ line_key: key, cost_code: code, description: String(l["description"] ?? ""), category, original, revisions, transferIn, transferOut, revised, committed, actual, etc, eac: e, variance: vac(revised, e), sources: mine });
    }
    // what no budget line took stays in its code's bucket (unallocated reconciliation)
    for (const [code, b] of [...buckets.entries()]) {
      const rest = b.sources.filter((x) => !taken.has(x));
      if (!rest.length) buckets.delete(code);
      else if (rest.length !== b.sources.length) buckets.set(code, { committed: r2(sumBy(rest.filter((x) => x.kind === "commitment"), (x) => x.amount)), actual: r2(sumBy(rest.filter((x) => x.kind === "actual"), (x) => x.amount)), sources: rest });
    }
  }
  // anything not matching an approved budget line stays visible as an unallocated reconciliation bucket
  const unallocated = [...buckets.entries()].map(([code, b]) => ({ code, ...b }));
  const tot = (k: "original" | "revised" | "committed" | "actual") => sumBy(lines, (l) => l[k]) + (k === "committed" || k === "actual" ? sumBy(unallocated, (u) => (k === "committed" ? u.committed : u.actual)) : 0);
  const etcKnown = lines.every((l) => l.etc !== null);
  const totalEtc = etcKnown ? r2(sumBy(lines, (l) => l.etc ?? 0) + sumBy(unallocated, (u) => u.committed)) : null;
  const totalActual = r2(tot("actual"));
  const totalEac = totalEtc === null ? null : r2(totalActual + totalEtc);
  const revenue = projectCommercial(project).revised || null;
  return { budget, lines, unallocated, original: r2(tot("original")), revised: r2(tot("revised")), committed: r2(tot("committed")), actual: totalActual, etc: totalEtc, eac: totalEac,
    variance: totalEac === null || !budget ? null : r2(tot("revised") - totalEac), revenue, ...margin(revenue, totalEac), forecast: fc };
}
export function latestForecast(project: string) {
  return list("Digit Cost Forecast Snapshot", (f) => f["project"] === project && isSubmitted(f) && f["workflow_state"] === "Approved").sort((a, b) => String(b["cutoff_date"]).localeCompare(String(a["cutoff_date"])))[0];
}

// ---------------------------------------------------------------- procurement
export function procurementOf(project: string, on = today()) {
  const mrs = list("Material Request", (m) => rows(m, "items").some((i) => i["project"] === project));
  const pos = list("Purchase Order", (p) => rows(p, "items").some((i) => i["project"] === project));
  const prs = list("Purchase Receipt", (p) => rows(p, "items").some((i) => i["project"] === project) || pos.some((po) => rows(p, "items").some((i) => i["purchase_order"] === po.name)));
  const rfqs = list("Request for Quotation", (r) => rows(r, "items").some((i) => mrs.some((m) => m.name === i["material_request"])));
  const sqs = list("Supplier Quotation", (s) => rows(s, "items").some((i) => rfqs.some((r) => r.name === i["request_for_quotation"])));
  const pis = list("Purchase Invoice", (p) => rows(p, "items").some((i) => i["project"] === project) || p["project"] === project);
  const ses = list("Stock Entry", (s) => s["project"] === project || rows(s, "items").some((i) => i["project"] === project));
  const openMr = mrs.filter((m) => isSubmitted(m) && num(m["per_ordered"]) < 100 && !["Stopped", "Cancelled"].includes(String(m["status"])));
  const overdueMr = openMr.filter((m) => String(m["schedule_date"] ?? "") < on);
  const openPo = pos.filter((p) => isSubmitted(p) && num(p["per_received"]) < 100 && !["Closed", "Cancelled"].includes(String(p["status"])));
  const latePo = openPo.filter((p) => String(p["schedule_date"] ?? "") < on);
  const openRfq = rfqs.filter((r) => isSubmitted(r) && !sqs.some((s) => rows(s, "items").some((i) => i["request_for_quotation"] === r.name)));
  return { mrs, pos, prs, rfqs, sqs, pis, ses, openMr, overdueMr, openPo, latePo, openRfq, committedPo: sumBy(openPo, (p) => num(p["net_total"]) * (1 - num(p["per_billed"]) / 100)) };
}

// ---------------------------------------------------------------- project materials (stock ledger, read only)
/** Movement class of one stock ledger row of a project voucher (display/report value; nothing is stored). */
export type MaterialMove = "Receipt" | "Return to Supplier" | "Issue to Work" | "Transfer In" | "Transfer Out" | "Other Receipt" | "Other Issue";
export interface MaterialMovement { posting_date: string; voucher_type: string; voucher_no: string; table: string; row: number; item_code: string; warehouse: string; move: MaterialMove; qty: number; value: number; sle: string }
const STOCK_VOUCHERS = ["Purchase Receipt", "Stock Entry"] as const;
/** Project of one voucher row: the row's own project, else its purchase order line's project, else the parent's project. */
function rowProject(d: Doc, r: Record<string, unknown>): string {
  if (r["project"]) return String(r["project"]);
  if (r["purchase_order"]) { const po = get("Purchase Order", r["purchase_order"]); const pr = rows(po, "items").find((x) => x["name"] === r["purchase_order_item"]); if (pr?.["project"] || po?.["project"]) return String(pr?.["project"] ?? po?.["project"]); }
  return String(d["project"] ?? "");
}
function moveOf(dt: string, d: Doc, qty: number): MaterialMove {
  if (dt === "Purchase Receipt") return num(d["is_return"]) ? "Return to Supplier" : qty >= 0 ? "Receipt" : "Return to Supplier";
  const purpose = String(d["purpose"] ?? d["stock_entry_type"] ?? "");
  if (purpose === "Material Issue") return "Issue to Work";
  if (purpose === "Material Transfer" || purpose === "Material Transfer for Manufacture") return qty >= 0 ? "Transfer In" : "Transfer Out";
  return qty >= 0 ? "Other Receipt" : "Other Issue";
}
/**
 * Every stock ledger row (non-cancelled, posted on or before `asOf`) of a submitted Purchase Receipt / Stock Entry whose
 * voucher row belongs to `project`. Quantities and values are the ledger's own (actual_qty, stock_value_difference, written by
 * posting.ts); each ledger row is paired in order with the voucher row of the same item, warehouse and direction, so the
 * movement names the exact source row. Purchase receipts are deliveries to site, not consumption: only Material Issue is
 * consumption. A purchase invoice moves no stock and never appears here.
 */
export function materialMovements(project: string, asOf?: string): MaterialMovement[] {
  const out: MaterialMovement[] = [];
  const sle = list("Stock Ledger Entry", (e) => !num(e["is_cancelled"]) && (!asOf || String(e["posting_date"] ?? "") <= asOf));
  for (const dt of STOCK_VOUCHERS) {
    for (const d of list(dt, isSubmitted)) {
      const mine = rows(d, "items").filter((r) => rowProject(d, r) === project);
      if (!mine.length) continue;
      const ledger = sle.filter((e) => e["voucher_type"] === dt && e["voucher_no"] === d.name);
      if (!ledger.length) continue;
      // candidate voucher rows per (item, warehouse, direction), in row order, over ALL rows (other projects' rows keep their ledger rows)
      const all = rows(d, "items").map((r, i) => ({ r, idx: num(r["idx"]) || i + 1 }));
      const slots = new Map<string, { r: Record<string, unknown>; idx: number }[]>();
      const key = (item: unknown, wh: unknown, sign: number) => `${String(item)}\u0000${String(wh)}\u0000${sign}`;
      for (const x of all) {
        const item = x.r["item_code"];
        if (dt === "Purchase Receipt") slots.set(key(item, x.r["warehouse"] || d["set_warehouse"], num(d["is_return"]) ? -1 : 1), [...(slots.get(key(item, x.r["warehouse"] || d["set_warehouse"], num(d["is_return"]) ? -1 : 1)) ?? []), x]);
        else {
          if (x.r["s_warehouse"]) slots.set(key(item, x.r["s_warehouse"], -1), [...(slots.get(key(item, x.r["s_warehouse"], -1)) ?? []), x]);
          if (x.r["t_warehouse"]) slots.set(key(item, x.r["t_warehouse"], 1), [...(slots.get(key(item, x.r["t_warehouse"], 1)) ?? []), x]);
        }
      }
      const used = new Map<string, number>();
      const ordered = [...ledger].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
      for (const e of ordered) {
        const q = num(e["actual_qty"]); const k = key(e["item_code"], e["warehouse"], q >= 0 ? 1 : -1);
        const n = used.get(k) ?? 0; used.set(k, n + 1);
        const src = slots.get(k)?.[n];
        if (!src || rowProject(d, src.r) !== project) continue;
        out.push({ posting_date: String(e["posting_date"] ?? d["posting_date"] ?? ""), voucher_type: dt, voucher_no: d.name, table: "items", row: src.idx, item_code: String(e["item_code"]), warehouse: String(e["warehouse"]),
          move: moveOf(dt, d, q), qty: q, value: r2(num(e["stock_value_difference"])), sle: e.name });
      }
    }
  }
  return out.sort((a, b) => a.posting_date.localeCompare(b.posting_date) || a.voucher_no.localeCompare(b.voucher_no) || a.row - b.row);
}
export interface MaterialBalance { item_code: string; item_name: string; uom: string; requested: number; ordered: number; pending_receipt: number; received: number; returned: number; issued: number; transfers: number; other: number; balance: number; issued_value: number }
/**
 * Per item for one project: requested (submitted Material Request rows), ordered and still to receive (submitted, open
 * Purchase Order rows), and the ledger movements of materialMovements(). balance = received − returned − issued + transfers + other
 * = Σ movement qty (project material at site not yet issued to work). issued_value = valuation of material issued to work.
 */
export function materialBalance(project: string, asOf?: string): MaterialBalance[] {
  const m = new Map<string, MaterialBalance>();
  const at = (code: string) => { let b = m.get(code); if (!b) { const it = get("Item", code); b = { item_code: code, item_name: String(it?.["item_name"] ?? code), uom: String(it?.["stock_uom"] ?? ""), requested: 0, ordered: 0, pending_receipt: 0, received: 0, returned: 0, issued: 0, transfers: 0, other: 0, balance: 0, issued_value: 0 }; m.set(code, b); } return b; };
  const dated = (d: Doc, f: string) => !asOf || String(d[f] ?? "") <= asOf;
  for (const mr of list("Material Request", (x) => isSubmitted(x) && dated(x, "transaction_date"))) for (const r of rows(mr, "items")) if (r["project"] === project && r["item_code"]) { const b = at(String(r["item_code"])); b.requested = r2(b.requested + num(r["stock_qty"] ?? r["qty"])); }
  for (const po of list("Purchase Order", (x) => isSubmitted(x) && dated(x, "transaction_date") && !["Closed", "Cancelled"].includes(String(x["status"])))) for (const r of rows(po, "items")) {
    if ((r["project"] ?? po["project"]) !== project || !r["item_code"]) continue;
    const b = at(String(r["item_code"])); const q = num(r["stock_qty"] ?? r["qty"]);
    b.ordered = r2(b.ordered + q); b.pending_receipt = r2(b.pending_receipt + Math.max(0, q - num(r["received_qty"])));
  }
  for (const x of materialMovements(project, asOf)) {
    const b = at(x.item_code);
    if (x.move === "Receipt") b.received = r2(b.received + x.qty);
    else if (x.move === "Return to Supplier") b.returned = r2(b.returned - x.qty);
    else if (x.move === "Issue to Work") { b.issued = r2(b.issued - x.qty); b.issued_value = r2(b.issued_value - x.value); }
    else if (x.move === "Transfer In" || x.move === "Transfer Out") b.transfers = r2(b.transfers + x.qty);
    else b.other = r2(b.other + x.qty);
    b.balance = r2(b.balance + x.qty);
  }
  return [...m.values()].sort((a, b) => a.item_code.localeCompare(b.item_code));
}


// ---------------------------------------------------------------- resources
export function resourcesOf(project: string) {
  const crews = byProject("Digit Crew", project), att = byProject("Digit Field Attendance", project), usage = byProject("Digit Machinery Usage", project);
  const funds = byProject("Digit Petty Cash Fund", project), exps = byProject("Digit Site Expense", project);
  const machines = list("Digit Machinery", (m) => m["current_project"] === project);
  const submittedAtt = att.filter(isSubmitted);
  return { crews, att, usage, funds, exps, machines,
    manDays: sumBy(submittedAtt.flatMap((a) => rows(a, "employees")), (e) => (e["attendance"] === "Present" ? 1 : e["attendance"] === "Half Day" ? 0.5 : 0)),
    overtime: sumBy(submittedAtt.flatMap((a) => rows(a, "employees")), (e) => num(e["overtime_hours"])),
    machineHours: sumBy(usage.filter(isSubmitted), (u) => num(u["hours"])), machineEstimate: sumBy(usage.filter(isSubmitted), (u) => num(u["total"])),
    approvedSpend: sumBy(exps.filter((e) => e["workflow_state"] === "Approved"), (e) => num(e["amount"])), pendingSpend: sumBy(exps.filter((e) => e["workflow_state"] === "Submitted"), (e) => num(e["amount"])) };
}

// ---------------------------------------------------------------- finance
export function payablesOf(project: string) {
  const pis = list("Purchase Invoice", (p) => isSubmitted(p) && (p["project"] === project || rows(p, "items").some((i) => i["project"] === project)));
  return { invoiced: sumBy(pis, (p) => payable(p)), paid: sumBy(pis, (p) => payable(p) - num(p["outstanding_amount"])), outstanding: sumBy(pis, (p) => num(p["outstanding_amount"])), pis };
}
export function financialPosition(project: string) {
  const com = projectCommercial(project), cost = costPosition(project), pay = payablesOf(project);
  return { ...com, cost, payables: pay, cashNet: r2(com.collected - pay.paid) };
}
export function closeoutOf(project: string) {
  const ca = list("Digit Closeout Assessment", (c) => c["project"] === project).sort((a, b) => String(b["assessment_date"]).localeCompare(String(a["assessment_date"])))[0];
  const fa = list("Digit Final Account", (f) => f["project"] === project);
  const rr = list("Digit Retention Release Request", (r) => r["project"] === project);
  return { assessment: ca, finalAccounts: fa, releases: rr };
}

// ---------------------------------------------------------------- policies
export function policy(key: string): Doc | undefined { return adapter.get("Digit Policy Decision", key); }
export const policyDefined = (key: string) => policy(key)?.["status"] === "Defined";
/** P2 value: the retention receivable account Finance names (must be an existing Account); "" = not named, the release stays a draft. */
export const retentionAccount = (): string => { const v = String(policy("P2")?.["value"] ?? "").trim(); return v && adapter.get("Account", v) ? v : ""; };
export const POLICY_TITLES: Record<string, [string, string]> = {
  P1: ["Final account approver", "معتمد الحساب الختامي"], P2: ["Retention release approver and accounting treatment", "معتمد الإفراج عن المحتجزات ومعالجتها المحاسبية"],
  P3: ["Supplier payment accounts and methods", "حسابات وطرق الدفع للموردين"], P4: ["Approver for closeout items marked Not Applicable", "معتمد بنود الإغلاق غير المنطبقة"],
  P5: ["Matching tolerance and default subcontract deductions", "حد التفاوت في المطابقة والخصومات الافتراضية لمقاولي الباطن"], P6: ["Expired-rate block or override", "حظر أو تجاوز الأسعار المنتهية"],
  P7: ["Cost Center / accounting-dimension mapping", "ربط مراكز التكلفة والأبعاد المحاسبية"], P8: ["Subcontractor profile approval", "اعتماد ملفات مقاولي الباطن"], P9: ["VAT basis on certificates", "أساس ضريبة القيمة المضافة على الشهادات"],
  P10: ["Revenue recognition / WIP basis", "أساس الاعتراف بالإيراد والأعمال تحت التنفيذ"],
};
export const POLICY_AFFECTS: Record<string, [string, string]> = {
  P1: ["Approve Final Account", "اعتماد الحساب الختامي"], P2: ["Approve retention release", "اعتماد الإفراج عن المحتجزات"], P3: ["Pay subcontractor from Construction", "سداد مقاول الباطن من تطبيق المقاولات"],
  P4: ["Approve Not Applicable closeout items", "اعتماد بنود الإغلاق غير المنطبقة"], P5: ["Accept invoice-matching variance", "قبول فروقات المطابقة"], P6: ["Approve an estimate that uses expired rates", "اعتماد تقدير يستخدم أسعاراً منتهية"],
  P7: ["Post site expense as Journal Entry", "ترحيل مصروف الموقع كقيد يومية"], P8: ["Approve subcontractor profile", "اعتماد ملف مقاول الباطن"], P9: ["Create Sales Invoice from certificate", "إنشاء فاتورة مبيعات من الشهادة"],
  P10: ["Post Digit WIP Adjustment", "ترحيل تسوية الأعمال تحت التنفيذ"],
};

/** Title of a linked record from its DocType's title_field (e.g. supplier_name) for report Link columns; "" when the
 *  DocType has no title field, the title equals the ID, the meta is not loaded yet or the session user may not read it. */
export function linkTitle(doctype: string, name: unknown): string {
  const n = String(name ?? ""); const meta = n ? cachedMeta(doctype) : undefined; const tf = meta?.title_field;
  const d = tf ? adapter.get(doctype, n) : undefined;
  const v = d && meta && hasPerm(meta, "read", d) ? d[tf!] : undefined;
  return typeof v === "string" && v.trim() && v !== n ? v : "";
}
