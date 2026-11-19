/**
 * DIGIT Construction operational ("fact") Script Reports: one row per source document or source child row, so every
 * KPI card and Insights chart that sums them (metrics.ts, analytics/insightsSource.ts) drills to exactly these rows and
 * each row opens its source record (`source_table` + `row_no` = child-row anchor). Same read rules as domain/data.ts:
 * construction projects only (domain/queues constructionProjects), session-scoped reads, nothing stored.
 * Measures stay separate: open PO commitment ≠ received-not-invoiced ≠ invoiced-not-paid; hours are never money.
 */
import type { PluginReport } from "../types";
import { agingBucket, num, r2, sumBy, validityState } from "./domain/calc";
import { get, isSubmitted, list, rows, state, today } from "./domain/data";
import { constructionProjects, settings } from "./domain/queues";
import { dependencyConflicts, scheduleOf } from "./domain/scheduleCore";

type F = Record<string, unknown>;
type Row = Record<string, unknown>;
const PF = [{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company" }, { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" }];
const C = (fieldname: string, label: string, fieldtype = "Currency", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/reportsOps.ts (${q}).\n# Port it to Python and test it on staging before enabling this report.\n\n\ndef execute(filters=None):\n\tfrappe.throw(_("This report is not implemented on the server yet ({0}).").format(${JSON.stringify(q)}))\n`;
/** Construction projects in scope (company / project filters, session-readable). */
const scope = (f: F) => constructionProjects({ company: (f["company"] as string) || undefined, project: (f["project"] as string) || undefined });
const companyOf = (project: unknown) => String(get("Project", project)?.["company"] ?? "");
const rowProject = (d: Row, r: Row) => String(r["project"] ?? d["project"] ?? "");
/** Silent-task window in days (Construction Settings, default 14 — DIGIT proposal, REQUIRES_VALIDATION). */
export const silentDays = () => num(settings()?.["silent_task_days"]) || 14;

export const OPS_REPORTS: PluginReport[] = [
  { name: "Open Purchase Order Lines", ref_doctype: "Purchase Order", report_type: "Script Report", filters: PF, script: S("open po lines"),
    columns: [C("purchase_order", "Purchase Order", "Link", "Purchase Order"), C("row_no", "Row", "Int"), C("project", "Project", "Link", "Project"), C("supplier", "Supplier", "Link", "Supplier"), C("item_code", "Item", "Link", "Item"), C("uom", "UOM", "Data"),
      C("qty", "Ordered Qty", "Float"), C("received_qty", "Received Qty", "Float"), C("remaining_qty", "Remaining Qty", "Float"), C("net_amount", "Line Net Amount"), C("billed_amt", "Billed Amount"), C("open_commitment", "Open Commitment"), C("schedule_date", "Required By", "Date"), C("late", "Late", "Check"), C("cost_code", "Cost Code", "Data")],
    run: (f) => { const ps = new Set(scope(f).map((p) => p.name)); const on = today(); const out: Row[] = [];
      for (const po of list("Purchase Order", (d) => isSubmitted(d) && !["Closed", "Cancelled"].includes(String(d["status"]))))
        rows(po, "items").forEach((it, i) => { const p = rowProject(po, it); if (!ps.has(p)) return; const q = num(it["qty"]), rq = num(it["received_qty"]); const sd = String(it["schedule_date"] ?? po["schedule_date"] ?? "");
          out.push({ purchase_order: po.name, source_table: "items", row_no: num(it["idx"]) || i + 1, project: p, company: po["company"], supplier: po["supplier"], item_code: it["item_code"], uom: it["uom"] ?? it["stock_uom"], qty: q, received_qty: rq, remaining_qty: r2(Math.max(0, q - rq)),
            net_amount: r2(num(it["net_amount"] ?? it["amount"])), billed_amt: r2(num(it["billed_amt"])), open_commitment: r2(Math.max(0, num(it["net_amount"] ?? it["amount"]) - num(it["billed_amt"]))), schedule_date: sd || null, late: q - rq > 0.0001 && !!sd && sd < on ? 1 : 0, cost_code: it["digit_cost_code"] ?? "" }); });
      return out; } },
  { name: "Received Not Invoiced", ref_doctype: "Purchase Receipt", report_type: "Script Report", filters: PF, script: S("received not invoiced"),
    columns: [C("purchase_receipt", "Purchase Receipt", "Link", "Purchase Receipt"), C("row_no", "Row", "Int"), C("project", "Project", "Link", "Project"), C("supplier", "Supplier", "Link", "Supplier"), C("posting_date", "Posting Date", "Date"), C("item_code", "Item", "Link", "Item"),
      C("qty", "Received Qty", "Float"), C("net_amount", "Received Net Amount"), C("billed_amt", "Billed Amount"), C("unbilled", "Received Not Invoiced"), C("purchase_order", "Purchase Order", "Link", "Purchase Order")],
    run: (f) => { const ps = new Set(scope(f).map((p) => p.name)); const out: Row[] = [];
      for (const pr of list("Purchase Receipt", (d) => isSubmitted(d) && !num(d["is_return"])))
        rows(pr, "items").forEach((it, i) => { let p = rowProject(pr, it); if (!p && it["purchase_order"]) p = String(rows(get("Purchase Order", it["purchase_order"]), "items").find((x) => x["name"] === it["purchase_order_item"])?.["project"] ?? get("Purchase Order", it["purchase_order"])?.["project"] ?? "");
          if (!ps.has(p)) return; const net = r2(num(it["net_amount"] ?? it["amount"])), billed = r2(num(it["billed_amt"])); if (net - billed <= 0.005) return;
          out.push({ purchase_receipt: pr.name, source_table: "items", row_no: num(it["idx"]) || i + 1, project: p, company: pr["company"], supplier: pr["supplier"], posting_date: pr["posting_date"], item_code: it["item_code"], qty: num(it["qty"]), net_amount: net, billed_amt: billed, unbilled: r2(net - billed), purchase_order: it["purchase_order"] ?? "" }); });
      return out; } },
  { name: "Supplier Invoices Outstanding", ref_doctype: "Purchase Invoice", report_type: "Script Report", filters: PF, script: S("pi outstanding"),
    columns: [C("purchase_invoice", "Purchase Invoice", "Link", "Purchase Invoice"), C("project", "Project", "Link", "Project"), C("supplier", "Supplier", "Link", "Supplier"), C("subcontractor_bill", "Subcontractor Bill", "Link", "Digit Subcontractor Bill"), C("posting_date", "Posting Date", "Date"), C("due_date", "Due Date", "Date"),
      C("grand_total", "Invoice Total"), C("outstanding", "Outstanding"), C("overdue", "Overdue", "Check"), C("bucket", "Aging Bucket", "Data")],
    run: (f) => { const ps = new Set(scope(f).map((p) => p.name)); const on = today();
      return list("Purchase Invoice", (d) => isSubmitted(d) && num(d["outstanding_amount"]) > 0.005).flatMap((pi) => { const p = String(pi["project"] || rows(pi, "items").find((i) => i["project"])?.["project"] || ""); if (!ps.has(p)) return [];
        const due = String(pi["due_date"] ?? ""); return [{ purchase_invoice: pi.name, project: p, company: pi["company"], supplier: pi["supplier"], subcontractor_bill: pi["digit_subcontractor_bill"] ?? "", posting_date: pi["posting_date"], due_date: due || null, grand_total: r2(num(pi["rounded_total"] || pi["grand_total"])), outstanding: r2(num(pi["outstanding_amount"])), overdue: due && due < on ? 1 : 0, bucket: due ? agingBucket(due, on) : "No due date" }]; }); } },
  { name: "Construction Tasks", ref_doctype: "Task", report_type: "Script Report", filters: PF, script: S("tasks"),
    columns: [C("task", "Task", "Link", "Task"), C("subject", "Subject", "Data"), C("project", "Project", "Link", "Project"), C("work_package", "Work Package", "Link", "Digit Work Package"), C("status", "Status", "Data"), C("exp_start_date", "Expected Start", "Date"), C("exp_end_date", "Expected End", "Date"),
      C("progress", "Progress %", "Percent"), C("overdue", "Overdue", "Check"), C("days_late", "Days Late", "Int"), C("last_update", "Last Progress Update", "Date"), C("silent", "Silent", "Check")],
    run: (f) => { const ps = new Set(scope(f).map((p) => p.name)); const on = today(); const win = silentDays();
      const upd = new Map<string, string>(); for (const u of list("Digit Progress Update", (x) => num(x.docstatus) !== 2)) { const t = String(u["task"] ?? ""); const d = String(u["update_date"] ?? ""); if (t && d > (upd.get(t) ?? "")) upd.set(t, d); }
      return list("Task", (t) => ps.has(String(t["project"])) && !num(t["is_group"]) && t["status"] !== "Template").map((t) => {
        const end = String(t["exp_end_date"] ?? "").slice(0, 10); const open = !["Completed", "Cancelled"].includes(String(t["status"])) && num(t["progress"]) < 100;
        const overdue = open && !!end && end < on; const last = upd.get(t.name) ?? ""; const started = String(t["exp_start_date"] ?? "") <= on;
        const silent = open && started && (!last || (Date.parse(on) - Date.parse(last)) / 86400000 > win);
        return { task: t.name, subject: t["subject"], project: t["project"], company: t["company"] ?? companyOf(t["project"]), work_package: t["digit_work_package"] ?? "", status: t["status"], exp_start_date: t["exp_start_date"] ?? null, exp_end_date: end || null, progress: num(t["progress"]),
          overdue: overdue ? 1 : 0, days_late: overdue ? Math.round((Date.parse(on) - Date.parse(end)) / 86400000) : 0, last_update: last || null, silent: silent ? 1 : 0 }; }); } },
  { name: "Schedule Dependency Conflicts", ref_doctype: "Digit Task Dependency", report_type: "Script Report", filters: PF, script: S("dependency conflicts"),
    columns: [C("project", "Project", "Link", "Project"), C("predecessor", "Predecessor", "Link", "Task"), C("successor", "Successor", "Link", "Task"), C("dependency_type", "Dependency Type", "Data"), C("lag", "Lag (days)", "Int"), C("days", "Days Out of Sequence", "Int"),
      C("historical", "Historical (both complete)", "Check"), C("source_doctype", "Source Type", "Data"), C("source", "Source Document", "Dynamic Link", "source_doctype")],
    run: (f) => scope(f).flatMap((p) => { const s = scheduleOf(p.name); return dependencyConflicts(s.tasks, s.edges).map((c) => ({ project: p.name, company: p["company"], predecessor: c.edge.predecessor, successor: c.edge.successor, dependency_type: c.edge.type, lag: c.edge.lag, days: c.days, historical: c.historical ? 1 : 0,
      source_doctype: c.edge.source === "Task.depends_on" ? "Task" : "Digit Task Dependency", source: c.edge.source === "Task.depends_on" ? c.edge.successor : c.edge.source })); }) },
  { name: "Client Certificates", ref_doctype: "Digit Client Certificate", report_type: "Script Report", filters: PF, script: S("certificates"),
    columns: [C("certificate", "Certificate", "Link", "Digit Client Certificate"), C("claim", "Client Claim", "Link", "Digit Client Claim"), C("contract", "Client Contract", "Link", "Digit Client Contract"), C("project", "Project", "Link", "Project"), C("state", "Status", "Data"), C("confirmed", "Confirmed", "Check"), C("cert_date", "Certificate Date", "Date"),
      C("gross", "Gross This Certificate"), C("advance_recovery", "Advance Recovery"), C("retention", "Retention"), C("other_deductions", "Other Deductions"), C("net", "Net Certified (before tax)"), C("sales_invoice", "Sales Invoice", "Link", "Sales Invoice"), C("invoiced_net", "Invoiced (net)")],
    run: (f) => { const ps = new Set(scope(f).map((p) => p.name));
      return list("Digit Client Certificate", (c) => ps.has(String(c["project"])) && num(c.docstatus) !== 2).map((c) => { const si = c["sales_invoice"] ? get("Sales Invoice", c["sales_invoice"]) : undefined;
        return { certificate: c.name, claim: c["claim"], contract: c["contract"], project: c["project"], company: c["company"] ?? companyOf(c["project"]), state: state(c), confirmed: isSubmitted(c) ? 1 : 0, cert_date: c["cert_date"], gross: r2(num(c["gross_this"])), advance_recovery: r2(num(c["advance_recovery"])), retention: r2(num(c["retention"])),
          other_deductions: r2(num(c["other_deductions"])), net: r2(num(c["net_certified"])), sales_invoice: c["sales_invoice"] ?? "", invoiced_net: si && isSubmitted(si) ? r2(num(si["net_total"])) : 0 }; }); } },
  { name: "Estimate Versions", ref_doctype: "Digit Estimate Version", report_type: "Script Report", filters: [PF[0]!], script: S("estimates"),
    columns: [C("estimate", "Estimate Version", "Link", "Digit Estimate Version"), C("tender", "Tender", "Link", "Digit Tender"), C("project", "Project", "Link", "Project"), C("version", "Version", "Int"), C("state", "Status", "Data"), C("total_cost", "Total Cost"), C("total_selling", "Total Selling"), C("margin_pct", "Margin %", "Percent"), C("approved_on", "Approved On", "Date")],
    run: (f) => list("Digit Estimate Version", (e) => !f["company"] || e["company"] === f["company"]).map((e) => ({ estimate: e.name, tender: e["tender"], project: e["project"] ?? "", company: e["company"], version: num(e["version"]), state: state(e), total_cost: r2(num(e["total_cost"])), total_selling: r2(num(e["total_selling"])), margin_pct: e["margin_pct"] ?? null, approved_on: e["approved_on"] ?? null })) },
  { name: "Rate Validity", ref_doctype: "Digit Construction Rate", report_type: "Script Report", filters: [], script: S("rates"),
    columns: [C("rate", "Rate", "Link", "Digit Construction Rate"), C("rate_name", "Rate Name", "Data"), C("category", "Category", "Data"), C("uom", "UOM", "Data"), C("current_rate", "Current Rate"), C("valid_until", "Valid Until", "Date"), C("days_left", "Days to Expiry", "Int"), C("validity", "Validity", "Data"), C("disabled", "Disabled", "Check")],
    run: () => { const on = today(); const warn = num(settings()?.["rate_expiry_warning_days"]) || 30;
      return list("Digit Construction Rate").map((r) => { const v = validityState(r["valid_until"], on, warn); return { rate: r.name, rate_name: r["rate_name"], category: r["category"], uom: r["uom"], current_rate: r2(num(r["current_rate"])), valid_until: r["valid_until"] ?? null,
        days_left: r["valid_until"] ? Math.round((Date.parse(String(r["valid_until"])) - Date.parse(on)) / 86400000) : null, validity: v === "expired" ? "Expired" : v === "expiring" ? "Expiring" : v === "valid" ? "Valid" : "No validity date", disabled: num(r["disabled"]) ? 1 : 0 }; }); } },
  { name: "Cost Control Documents", ref_doctype: "Digit Project Cost Budget", report_type: "Script Report", filters: PF, script: S("cost documents"),
    columns: [C("source_doctype", "Source Type", "Data"), C("source", "Source Document", "Dynamic Link", "source_doctype"), C("project", "Project", "Link", "Project"), C("state", "Status", "Data"), C("doc_date", "Date", "Date"), C("amount", "Amount"), C("note", "Basis", "Data")],
    run: (f) => { const ps = new Set(scope(f).map((p) => p.name)); const out: Row[] = [];
      const add = (dt: string, d: Row & { name: string }, amount: number, date: unknown, note: string) => out.push({ source_doctype: dt, source: d.name, project: d["project"], company: companyOf(d["project"]), state: state(d as never), doc_date: date ?? null, amount: r2(amount), note });
      for (const b of list("Digit Project Cost Budget", (x) => ps.has(String(x["project"])) && num(x.docstatus) !== 2)) add("Digit Project Cost Budget", b, num(b["total_original"]), b["effective_date"] ?? b["approved_on"], `v${num(b["version"])}`);
      for (const r of list("Digit Budget Revision", (x) => ps.has(String(x["project"])) && num(x.docstatus) !== 2)) add("Digit Budget Revision", r, num(r["net_change"]), r["approved_on"], String(r["reason"] ?? ""));
      for (const t of list("Digit Budget Transfer", (x) => ps.has(String(x["project"])) && num(x.docstatus) !== 2)) add("Digit Budget Transfer", t, num(t["amount"]), t["modified"], `${String(t["from_line"])} → ${String(t["to_line"])}`);
      for (const s of list("Digit Cost Forecast Snapshot", (x) => ps.has(String(x["project"])) && num(x.docstatus) !== 2)) add("Digit Cost Forecast Snapshot", s, num(s["total_eac"]), s["cutoff_date"], `${String(s["period"] ?? "")} EAC`);
      return out; } },
  { name: "Site Spend Register", ref_doctype: "Digit Site Expense", report_type: "Script Report", filters: PF, script: S("site spend"),
    columns: [C("expense", "Site Expense", "Link", "Digit Site Expense"), C("project", "Project", "Link", "Project"), C("fund", "Petty Cash Fund", "Link", "Digit Petty Cash Fund"), C("expense_date", "Expense Date", "Date"), C("category", "Category", "Data"), C("state", "Status", "Data"), C("amount", "Amount"), C("journal_entry", "Journal Entry", "Link", "Journal Entry")],
    run: (f) => { const ps = new Set(scope(f).map((p) => p.name)); return list("Digit Site Expense", (e) => ps.has(String(e["project"])) && num(e.docstatus) !== 2).map((e) => ({ expense: e.name, project: e["project"], company: companyOf(e["project"]), fund: e["fund"] ?? "", expense_date: e["expense_date"], category: e["category"], state: state(e), amount: r2(num(e["amount"])), journal_entry: e["journal_entry"] ?? "" })); } },
  { name: "Petty Cash Funds", ref_doctype: "Digit Petty Cash Fund", report_type: "Script Report", filters: PF, script: S("petty cash"),
    columns: [C("fund", "Petty Cash Fund", "Link", "Digit Petty Cash Fund"), C("project", "Project", "Link", "Project"), C("custodian", "Custodian", "Link", "Employee"), C("status", "Status", "Data"), C("fund_limit", "Fund Limit"), C("spent", "Approved Spend"), C("balance", "Remaining Balance")],
    run: (f) => { const ps = new Set(scope(f).map((p) => p.name)); return list("Digit Petty Cash Fund", (x) => ps.has(String(x["project"]))).map((x) => ({ fund: x.name, project: x["project"], company: x["company"] ?? companyOf(x["project"]), custodian: x["custodian"], status: x["status"], fund_limit: r2(num(x["fund_limit"])), spent: r2(num(x["spent"])), balance: r2(num(x["balance"])) })); } },
  { name: "Machinery Usage Register", ref_doctype: "Digit Machinery Usage", report_type: "Script Report", filters: PF, script: S("machinery usage"),
    columns: [C("usage", "Machinery Usage", "Link", "Digit Machinery Usage"), C("machinery", "Machinery", "Link", "Digit Machinery"), C("project", "Project", "Link", "Project"), C("usage_date", "Usage Date", "Date"), C("submitted", "Submitted", "Check"), C("hours", "Hours", "Float"), C("total", "Operational Cost (estimate, not posted)")],
    run: (f) => { const ps = new Set(scope(f).map((p) => p.name)); return list("Digit Machinery Usage", (u) => ps.has(String(u["project"])) && num(u.docstatus) !== 2).map((u) => ({ usage: u.name, machinery: u["machinery"], project: u["project"], company: companyOf(u["project"]), usage_date: u["usage_date"], submitted: isSubmitted(u) ? 1 : 0, hours: num(u["hours"]), total: r2(num(u["total"])) })); } },
  { name: "Site Attendance Overtime", ref_doctype: "Digit Field Attendance", report_type: "Script Report", filters: PF, script: S("attendance overtime"),
    columns: [C("attendance", "Site Attendance", "Link", "Digit Field Attendance"), C("row_no", "Row", "Int"), C("project", "Project", "Link", "Project"), C("attendance_date", "Attendance Date", "Date"), C("employee", "Employee", "Link", "Employee"), C("status", "Attendance", "Data"), C("submitted", "Submitted", "Check"), C("workflow_state", "Workflow State", "Data"), C("hours", "Hours", "Float"), C("overtime_hours", "Overtime Hours", "Float")],
    run: (f) => { const ps = new Set(scope(f).map((p) => p.name)); const out: Row[] = [];
      for (const a of list("Digit Field Attendance", (x) => ps.has(String(x["project"])) && num(x.docstatus) !== 2)) rows(a, "employees").forEach((e, i) => out.push({ attendance: a.name, source_table: "employees", row_no: num(e["idx"]) || i + 1, project: a["project"], company: companyOf(a["project"]), attendance_date: a["attendance_date"], employee: e["employee"], status: e["attendance"], submitted: isSubmitted(a) ? 1 : 0, workflow_state: a["workflow_state"] || "Draft", hours: num(e["hours"]), overtime_hours: num(e["overtime_hours"]) }));
      return out; } },
];

/** Totals helper for tests and reconciliation. */
export const sumCol = (rs: Row[], c: string) => r2(sumBy(rs, (r) => num(r[c])));
