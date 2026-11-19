/**
 * CSH-01 Project cash flow — a weekly read model over native documents only (no forecast record is written here).
 *  - actual: submitted Payment Entries, each reference attributed to its invoice's project (unreferenced payments
 *    attributed by the payment's own project and shown as advances);
 *  - expected receipts: open Sales Invoice outstanding by due date; confirmed client certificates not yet invoiced
 *    (net before VAT, dated certificate date + contract payment days when the contract defines them, otherwise undated);
 *  - expected payments: open Purchase Invoice outstanding by due date; approved subcontract bills not yet invoiced
 *    (undated: no supplier payment terms on the work order); open purchase-order lines (net − billed) at the line's
 *    delivery date, labelled as an estimate;
 *  - plan scenario only: Digit Cashflow Forecast Item rows (monthly), placed in the week holding the 1st of their month.
 * Opening = net actual cash of the project before `from`. Projected closing per week = opening + that week and earlier
 * weeks' actual and expected lines; overdue, later and undated lines are listed but never enter the closing.
 * Amounts are company currency (the demo company uses SAR only).
 */
import { num, r2, sumBy } from "./calc";
import { costSourceRows, get, isSubmitted, list, rows, type SourceRow } from "./data";
import type { Doc } from "@/lib/adapter";

export type CashLane = "receipt_actual" | "payment_actual" | "receivable_due" | "certified_not_invoiced" | "plan_in" | "payable_due" | "subcontract_approved" | "open_order" | "plan_out";
export const IN_LANES: CashLane[] = ["receipt_actual", "receivable_due", "certified_not_invoiced", "plan_in"];
export const OUT_LANES: CashLane[] = ["payment_actual", "payable_due", "subcontract_approved", "open_order", "plan_out"];
export const ACTUAL_LANES = new Set<CashLane>(["receipt_actual", "payment_actual"]);
export type Confidence = "Actual" | "Due date" | "Estimated" | "Unknown date" | "Planned";
export type Scenario = "documents" | "plan";
export interface CashLine {
  key: string; lane: CashLane; direction: 1 | -1; date: string; amount: number; doctype: string; name: string; table: string; row: number;
  party: string; confidence: Confidence; assumption: string;
}
/** Column of a line: "overdue" (expected, dated before from), week index, "later" (after the horizon), "undated", "before" (actual before from = opening). */
export type Slot = number | "overdue" | "later" | "undated" | "before";
export interface Period { start: string; end: string }
export type CashException = { code: "RECEIVABLE_OVERDUE" | "PAYABLE_OVERDUE" | "UNDATED" | "PLAN_PAST"; line: CashLine };
export interface CashFlow {
  project: string; from: string; weeks: number; scenario: Scenario; periods: Period[]; lines: (CashLine & { slot: Slot })[];
  opening: number; closing: number[]; net: number[];
  cards: { opening: number; expected_in: number; expected_out: number; actual_net: number; closing: number; overdue_in: number; overdue_out: number; undated_in: number; undated_out: number };
  exceptions: CashException[];
}

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(Date.parse(d) + n * DAY);
/** Monday of the ISO week holding `d`. */
export function weekStart(d: string): string { const t = Date.parse(d); const wd = (new Date(t).getUTCDay() + 6) % 7; return iso(t - wd * DAY); }
export function periodsOf(from: string, weeks: number): Period[] { const s = weekStart(from); return Array.from({ length: weeks }, (_, i) => ({ start: addDays(s, i * 7), end: addDays(s, i * 7 + 6) })); }
const invProject = (d: Doc | undefined, project: string) => !!d && (d["project"] === project || rows(d, "items").some((i) => i["project"] === project));
const invProjectOf = (d: Doc | undefined) => String(d?.["project"] ?? rows(d, "items").find((i) => i["project"])?.["project"] ?? "");
const grand = (d: Doc) => num(d["rounded_total"] || d["grand_total"]);

