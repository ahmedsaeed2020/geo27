/**
 * BUD-EXT-02 / BUD-EXT-03 Cost Source Verifier: every row behind a project's commitments and actuals (the rows
 * costBuckets sums), the related events that are deliberately NOT cost (receipts, material issues, payments), and the
 * exceptions that make a cost figure doubtful. Read model only; corrections happen at the source document, through a
 * Digit Cost Allocation (re-attributes one unmapped row to a budget line, source untouched) or are recorded as a
 * Digit Cost Exception Review. No GL / Stock Ledger row is written here. Pure read model (no posting.ts import), so the
 * manifest → reports → read-model graph stays free of the posting engine; writes live in domain/costActions.ts.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { num, r2, sumBy } from "./calc";
import { allocationSplits } from "./costControl";
import { activeAllocations, allocKey, approvedBudget, costPosition, costSourceRows, isSubmitted, list, rows, today, type SourceRow } from "./data";

export type ExceptionCode = "UNMAPPED" | "CODE_NOT_IN_BUDGET" | "DOUBLE_COUNT_RISK" | "BILLED_MISMATCH" | "BILL_NOT_INVOICED" | "EXPENSE_NOT_POSTED" | "ALLOCATION_STALE" | "ALLOCATION_ORPHAN";
/** Stored value of Digit Cost Exception Review.exception for each code. */
export const EXCEPTION_LABEL: Record<ExceptionCode, string> = {
  UNMAPPED: "Unmapped Cost Code", CODE_NOT_IN_BUDGET: "Cost Code Not in Budget", DOUBLE_COUNT_RISK: "Possible Double Count", BILLED_MISMATCH: "Billed Amount Mismatch",
  BILL_NOT_INVOICED: "Bill Not Invoiced", EXPENSE_NOT_POSTED: "Expense Not Posted", ALLOCATION_STALE: "Allocation Source Changed", ALLOCATION_ORPHAN: "Allocation Source Missing",
};
export const EXCEPTION_SEVERITY: Record<ExceptionCode, "High" | "Medium" | "Low"> = {
  UNMAPPED: "High", CODE_NOT_IN_BUDGET: "High", DOUBLE_COUNT_RISK: "High", BILLED_MISMATCH: "High", BILL_NOT_INVOICED: "Medium", EXPENSE_NOT_POSTED: "Medium", ALLOCATION_STALE: "Medium", ALLOCATION_ORPHAN: "Low",
};
export type Eligibility = "Eligible" | "Pending mapping" | "Excluded";
export interface VerifyRow {
  key: string; source_doctype: string; source_name: string; table: string; row: number; detail: string; party: string; date: string; status: string;
  measure: "Commitment" | "Actual" | "Not a cost event"; commitment: number; actual: number; amount: number;
  source_code: string; cost_code: string; budget_line: string; eligibility: Eligibility; exceptions: ExceptionCode[]; allocation: string; note: string;
}
export interface ExceptionItem {
  key: string; code: ExceptionCode; label: string; severity: "High" | "Medium" | "Low"; source_doctype: string; source_name: string; table: string; row: number; amount: number;
  detail: string; watermark: string; status: "Open" | "Reviewed" | "Correction requested"; review: string; reviewed_by: string; allocatable: boolean;
}
export interface CostVerification {
  project: string; as_of: string; budget: Doc | undefined; rows: VerifyRow[]; exceptions: ExceptionItem[];
  kpis: { atd: number; open_commitment: number; unmapped: number; pending_actual: number; open_exceptions: number; excluded: number };
}

const exKey = (code: ExceptionCode, dt: string, name: string, row = 0) => `${code}|${dt}|${name}|${row}`;
const stampOf = (d: Doc | undefined) => String(d?.["modified"] ?? d?.["creation"] ?? "");
/** Latest submitted review of each exception; a review taken on another version of the source no longer applies. */
function reviewsOf(project: string): Map<string, Doc> {
  const m = new Map<string, Doc>();
  const code = Object.fromEntries(Object.entries(EXCEPTION_LABEL).map(([k, v]) => [v, k])) as Record<string, ExceptionCode>;
  for (const r of list("Digit Cost Exception Review", (x) => x["project"] === project && isSubmitted(x)).sort((a, b) => stampOf(a).localeCompare(stampOf(b)))) {
    const c = code[String(r["exception"])]; if (c) m.set(exKey(c, String(r["source_doctype"]), String(r["source_name"]), num(r["source_row"])), r);
  }
  return m;
}

