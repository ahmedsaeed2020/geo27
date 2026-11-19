/**
 * DIGIT Construction reports (Script Reports). Each `run` reads the same scoped records and domain services as the
 * workspaces (src/plugins/digit_construction/domain/data.ts), so a report row, its KPI and its drill-down reconcile.
 * Metric contracts: docs/digit-app-builder/KPI_REPORT_REGISTRY.md.
 */
import type { PluginReport } from "../types";
import { agingBucket, num, r2, sumBy } from "./domain/calc";
import { outstandingAsOf, readDay, contractPosition, contractsOf, costPosition, costSources, latestForecast, list, materialBalance, materialMovements, overdueTasks, procurementOf, projectCommercial, resourcesOf, rows, scheduleSlipDays, today, payablesOf, closeoutOf, isSubmitted } from "./domain/data";
import type { Doc } from "@/lib/adapter";
import { constructionProjects, settings } from "./domain/queues";
import { costVerification } from "./domain/costVerify";
import { OPS_REPORTS } from "./reportsOps";
import { GAP_REPORTS } from "./reportsGap";
import { MGT_REPORTS } from "./reportsMgt";
import { SITE_REPORTS } from "./reportsSite";
import { EST_REPORTS } from "./reportsEstimating";
import { COMMERCIAL_REPORTS } from "./reportsCommercial";
import { SUBCONTRACT_REPORTS } from "./reportsSubcontract";
import { COST_REPORTS } from "./reportsCost";
import { PROC_REPORTS } from "./reportsProc";
import { RES_REPORTS } from "./reportsRes";
import { FIN_REPORTS } from "./reportsFin";
import { ENT36_REPORTS } from "./reportsEnt36";
import * as SC from "./domain/subcontract";
import { R19_REPORTS } from "./reportsR19";
import { R19_CONTRACT_REPORTS } from "./reportsR19Contract";