/** Every cash line of the project (both scenarios; plan lines flagged by lane). */
export function cashLines(project: string): CashLine[] {
  const out: CashLine[] = [];
  // actual: payment allocations attributed through the invoice they settle
  for (const pe of list("Payment Entry", isSubmitted)) {
    const kind = String(pe["payment_type"] ?? "");
    if (kind !== "Receive" && kind !== "Pay") continue; // internal transfers move no project cash
    const dir: 1 | -1 = kind === "Receive" ? 1 : -1;
    const lane: CashLane = dir === 1 ? "receipt_actual" : "payment_actual";
    const refs = rows(pe, "references");
    refs.forEach((r, i) => {
      const inv = get(String(r["reference_doctype"] ?? ""), r["reference_name"]);
      const p = inv ? invProjectOf(inv) : String(pe["project"] ?? "");
      if (p !== project) return;
      out.push({ key: `PE|${pe.name}|${i + 1}`, lane, direction: dir, date: String(pe["posting_date"] ?? ""), amount: r2(num(r["allocated_amount"])), doctype: "Payment Entry", name: pe.name, table: "references", row: num(r["idx"]) || i + 1, party: String(pe["party"] ?? ""), confidence: "Actual", assumption: `${String(r["reference_doctype"] ?? "")} ${String(r["reference_name"] ?? "")}` });
    });
    const unalloc = refs.length ? num(pe["unallocated_amount"]) : num(pe["unallocated_amount"]) || num(dir === 1 ? pe["received_amount"] ?? pe["paid_amount"] : pe["paid_amount"]);
    if (unalloc > 0.005 && pe["project"] === project) out.push({ key: `PE|${pe.name}|0`, lane, direction: dir, date: String(pe["posting_date"] ?? ""), amount: r2(unalloc), doctype: "Payment Entry", name: pe.name, table: "", row: 0, party: String(pe["party"] ?? ""), confidence: "Actual", assumption: "unallocated (advance)" });
  }
  // expected receipts
  for (const si of list("Sales Invoice", (d) => isSubmitted(d) && num(d["outstanding_amount"]) > 0.005 && invProject(d, project)))
    out.push({ key: `SI|${si.name}`, lane: "receivable_due", direction: 1, date: String(si["due_date"] ?? si["posting_date"] ?? ""), amount: r2(num(si["outstanding_amount"])), doctype: "Sales Invoice", name: si.name, table: "", row: 0, party: String(si["customer"] ?? ""), confidence: si["due_date"] ? "Due date" : "Unknown date", assumption: "invoice outstanding" });
  for (const c of list("Digit Client Certificate", (d) => isSubmitted(d) && d["project"] === project && d["workflow_state"] !== "Cancelled")) {
    const si = c["sales_invoice"] ? get("Sales Invoice", c["sales_invoice"]) : undefined;
    if (si && num(si.docstatus) === 1) continue; // invoiced: the invoice line carries it
    const contract = get("Digit Client Contract", c["contract"]);
    const days = num(contract?.["payment_days"]);
    const date = days > 0 && c["cert_date"] ? addDays(String(c["cert_date"]), days) : "";
    out.push({ key: `CERT|${c.name}`, lane: "certified_not_invoiced", direction: 1, date, amount: r2(num(c["net_certified"])), doctype: "Digit Client Certificate", name: c.name, table: "", row: 0, party: String(c["customer"] ?? ""), confidence: date ? "Estimated" : "Unknown date", assumption: date ? `certificate date + ${days} payment days; before VAT` : "no payment days on the contract; before VAT" });
  }
  // expected payments
  for (const pi of list("Purchase Invoice", (d) => isSubmitted(d) && num(d["outstanding_amount"]) > 0.005 && invProject(d, project)))
    out.push({ key: `PI|${pi.name}`, lane: "payable_due", direction: -1, date: String(pi["due_date"] ?? pi["posting_date"] ?? ""), amount: r2(num(pi["outstanding_amount"])), doctype: "Purchase Invoice", name: pi.name, table: "", row: 0, party: String(pi["supplier"] ?? ""), confidence: pi["due_date"] ? "Due date" : "Unknown date", assumption: "invoice outstanding" });
  for (const b of list("Digit Subcontractor Bill", (d) => isSubmitted(d) && d["project"] === project && d["workflow_state"] === "Approved")) {
    const pi = b["purchase_invoice"] ? get("Purchase Invoice", b["purchase_invoice"]) : undefined;
    if (pi && num(pi.docstatus) === 1) continue;
    out.push({ key: `SCB|${b.name}`, lane: "subcontract_approved", direction: -1, date: "", amount: r2(num(b["net_amount"])), doctype: "Digit Subcontractor Bill", name: b.name, table: "", row: 0, party: String(b["subcontractor"] ?? ""), confidence: "Unknown date", assumption: "approved bill, no purchase invoice yet; no payment terms on the work order; before VAT" });
  }
  for (const s of costSourceRows(project).filter((x: SourceRow) => x.kind === "commitment" && x.doctype === "Purchase Order" && x.amount > 0.005)) {
    const po = get("Purchase Order", s.name);
    const r = rows(po, "items").find((x, i) => (num(x["idx"]) || i + 1) === s.row);
    const date = String(r?.["schedule_date"] ?? po?.["schedule_date"] ?? "");
    out.push({ key: `PO|${s.name}|${s.row}`, lane: "open_order", direction: -1, date, amount: r2(s.amount), doctype: "Purchase Order", name: s.name, table: "items", row: s.row, party: s.party, confidence: date ? "Estimated" : "Unknown date", assumption: "open order line (net − billed) at its delivery date; supplier terms not applied; before VAT" });
  }
  // plan items (plan scenario only)
  for (const f of list("Digit Cashflow Forecast Item", (d) => d["project"] === project && num(d["amount"]) > 0 && /^\d{4}-\d{2}$/.test(String(d["period"] ?? "")))) {
    const dir: 1 | -1 = f["direction"] === "Inflow" ? 1 : -1;
    out.push({ key: `CFI|${f.name}`, lane: dir === 1 ? "plan_in" : "plan_out", direction: dir, date: `${String(f["period"])}-01`, amount: r2(num(f["amount"])), doctype: "Digit Cashflow Forecast Item", name: f.name, table: "", row: 0, party: String(f["category"] ?? ""), confidence: "Planned", assumption: `${String(f["status"] ?? "Planned")} monthly plan item placed at the start of ${String(f["period"])}; may overlap document lines` });
  }
  return out;
}