/** The verification of one project (explicitly chosen; as-of optional: empty = every date). */
export function costVerification(project: string, asOf?: string): CostVerification {
  const budget = approvedBudget(project);
  const codes = new Set(rows(budget, "lines").map((l) => String(l["cost_code"])));
  const lineOf = (code: string) => String(rows(budget, "lines").find((l) => String(l["cost_code"]) === code)?.["line_key"] ?? "");
  const alloc = activeAllocations(project);
  const src = costSourceRows(project, asOf);
  const reviews = reviewsOf(project);
  const exceptions: ExceptionItem[] = [];
  const raise = (code: ExceptionCode, dt: string, name: string, table: string, row: number, amount: number, detail: string, watermark: string) => {
    const key = exKey(code, dt, name, row); const rv = reviews.get(key);
    const valid = rv && String(rv["source_watermark"] ?? "") === watermark;
    exceptions.push({ key, code, label: EXCEPTION_LABEL[code], severity: EXCEPTION_SEVERITY[code], source_doctype: dt, source_name: name, table, row, amount: r2(amount), detail, watermark,
      status: valid ? (rv["resolution"] === "Accepted as Is" ? "Reviewed" : "Correction requested") : "Open", review: valid ? rv.name : "", reviewed_by: valid ? String(rv["reviewed_by"] ?? "") : "",
      allocatable: code === "UNMAPPED" || code === "CODE_NOT_IN_BUDGET" });
  };

  // open PO commitment per item (double-count check for invoice rows that do not reference a PO line)
  const openPoByItem = new Map<string, number>();
  for (const s of src) if (s.doctype === "Purchase Order") openPoByItem.set(s.detail, r2((openPoByItem.get(s.detail) ?? 0) + s.amount));

  const out: VerifyRow[] = src.map((s: SourceRow) => {
    const a = alloc.get(allocKey(s.doctype, s.name, s.row));
    const code = a ? String(a["cost_code"] ?? "") : s.code;
    const ex: ExceptionCode[] = [];
    if (!a && !s.code) ex.push("UNMAPPED");
    else if (!a && budget && !codes.has(s.code)) ex.push("CODE_NOT_IN_BUDGET");
    if (a && String(a["source_watermark"] ?? "") !== s.modified) ex.push("ALLOCATION_STALE");
    if (s.doctype === "Purchase Invoice" && !s.po_detail && (openPoByItem.get(s.detail) ?? 0) > 0) ex.push("DOUBLE_COUNT_RISK");
    for (const c of ex) raise(c, s.doctype, s.name, s.table, s.row, c === "DOUBLE_COUNT_RISK" ? Math.min(s.amount, openPoByItem.get(s.detail) ?? 0) : s.amount, s.detail, s.modified);
    const pending = ex.includes("UNMAPPED") || ex.includes("CODE_NOT_IN_BUDGET");
    return { key: allocKey(s.doctype, s.name, s.row), source_doctype: s.doctype, source_name: s.name, table: s.table, row: s.row, detail: s.detail, party: s.party, date: s.date, status: s.status,
      measure: s.kind === "commitment" ? "Commitment" : "Actual", commitment: s.kind === "commitment" ? s.amount : 0, actual: s.kind === "actual" ? s.amount : 0, amount: s.amount,
      source_code: s.code, cost_code: code, budget_line: codes.has(code) ? lineOf(code) : "", eligibility: pending ? "Pending mapping" : "Eligible", exceptions: ex, allocation: a?.name ?? "", note: "" };
  });

  const okDate = (d: unknown) => !asOf || String(d ?? "") <= asOf;
  // PO lines whose billed amount disagrees with the invoices that reference them (commitment relief would be wrong)
  for (const po of list("Purchase Order", (d) => isSubmitted(d) && okDate(d["transaction_date"])))
    rows(po, "items").forEach((it, i) => {
      if ((it["project"] ?? po["project"]) !== project || !it["name"]) return;
      const invoiced = sumBy(list("Purchase Invoice", (p) => isSubmitted(p) && okDate(p["posting_date"])).flatMap((p) => rows(p, "items")).filter((x) => x["po_detail"] === it["name"]), (x) => num(x["net_amount"] ?? x["amount"]));
      const diff = r2(num(it["billed_amt"]) - invoiced);
      if (Math.abs(diff) > 0.01 && (invoiced > 0 || num(it["billed_amt"]) > 0)) raise("BILLED_MISMATCH", "Purchase Order", po.name, "items", num(it["idx"] ?? i + 1), Math.abs(diff), String(it["item_code"] ?? ""), stampOf(po));
    });
  // approved subcontractor bills: relieved from the work-order commitment but not yet an actual cost
  for (const b of list("Digit Subcontractor Bill", (x) => x["project"] === project && isSubmitted(x) && okDate(x["bill_date"]))) {
    const pi = b["purchase_invoice"] ? adapter.get("Purchase Invoice", String(b["purchase_invoice"])) : undefined;
    if (!pi || !isSubmitted(pi)) raise("BILL_NOT_INVOICED", "Digit Subcontractor Bill", b.name, "", 0, num(b["net_amount"] ?? b["gross_amount"]), String(b["work_order"] ?? ""), stampOf(b));
  }
  // approved site expenses waiting for their journal entry (policy P7)
  for (const e of list("Digit Site Expense", (x) => x["project"] === project && isSubmitted(x) && x["workflow_state"] === "Approved" && okDate(x["expense_date"]))) {
    const je = e["journal_entry"] ? adapter.get("Journal Entry", String(e["journal_entry"])) : undefined;
    if (!je || !isSubmitted(je)) raise("EXPENSE_NOT_POSTED", "Digit Site Expense", e.name, "", 0, num(e["amount"]), String(e["category"] ?? ""), stampOf(e));
  }
  // allocations whose source row is no longer an open cost source (cancelled, closed, fully billed or moved)
  const live = new Set(src.map((s) => allocKey(s.doctype, s.name, s.row)));
  for (const [k, a] of alloc) if (!live.has(k)) raise("ALLOCATION_ORPHAN", "Digit Cost Allocation", a.name, "", 0, num(a["amount"]), `${String(a["source_doctype"])} ${String(a["source_name"])} #${num(a["source_row"])}`, stampOf(a));

  // events on the project that are never cost on a purchase basis — listed so the user sees why they are excluded
  const excluded = (dt: string, d: Doc, table: string, row: number, detail: unknown, amount: number, date: unknown, party: unknown, note: string): VerifyRow =>
    ({ key: `${dt}|${d.name}|${row}`, source_doctype: dt, source_name: d.name, table, row, detail: String(detail ?? ""), party: String(party ?? ""), date: String(date ?? ""), status: String(d["status"] ?? ""),
      measure: "Not a cost event", commitment: 0, actual: 0, amount: r2(amount), source_code: "", cost_code: "", budget_line: "", eligibility: "Excluded", exceptions: [], allocation: "", note });
  for (const pr of list("Purchase Receipt", (d) => isSubmitted(d) && okDate(d["posting_date"])))
    rows(pr, "items").forEach((it, i) => { if ((it["project"] ?? pr["project"]) === project) out.push(excluded("Purchase Receipt", pr, "items", num(it["idx"] ?? i + 1), it["item_code"], num(it["base_net_amount"] ?? it["net_amount"] ?? it["amount"]) * (pr["is_return"] ? -1 : 1), pr["posting_date"], pr["supplier"], pr["is_return"] ? "Purchase return — not a cost event" : "Receipt — cost is the purchase invoice")); });
  for (const se of list("Stock Entry", (d) => isSubmitted(d) && okDate(d["posting_date"])))
    rows(se, "items").forEach((it, i) => { if ((it["project"] ?? se["project"]) === project) out.push(excluded("Stock Entry", se, "items", num(it["idx"] ?? i + 1), it["item_code"], num(it["amount"] ?? it["basic_amount"]), se["posting_date"], "", "Material movement — not a cost event")); });
  for (const pe of list("Payment Entry", (d) => isSubmitted(d) && d["project"] === project && okDate(d["posting_date"])))
    out.push(excluded("Payment Entry", pe, "", 0, pe["payment_type"], num(pe["paid_amount"]), pe["posting_date"], pe["party"], "Payment — settles an invoice, never a cost"));

  const cp = costPosition(project, asOf);
  const pendingActual = sumBy(exceptions.filter((e) => e.code === "BILL_NOT_INVOICED" || e.code === "EXPENSE_NOT_POSTED"), (e) => e.amount);
  return {
    project, as_of: asOf ?? "", budget, rows: out, exceptions: exceptions.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || b.amount - a.amount || a.key.localeCompare(b.key)),
    kpis: { atd: cp.actual, open_commitment: cp.committed, unmapped: r2(sumBy(out.filter((r) => r.eligibility === "Pending mapping"), (r) => r.amount)), pending_actual: r2(pendingActual),
      open_exceptions: exceptions.filter((e) => e.status !== "Reviewed").length, excluded: out.filter((r) => r.eligibility === "Excluded").length },
  };
}
const sevRank = (s: string) => (s === "High" ? 0 : s === "Medium" ? 1 : 2);