type F = Record<string, unknown>;
/** Construction projects only (domain/queues constructionProjects: plugin-owned contract type or a linked construction record), readable by the session user. */
const proj = (f: F) => constructionProjects({ company: (f["company"] as string) || undefined, project: (f["project"] as string) || undefined });
/** The one project a project-required report runs for: only an explicitly selected, readable construction project (never a silent default). */
const oneProject = (f: F) => (f["project"] ? proj(f)[0]?.name : undefined);
const AS_OF = { fieldname: "as_of", label: "As of", fieldtype: "Date" };
const PF = [{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company" }, { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" }];
const C = (fieldname: string, label: string, fieldtype = "Currency", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
/** Exported execute(): a stub that refuses to run until the server port of the virtual read model (domain/data.ts `${q}`) is implemented and staged. */
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/domain/data.ts (${q}).\n# Port that read model to Python and test it on staging before enabling this report.\n\n\ndef execute(filters=None):\n\tfrappe.throw(_("This report is not implemented on the server yet ({0}).").format(${JSON.stringify(q)}))\n`;

const BASE_REPORTS: PluginReport[] = [
  { name: "Construction Portfolio Status", ref_doctype: "Project", report_type: "Script Report", filters: PF, script: S("portfolio"),
    columns: [C("project", "Project", "Link", "Project"), C("customer", "Customer", "Link", "Customer"), C("revised", "Revised Contract"), C("certified", "Certified Gross"), C("invoiced", "Invoiced (net)"), C("collected", "Collected"),
      C("budget", "Revised Budget"), C("committed", "Open Commitments"), C("actual", "Actual Cost"), C("eac", "EAC"), C("margin", "Forecast Margin %", "Percent"), C("slip", "Schedule Slip (days)", "Int"), C("overdue", "Overdue Tasks", "Int"),
      C("status", "Project Status", "Data"), C("risk", "Risk", "Data"), C("risk_reason", "Risk Reasons", "Data")],
    run: (f) => proj(f).map((p) => { const com = projectCommercial(p.name), cost = costPosition(p.name); const slip = scheduleSlipDays(p.name), overdue = overdueTasks(p.name).length; const r = projectRisk({ status: String(p["status"] ?? ""), margin: cost.marginPct, eac: cost.eac, budget: cost.budget ? cost.revised : null, actual: cost.actual, slip, overdue, project: p.name });
      return { project: p.name, company: p["company"], customer: p["customer"], revised: com.revised, certified: com.certifiedGross, invoiced: com.invoicedNet, collected: com.collected, budget: cost.budget ? cost.revised : null, committed: cost.committed, actual: cost.actual, eac: cost.eac, margin: cost.marginPct, slip, overdue, status: p["status"], risk: r.risk, risk_reason: r.reasons.join("; ") }; }) },
  { name: "Tender Pipeline", ref_doctype: "Digit Tender", report_type: "Script Report", filters: [PF[0]!], script: S("tenders"),
    columns: [C("tender", "Tender", "Link", "Digit Tender"), C("title", "Title", "Data"), C("customer", "Customer", "Link", "Customer"), C("status", "Status", "Data"), C("deadline", "Submission Deadline", "Date"), C("days", "Days to Deadline", "Int"), C("cost", "Estimated Cost"), C("bid", "Bid Value (before tax)"), C("margin", "Margin %", "Percent"), C("estimate", "Approved Estimate", "Link", "Digit Estimate Version")],
    run: (f) => list("Digit Tender", (t) => !f["company"] || t["company"] === f["company"]).map((t) => { const cost = t["est_cost"] == null ? null : num(t["est_cost"]), bid = t["est_selling"] == null ? null : num(t["est_selling"]); return { tender: t.name, title: t["title"], customer: t["customer"], status: t["status"], deadline: t["submission_deadline"], days: t["submission_deadline"] ? Math.round((Date.parse(String(t["submission_deadline"])) - Date.parse(today())) / 86400000) : null, cost, bid, margin: cost !== null && bid ? r2((bid - cost) / bid * 100) : null, estimate: t["approved_estimate"] }; }) },
  { name: "Client Contract Position", ref_doctype: "Digit Client Contract", report_type: "Script Report", filters: PF, script: S("contracts"),
    columns: [C("contract", "Client Contract", "Link", "Digit Client Contract"), C("project", "Project", "Link", "Project"), C("original", "Original Value"), C("variations", "Approved Variations"), C("revised", "Revised Value"), C("certified", "Certified Gross"), C("advance", "Advance Outstanding"), C("retention", "Retention Held"), C("net", "Net Certified"), C("invoiced", "Invoiced (net)"), C("collected", "Collected"), C("outstanding", "Receivable Outstanding"), C("unbilled", "Certified not Invoiced"), C("state", "Contract Status", "Data"), C("over_invoiced", "Invoiced Exceeds Certified", "Check")],
    run: (f) => proj(f).flatMap((p) => contractsOf(p.name)).map((c) => { const x = contractPosition(c); return { contract: c.name, project: c["project"], company: c["company"], state: c["workflow_state"], original: x.original, variations: x.variations, revised: x.revised, certified: x.certifiedGross, advance: x.advanceOutstanding, retention: x.retentionHeld, net: x.netCertified, invoiced: x.invoicedNet, collected: x.collected, outstanding: x.outstanding, unbilled: x.certifiedNotInvoiced, over_invoiced: x.invoicedNet > x.netCertified + 0.005 ? 1 : 0 }; }) },
  { name: "Claims and Certificates Register", ref_doctype: "Digit Client Claim", report_type: "Script Report", filters: PF, script: S("claims"),
    columns: [C("claim", "Client Claim", "Link", "Digit Client Claim"), C("claim_no", "Claim No.", "Int"), C("project", "Project", "Link", "Project"), C("period_end", "Period End", "Date"), C("state", "Claim Status", "Data"), C("claimed", "This Claim"), C("certificate", "Certificate", "Link", "Digit Client Certificate"), C("certified", "Certified Gross"), C("net", "Net Certified"), C("invoice", "Sales Invoice", "Link", "Sales Invoice")],
    run: (f) => { const ps = new Set(proj(f).map((p) => p.name)); return list("Digit Client Claim", (c) => ps.has(String(c["project"]))).sort((a, b) => String(a["contract"]).localeCompare(String(b["contract"])) || num(a["claim_no"]) - num(b["claim_no"])).map((c) => { const ce = list("Digit Client Certificate", (x) => x["claim"] === c.name && num(x.docstatus) !== 2)[0]; return { claim: c.name, claim_no: c["claim_no"], project: c["project"], period_end: c["period_end"], state: c["workflow_state"], claimed: c["this_claim"], certificate: ce?.name ?? "", certified: ce ? ce["gross_this"] : null, net: ce ? ce["net_certified"] : null, invoice: ce?.["sales_invoice"] ?? "" }; }); } },
  { name: "Construction Receivables Aging", ref_doctype: "Sales Invoice", report_type: "Script Report", filters: [...PF, AS_OF], script: S("ar aging"),
    columns: [C("invoice", "Sales Invoice", "Link", "Sales Invoice"), C("project", "Project", "Link", "Project"), C("customer", "Customer", "Link", "Customer"), C("certificate", "Certificate", "Link", "Digit Client Certificate"), C("due_date", "Due Date", "Date"), C("grand_total", "Invoice Total"), C("outstanding", "Outstanding"), C("bucket", "Aging Bucket", "Data"), C("overdue", "Overdue", "Check")],
    // G02: as of a past day (filter or the workspace as-of) the outstanding adds back later settlements and ages from that day
    run: (f) => { const ps = new Set(proj(f).map((p) => p.name)); const on = String(f["as_of"] || readDay()).slice(0, 10);
      return list("Sales Invoice", (s) => isSubmitted(s) && ps.has(String(s["project"])) && String(s["posting_date"] ?? "") <= on).map((s) => ({ s, out: outstandingAsOf(s, on) })).filter((x) => x.out > 0.005).map(({ s, out }) => ({ invoice: s.name, project: s["project"], company: s["company"], customer: s["customer"], certificate: s["digit_client_certificate"] ?? "", due_date: s["due_date"], grand_total: s["grand_total"], outstanding: out, bucket: agingBucket(String(s["due_date"] ?? on), on), overdue: s["due_date"] && String(s["due_date"]) < on ? 1 : 0 })); } },
  { name: "Subcontract Position", ref_doctype: "Digit Subcontract Work Order", report_type: "Script Report", filters: PF, script: S("subcontract"),
    columns: [C("work_order", "Work Order", "Link", "Digit Subcontract Work Order"), C("subcontractor", "Subcontractor", "Link", "Supplier"), C("project", "Project", "Link", "Project"), C("value", "Work Order Value"), C("certified", "Certified Measurement Value"), C("billed", "Billed Gross"), C("retention", "Retention Withheld"), C("invoiced", "Purchase Invoiced (net)"), C("paid", "Paid"), C("outstanding", "Purchase Invoice Outstanding"), C("pending", "Books Pending QS", "Int")],
    run: (f) => { const ps = new Set(proj(f).map((p) => p.name)); return list("Digit Subcontract Work Order", (w) => ps.has(String(w["project"]))).map((w) => {
      const books = list("Digit Measurement Book", (b) => b["work_order"] === w.name); const bills = list("Digit Subcontractor Bill", (b) => b["work_order"] === w.name && isSubmitted(b));
      const pis = bills.map((b) => list("Purchase Invoice", (p) => p.name === b["purchase_invoice"] && isSubmitted(p))[0]).filter(Boolean) as Doc[];
      return { work_order: w.name, subcontractor: w["subcontractor"], project: w["project"], value: w["total_value"], certified: sumBy(books.filter((b) => b["workflow_state"] === "Certified"), (b) => num(b["accepted_value"])), billed: sumBy(bills, (b) => num(b["gross_amount"])), retention: sumBy(bills, (b) => num(b["retention_amount"])),
        // F05-11-1: paid = Σ allocated from submitted payment entries, outstanding = Σ invoice outstanding (DEC-065: net billed, retention and payment kept apart)
        invoiced: sumBy(pis, (p) => num(p["net_total"])), ...SC.payables(pis), company: w["company"], pending: books.filter((b) => b["workflow_state"] === "Submitted").length }; }); } },
  { name: "Project Cost Report", ref_doctype: "Digit Project Cost Budget", report_type: "Script Report", filters: [PF[0]!, { ...PF[1]!, reqd: 1 } as never, AS_OF], script: S("cost"),
    columns: [C("cost_code", "Cost Code", "Data"), C("description", "Description", "Data"), C("category", "Category", "Data"), C("original", "Original Budget"), C("revised", "Revised Budget"), C("committed", "Open Commitments"), C("actual", "Actual Cost"), C("etc", "ETC"), C("eac", "EAC"), C("variance", "Variance at Completion")],
    run: (f) => { const p = oneProject(f); if (!p) return []; const c = costPosition(p, (f["as_of"] as string) || undefined);
      return [...c.lines.map((l) => ({ cost_code: l.cost_code, description: l.description, category: l.category, original: l.original, revised: l.revised, committed: l.committed, actual: l.actual, etc: l.etc, eac: l.eac, variance: l.variance })),
        ...c.unallocated.map((u) => ({ cost_code: u.code, description: "Not mapped to an approved budget line", category: "—", original: 0, revised: 0, committed: u.committed, actual: u.actual, etc: u.committed, eac: r2(u.actual + u.committed), variance: r2(-(u.actual + u.committed)) }))]; } },
  { name: "Project Cost Sources", ref_doctype: "Project", report_type: "Script Report", script: S("cost sources"),
    filters: [PF[0]!, { ...PF[1]!, reqd: 1 } as never, { fieldname: "measure", label: "Measure", fieldtype: "Select", options: "\nCommitment\nActual" }, { fieldname: "cost_code", label: "Cost Code", fieldtype: "Data" }, AS_OF],
    columns: [C("cost_code", "Cost Code", "Data"), C("measure", "Measure", "Data"), C("source_doctype", "Source Type", "Data"), C("source", "Source Document", "Dynamic Link", "source_doctype"), C("row_no", "Row", "Int"), C("detail", "Item / Account", "Data"), C("amount", "Amount")],
    run: (f) => { const p = oneProject(f); if (!p) return []; const m = String(f["measure"] ?? ""), code = String(f["cost_code"] ?? "");
      return costSources(p, (f["as_of"] as string) || undefined).filter((x) => (!m || (m === "Commitment" ? x.kind === "commitment" : x.kind === "actual")) && (!code || x.cost_code === code))
        .map((x) => ({ cost_code: x.cost_code, measure: x.kind === "commitment" ? "Commitment" : "Actual", source_doctype: x.doctype, source: x.name, source_table: x.table, row_no: x.row, detail: x.detail, amount: x.amount })); } },
  { name: "Cost Source Exceptions", ref_doctype: "Project", report_type: "Script Report", script: S("cost exceptions (domain/costVerify.ts)"),
    filters: [PF[0]!, { ...PF[1]!, reqd: 1 } as never, { fieldname: "status", label: "Status", fieldtype: "Select", options: "\nOpen\nReviewed\nCorrection requested" }, AS_OF],
    columns: [C("exception", "Exception", "Data"), C("severity", "Severity", "Data"), C("source_doctype", "Source Type", "Data"), C("source", "Source Document", "Dynamic Link", "source_doctype"), C("row_no", "Row", "Int"), C("detail", "Item / Account", "Data"), C("amount", "Amount"), C("status", "Status", "Data"), C("review", "Review", "Link", "Digit Cost Exception Review")],
    run: (f) => { const p = oneProject(f); if (!p) return []; const st = String(f["status"] ?? "");
      return costVerification(p, (f["as_of"] as string) || undefined).exceptions.filter((x) => !st || x.status === st)
        .map((x) => ({ exception: x.label, severity: x.severity, source_doctype: x.source_doctype, source: x.source_name, source_table: x.table, row_no: x.row || null, detail: x.detail, amount: x.amount, status: x.status, review: x.review, project: p })); } },
  { name: "Material Request Status", ref_doctype: "Material Request", report_type: "Script Report", filters: PF, script: S("mr status"),
    columns: [C("material_request", "Material Request", "Link", "Material Request"), C("project", "Project", "Link", "Project"), C("required_by", "Required By", "Date"), C("status", "Status", "Data"), C("ordered", "Ordered %", "Percent"), C("purchase_order", "Purchase Order", "Link", "Purchase Order"), C("received", "Received %", "Percent"), C("overdue", "Overdue", "Check"), C("open", "Open", "Check")],
    run: (f) => proj(f).flatMap((p) => procurementOf(p.name).mrs.map((m) => { const po = list("Purchase Order", (x) => rows(x, "items").some((i) => i["material_request"] === m.name))[0]; const open = num(m.docstatus) === 0 || (isSubmitted(m) && num(m["per_ordered"]) < 100 && !["Stopped", "Cancelled"].includes(String(m["status"])));
      return { material_request: m.name, project: p.name, company: m["company"], required_by: m["schedule_date"], status: m["status"], ordered: m["per_ordered"], purchase_order: po?.name ?? "", received: po ? po["per_received"] : null, overdue: num(m["per_ordered"]) < 100 && String(m["schedule_date"]) < today() ? 1 : 0, open: num(m.docstatus) !== 2 && open ? 1 : 0 }; })) },
  { name: "Project Material Balance", ref_doctype: "Stock Ledger Entry", report_type: "Script Report", filters: [PF[0]!, { ...PF[1]!, reqd: 1 } as never, AS_OF], script: S("materials balance"),
    columns: [C("item_code", "Item", "Link", "Item"), C("uom", "UOM", "Data"), C("requested", "Requested Qty", "Float"), C("ordered", "Ordered Qty", "Float"), C("pending_receipt", "Pending Receipt Qty", "Float"),
      C("received", "Received Qty", "Float"), C("returned", "Returned Qty", "Float"), C("issued", "Issued to Work Qty", "Float"), C("transfers", "Net Transfers Qty", "Float"), C("balance", "Site Balance Qty", "Float"), C("issued_value", "Issued Value")],
    run: (f) => { const p = oneProject(f); return p ? materialBalance(p, (f["as_of"] as string) || undefined).map((b) => ({ ...b })) : []; } },
  { name: "Project Material Movements", ref_doctype: "Stock Ledger Entry", report_type: "Script Report",
    filters: [PF[0]!, { ...PF[1]!, reqd: 1 } as never, { fieldname: "item_code", label: "Item", fieldtype: "Data" }, { fieldname: "move", label: "Movement", fieldtype: "Select", options: "\nReceipt\nReturn to Supplier\nIssue to Work\nTransfer In\nTransfer Out\nOther Receipt\nOther Issue" }, AS_OF], script: S("materials movements"),
    columns: [C("posting_date", "Posting Date", "Date"), C("move", "Movement", "Data"), C("source_doctype", "Source Type", "Data"), C("source", "Source Document", "Dynamic Link", "source_doctype"), C("row_no", "Row", "Int"), C("item_code", "Item", "Link", "Item"), C("warehouse", "Warehouse", "Link", "Warehouse"), C("qty", "Qty", "Float"), C("value", "Stock Value Change")],
    run: (f) => { const p = oneProject(f); if (!p) return []; const item = String(f["item_code"] ?? ""), mv = String(f["move"] ?? "");
      return materialMovements(p, (f["as_of"] as string) || undefined).filter((x) => (!item || x.item_code === item) && (!mv || x.move === mv))
        .map((x) => ({ posting_date: x.posting_date, move: x.move, source_doctype: x.voucher_type, source: x.voucher_no, source_table: x.table, row_no: x.row, item_code: x.item_code, warehouse: x.warehouse, qty: x.qty, value: x.value })); } },
  { name: "Resource Utilization", ref_doctype: "Digit Field Attendance", report_type: "Script Report", filters: PF, script: S("resources"),
    columns: [C("project", "Project", "Link", "Project"), C("crews", "Active Crews", "Int"), C("man_days", "Man-days (submitted)", "Float"), C("overtime", "Overtime Hours", "Float"), C("machine_hours", "Machine Hours", "Float"), C("machine_estimate", "Machine Cost (operational estimate)"), C("approved_spend", "Approved Site Spend (not posted)"), C("pending_spend", "Pending Site Spend")],
    run: (f) => proj(f).map((p) => { const r = resourcesOf(p.name); return { project: p.name, crews: r.crews.filter((c) => c["status"] === "Active").length, man_days: r.manDays, overtime: r.overtime, machine_hours: r.machineHours, machine_estimate: r.machineEstimate, approved_spend: r.approvedSpend, pending_spend: r.pendingSpend }; }) },
  { name: "Construction Cashflow", ref_doctype: "Digit Cashflow Forecast Item", report_type: "Script Report", filters: PF, script: S("cashflow"),
    columns: [C("period", "Period", "Data"), C("collected", "Collected (actual)"), C("paid", "Paid (actual)"), C("forecast_in", "Forecast Inflow"), C("forecast_out", "Forecast Outflow"), C("net", "Net"), C("cumulative", "Cumulative")],
    run: (f) => { const ps = new Set(proj(f).map((p) => p.name)); const m = new Map<string, { collected: number; paid: number; forecast_in: number; forecast_out: number }>();
      const add = (k: string, key: "collected" | "paid" | "forecast_in" | "forecast_out", v: number) => { const x = m.get(k) ?? { collected: 0, paid: 0, forecast_in: 0, forecast_out: 0 }; x[key] = r2(x[key] + v); m.set(k, x); };
      for (const pe of list("Payment Entry", (x) => isSubmitted(x))) { const refs = rows(pe, "references"); const projOf = (r: Record<string, unknown>) => String(list(String(r["reference_doctype"]), (d) => d.name === r["reference_name"])[0]?.["project"] ?? pe["project"] ?? "");
        for (const r of refs) if (ps.has(projOf(r))) add(String(pe["posting_date"]).slice(0, 7), pe["payment_type"] === "Receive" ? "collected" : "paid", num(r["allocated_amount"])); }
      for (const c of list("Digit Cashflow Forecast Item", (x) => ps.has(String(x["project"])))) add(String(c["period"]), c["direction"] === "Inflow" ? "forecast_in" : "forecast_out", num(c["amount"]));
      let cum = 0; return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, x]) => { const net = r2(x.collected + x.forecast_in - x.paid - x.forecast_out); cum = r2(cum + net); return { period, ...x, net, cumulative: cum }; }); } },
  { name: "Retention and Advances", ref_doctype: "Digit Client Contract", report_type: "Script Report", filters: PF, script: S("retention"),
    columns: [C("contract", "Client Contract", "Link", "Digit Client Contract"), C("project", "Project", "Link", "Project"), C("advance_amount", "Advance Paid by Client"), C("advance_recovered", "Advance Recovered"), C("advance_outstanding", "Advance Outstanding"), C("retention_held", "Retention Held"), C("released", "Retention Released"), C("pending_release", "Release Requests Pending")],
    run: (f) => proj(f).flatMap((p) => contractsOf(p.name)).map((c) => { const x = contractPosition(c); return { contract: c.name, project: c["project"], advance_amount: num(c["advance_amount"]), advance_recovered: x.advanceRecovered, advance_outstanding: x.advanceOutstanding, retention_held: x.retentionHeld, released: x.retentionReleased, pending_release: sumBy(list("Digit Retention Release Request", (r) => r["contract"] === c.name && r["workflow_state"] === "Pending Approval"), (r) => num(r["requested_amount"])) }; }) },
  { name: "Closeout Readiness", ref_doctype: "Digit Closeout Assessment", report_type: "Script Report", filters: PF, script: S("closeout"),
    columns: [C("project", "Project", "Link", "Project"), C("assessment", "Closeout Assessment", "Link", "Digit Closeout Assessment"), C("technical", "Technical Closeout", "Data"), C("commercial", "Commercial Closeout", "Data"), C("financial", "Financial Closeout", "Data"), C("final_account", "Final Account", "Link", "Digit Final Account"), C("final_state", "Final Account Status", "Data"), C("receivable", "Receivable Outstanding"), C("payable", "Payable Outstanding")],
    run: (f) => proj(f).map((p) => { const c = closeoutOf(p.name); const fa = c.finalAccounts[0]; return { project: p.name, assessment: c.assessment?.name ?? "", technical: c.assessment?.["technical_status"] ?? "Not Started", commercial: c.assessment?.["commercial_status"] ?? "Not Started", financial: c.assessment?.["financial_status"] ?? "Not Started", final_account: fa?.name ?? "", final_state: fa?.["workflow_state"] ?? "", receivable: projectCommercial(p.name).outstanding, payable: payablesOf(p.name).outstanding }; }) },
];