export function cashFlow(project: string, from: string, weeks = 13, scenario: Scenario = "documents"): CashFlow {
  const periods = periodsOf(from, weeks);
  const start = periods[0]!.start, end = periods[periods.length - 1]!.end;
  const slotOf = (l: CashLine): Slot => {
    if (!l.date) return "undated";
    if (l.date < start) return ACTUAL_LANES.has(l.lane) ? "before" : "overdue";
    if (l.date > end) return "later";
    return Math.floor((Date.parse(l.date) - Date.parse(start)) / (7 * DAY));
  };
  const lines = cashLines(project).filter((l) => scenario === "plan" || (l.lane !== "plan_in" && l.lane !== "plan_out")).map((l) => ({ ...l, slot: slotOf(l) }))
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.key.localeCompare(b.key));
  const signed = (ls: CashLine[]) => r2(sumBy(ls, (l) => l.amount * l.direction));
  const opening = signed(lines.filter((l) => l.slot === "before"));
  const net = periods.map((_, i) => signed(lines.filter((l) => l.slot === i)));
  const closing: number[] = []; net.reduce((acc, n) => { const c = r2(acc + n); closing.push(c); return c; }, opening);
  const inHorizon = lines.filter((l) => typeof l.slot === "number");
  const exp = (dir: 1 | -1) => r2(sumBy(inHorizon.filter((l) => !ACTUAL_LANES.has(l.lane) && l.direction === dir), (l) => l.amount));
  const sumSlot = (slot: Slot, dir: 1 | -1) => r2(sumBy(lines.filter((l) => l.slot === slot && l.direction === dir), (l) => l.amount));
  const exceptions: CashException[] = [];
  for (const l of lines) {
    if (l.slot === "overdue" && l.lane === "receivable_due") exceptions.push({ code: "RECEIVABLE_OVERDUE", line: l });
    else if (l.slot === "overdue" && l.lane === "payable_due") exceptions.push({ code: "PAYABLE_OVERDUE", line: l });
    else if (l.slot === "overdue" && (l.lane === "plan_in" || l.lane === "plan_out") && l.date.slice(0, 7) < start.slice(0, 7)) exceptions.push({ code: "PLAN_PAST", line: l });
    else if (l.slot === "undated") exceptions.push({ code: "UNDATED", line: l });
  }
  return { project, from: start, weeks, scenario, periods, lines, opening, closing, net,
    cards: { opening, expected_in: exp(1), expected_out: exp(-1), actual_net: signed(inHorizon.filter((l) => ACTUAL_LANES.has(l.lane))), closing: closing[closing.length - 1] ?? opening,
      overdue_in: sumSlot("overdue", 1), overdue_out: sumSlot("overdue", -1), undated_in: sumSlot("undated", 1), undated_out: sumSlot("undated", -1) },
    exceptions };
}