/** Budget lines a row may be allocated to (the project's approved budget). */
export const allocationTargets = (project: string) => rows(approvedBudget(project), "lines").map((l) => ({ line_key: String(l["line_key"]), cost_code: String(l["cost_code"]), description: String(l["description"] ?? "") }));

export interface AllocCheck { doc: Doc; errors: string[] }
/** Validation + derivation of a Digit Cost Allocation (called by its controller hook on every save / submit). */
export function checkAllocation(input: Doc): AllocCheck {
  const e: string[] = [];
  const project = String(input["project"] ?? ""); if (!project) return { doc: input, errors: ["Select a project"] };
  const budget = approvedBudget(project);
  if (!budget) return { doc: input, errors: [`Project ${project} has no approved budget to allocate to`] };
  // F06-07-1: with splits the parent line defaults to the first split's line
  const split0 = rows(input, "allocation_splits")[0];
  const doc: Doc = !input["budget_line"] && split0?.["budget_line"] ? { ...input, budget_line: split0["budget_line"] } : input;
  const splitting = rows(doc, "allocation_splits").length > 0;
  const line = rows(budget, "lines").find((l) => l["line_key"] === doc["budget_line"] || l["cost_code"] === doc["budget_line"]);
  if (!line) e.push(`${String(doc["budget_line"] ?? "")} is not a line of the approved budget ${budget.name}`);
  const dt = String(doc["source_doctype"] ?? ""), name = String(doc["source_name"] ?? ""), row = num(doc["source_row"]);
  const s = costSourceRows(project).find((x) => x.doctype === dt && x.name === name && x.row === row);
  if (!s) e.push(`Row ${row} of ${dt} ${name} is not an open cost source of project ${project} (other project, cancelled, fully billed or not a cost line)`);
  const codes = new Set(rows(budget, "lines").map((l) => String(l["cost_code"])));
  if (s && s.code && codes.has(s.code) && !splitting) e.push(`Row ${row} of ${name} already maps to budget cost code ${s.code}; correct the source document instead of allocating`);
  const dup = list("Digit Cost Allocation", (a) => a.name !== doc.name && isSubmitted(a) && a["source_doctype"] === dt && a["source_name"] === name && num(a["source_row"]) === row)[0];
  if (dup) e.push(`Row ${row} of ${name} is already allocated by ${dup.name}; cancel it first`);
  if (!String(doc["reason"] ?? "").trim()) e.push("Reason is required");
  const d: Doc = { ...doc, budget: budget.name, company: doc["company"] || adapter.get("Project", project)?.["company"] || "", currency: doc["currency"] || "SAR",
    ...(line ? { budget_line: line["line_key"], cost_code: line["cost_code"] } : {}),
    ...(s ? { source_detail: s.detail, source_code: s.code, amount: s.amount, relationship_type: s.kind === "commitment" ? "Commitment" : "Actual", source_watermark: s.modified } : {}),
    ...(num(doc.docstatus) === 1 ? { allocated_by: currentUser() } : {}) };
  if (splitting) { const sp = allocationSplits(d, budget, s?.amount ?? num(d["amount"])); e.push(...sp.errors); return { doc: { ...d, allocation_splits: sp.splits, split_remainder: sp.remainder }, errors: e }; }
  return { doc: d, errors: e };
}