/** Every report of the app: position/summary reports above, the row-level operational reports (reportsOps.ts) and the R4-R crosswalk-gap reports (reportsGap.ts). */
export const CONSTRUCTION_REPORTS: PluginReport[] = [...BASE_REPORTS, ...OPS_REPORTS, ...GAP_REPORTS, ...MGT_REPORTS, ...SITE_REPORTS, ...EST_REPORTS, ...COMMERCIAL_REPORTS, ...SUBCONTRACT_REPORTS, ...COST_REPORTS, ...PROC_REPORTS, ...RES_REPORTS, ...FIN_REPORTS, ...R19_REPORTS, ...R19_CONTRACT_REPORTS, ...ENT36_REPORTS];

/**
 * Project risk (spec catalog F01-08-1, owner-approved 2026-10-29): High when the forecast margin is negative, the EAC
 * overruns the revised budget by more than overrun_alert_pct, or the schedule slips more than 30 days; Medium when the
 * margin is below 5% or the latest approved forecast is older than stale_forecast_days; else Low. Each reason is a
 * source-derived fact; closed/completed projects are not rated. Never stored.
 */
/** Arabic of one risk reason (fixed phrases + the two with a day count). */
export function riskReasonAr(r: string): string {
  const fixed: Record<string, string> = { "Negative forecast margin": "هامش سالب", "EAC above revised budget": "التكلفة المتوقعة أعلى من الموازنة المعدلة", "Forecast margin below 5%": "هامش متوقع أقل من 5%" };
  if (fixed[r]) return fixed[r]!;
  const m = /^(Schedule slip|Forecast older than) (-?\d+) days$/.exec(r);
  return m ? (m[1] === "Schedule slip" ? `تأخر الجدول ${m[2]} يومًا` : `التوقع أقدم من ${m[2]} يومًا`) : r;
}
export function projectRisk(x: { status: string; margin: number | null; eac: number | null; budget: number | null; actual: number; slip: number | null; overdue: number; project?: string; on?: string; forecastDate?: string }): { risk: string; reasons: string[] } {
  if (x.status && x.status !== "Open") return { risk: "Not rated", reasons: [] };
  const st = settings();
  const alert = num(st?.["overrun_alert_pct"]) || 0, stale = num(st?.["stale_forecast_days"]) || 45;
  const high: string[] = [], medium: string[] = [];
  if (x.margin !== null && x.margin < 0) high.push("Negative forecast margin");
  if (x.eac !== null && x.budget !== null && x.eac > x.budget * (1 + alert / 100)) high.push("EAC above revised budget");
  if ((x.slip ?? 0) > 30) high.push(`Schedule slip ${x.slip} days`);
  if (x.margin !== null && x.margin >= 0 && x.margin < 5) medium.push("Forecast margin below 5%");
  const fcDate = x.forecastDate ?? (x.project ? String(latestForecast(x.project)?.["cutoff_date"] ?? "") : "");
  const on = x.on ?? today();
  if (fcDate && Math.round((Date.parse(on) - Date.parse(fcDate)) / 86400000) > stale) medium.push(`Forecast older than ${stale} days`);
  return { risk: high.length ? "High" : medium.length ? "Medium" : "Low", reasons: [...high, ...medium] };
}