/** Validation + derivation of a Digit Cost Exception Review: the exception must exist now; the review captures its source version. */
export function checkReview(doc: Doc): AllocCheck {
  const project = String(doc["project"] ?? ""); if (!project) return { doc, errors: ["Select a project"] };
  const code = (Object.entries(EXCEPTION_LABEL).find(([, v]) => v === doc["exception"])?.[0] ?? "") as ExceptionCode;
  const ex = costVerification(project).exceptions.find((x) => x.code === code && x.source_doctype === doc["source_doctype"] && x.source_name === doc["source_name"] && x.row === num(doc["source_row"]));
  const e: string[] = [];
  if (!ex) e.push(`There is no open "${String(doc["exception"] ?? "")}" exception for ${String(doc["source_doctype"] ?? "")} ${String(doc["source_name"] ?? "")} in project ${project}`);
  if (!String(doc["note"] ?? "").trim()) e.push("Note is required");
  return { doc: { ...doc, company: doc["company"] || adapter.get("Project", project)?.["company"] || "", currency: doc["currency"] || "SAR", ...(ex ? { amount: ex.amount, source_watermark: ex.watermark } : {}),
    ...(num(doc.docstatus) === 1 ? { reviewed_by: currentUser(), reviewed_on: today() } : {}) }, errors: e };
}
