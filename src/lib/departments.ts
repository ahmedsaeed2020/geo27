/**
 * Department foundations (HRMS, Projects, Manufacturing, Quality, Support) — virtual ports of the source
 * controllers' validate / on_submit / on_cancel behaviour. Called only from posting.ts submit/cancel so every
 * screen and test shares one lifecycle. Server-only behaviour (payroll formulas with Python, SLA timers,
 * scheduler jobs, payroll bank entries) is NOT simulated — see SERVER_DEPENDENT.
 */
import { adapter, type Doc } from "./adapter";
import { evalExpr } from "./expr";
import { resolveName } from "./rename";

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const rows = (d: Doc, f: string) => ((d[f] as Record<string, unknown>[] | undefined) ?? []);
const submitted = (dt: string) => adapter.list(dt).filter((x) => n(x.docstatus) === 1);
const overlap = (a1: string, a2: string, b1: string, b2: string) => a1 <= (b2 || "9999") && b1 <= (a2 || "9999");
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
const addDay = (d: string, k: number) => new Date(Date.parse(d) + k * 864e5).toISOString().slice(0, 10);

/** Behaviour the virtual Core deliberately does not run (real Frappe server required). */
export const SERVER_DEPENDENT = [
  "DIGIT HR: process_auto_attendance scheduler (we expose markAttendanceFromCheckins as an explicit action)",
  "DIGIT HR: salary component formulas using Python functions or employee fields beyond base/variable",
  "DIGIT HR: income tax slabs, payroll bank entry, Payroll Entry background queueing (>30 employees)",
  "DIGIT HR: leave encashment, compensatory leave, earned-leave scheduler allocation",
  "DIGIT HR: Expense Claim / Employee Advance GL posting (payable to employee)",
  "Projects: costing from Activity Cost/billing rates, Sales Invoice from Timesheet",
  "Manufacturing: Job Card time logs, operations costing, Production Plan, subcontracting",
  "Support: SLA response/resolution timers, holiday-aware SLA, email-to-issue",
];

/** Statuses the generic submit must not overwrite with "Submitted". */
export const KEEP_STATUS = new Set(["Leave Application", "Attendance", "Shift Assignment", "Expense Claim", "Quality Inspection", "Work Order", "Timesheet", "Employee Advance"]);

// ───────────────────────── HRMS: leave ledger ─────────────────────────
/** Ensures ledger rows exist for submitted allocations/approved applications (leave_ledger_entry.py create_leave_ledger_entry). Idempotent. */
export function ensureLeaveLedger(): void {
  for (const a of submitted("Leave Allocation")) if (!adapter.get("Leave Ledger Entry", `LLE-${a.name}`)) ledger(a, "Leave Allocation", n(a["new_leaves_allocated"] ?? a["total_leaves_allocated"]), s(a["from_date"]), s(a["to_date"]));
  for (const l of submitted("Leave Application")) if (l["status"] === "Approved" && !adapter.get("Leave Ledger Entry", `LLE-${l.name}`)) ledger(l, "Leave Application", -n(l["total_leave_days"]), s(l["from_date"]), s(l["to_date"]));
}
function ledger(d: Doc, tt: string, leaves: number, from: string, to: string) {
  adapter.insertDoc("Leave Ledger Entry", { name: `LLE-${d.name}`, employee: d["employee"], employee_name: d["employee_name"], leave_type: d["leave_type"], transaction_type: tt, transaction_name: d.name, leaves, from_date: from, to_date: to, company: d["company"], is_carry_forward: 0, is_expired: 0, is_lwp: 0, is_cancelled: 0, docstatus: 1 });
}
/** get_leave_balance_on: sum of non-cancelled ledger rows whose period covers `date`. */
export function leaveBalance(employee: string, leaveType: string, date: string): number {
  ensureLeaveLedger();
  const es = adapter.list("Leave Ledger Entry").filter((e) => e["employee"] === employee && e["leave_type"] === leaveType && !n(e["is_cancelled"]) && n(e["docstatus"]) === 1);
  const allocs = es.filter((e) => e["transaction_type"] !== "Leave Application" && s(e["from_date"]) <= date && date <= (s(e["to_date"]) || "9999"));
  // leave_application.get_leave_balance_on: allocation minus leaves taken anywhere inside the covering allocation period
  const taken = es.filter((e) => e["transaction_type"] === "Leave Application" && allocs.some((a) => s(a["from_date"]) <= s(e["from_date"]) && s(e["from_date"]) <= (s(a["to_date"]) || "9999")));
  return [...allocs, ...taken].reduce((t, e) => t + n(e["leaves"]), 0);
}
/** Employee's leave approver chain: leave_approver on Employee, else the reports_to employee's user (employee.py / leave_application get_leave_approver). */
export function leaveApprover(employee: string): string {
  const e = adapter.get("Employee", employee); if (!e) return "";
  if (e["leave_approver"]) return s(e["leave_approver"]);
  const m = e["reports_to"] ? adapter.get("Employee", s(e["reports_to"])) : undefined; return s(m?.["user_id"]);
}

// ───────────────────────── Payroll ─────────────────────────
/** Active Salary Structure Assignment on `date` (latest from_date ≤ date, submitted). */
export function activeAssignment(employee: string, date: string): Doc | undefined {
  return submitted("Salary Structure Assignment").filter((a) => a["employee"] === employee && s(a["from_date"]) <= date).sort((a, b) => s(b["from_date"]).localeCompare(s(a["from_date"])))[0];
}
/** Component amount: fixed amount, or formula evaluated by the controlled expression interpreter with base/variable and earlier abbrs. */
function componentAmount(r: Record<string, unknown>, vars: Record<string, unknown>): number | null {
  if (!n(r["amount_based_on_formula"])) return n(r["amount"]);
  const f = s(r["formula"]).trim(); if (!f) return 0;
  const x = evalExpr(f, vars, vars); return x.supported && typeof x.value === "number" ? Math.round(x.value * 100) / 100 : null;
}
/** payroll_entry.py create_salary_slips: one draft Salary Slip per employee row, idempotent. Returns created names + server-dependent notes. */
export function createSalarySlips(peName: string): { created: string[]; errors: string[] } {
  const pe = adapter.get("Payroll Entry", peName); const errors: string[] = []; const created: string[] = [];
  if (!pe || n(pe.docstatus) !== 1) return { created, errors: ["Submit the Payroll Entry before creating Salary Slips"] };
  for (const row of rows(pe, "employees")) {
    const emp = s(row["employee"]); const name = `Sal Slip/${emp}/${s(pe["start_date"]).slice(0, 7)}`;
    if (adapter.list("Salary Slip").some((x) => x["employee"] === emp && x["start_date"] === pe["start_date"] && n(x.docstatus) < 2)) continue;
    const ssa = activeAssignment(emp, s(pe["start_date"]));
    if (!ssa) { errors.push(`No active Salary Structure Assignment for employee ${emp} on ${pe["start_date"]}`); continue; }
    const st = adapter.get("Salary Structure", s(ssa["salary_structure"]));
    if (!st || n(st.docstatus) !== 1) { errors.push(`Salary Structure ${ssa["salary_structure"]} is not submitted`); continue; }
    const vars: Record<string, unknown> = { base: n(ssa["base"]), variable: n(ssa["variable"]) };
    const build = (f: string) => rows(st, f).map((r, i) => { const a = componentAmount(r, vars); if (a === null) errors.push(`Formula for ${r["salary_component"]} needs the DIGIT server: ${r["formula"]}`); if (r["abbr"]) vars[s(r["abbr"])] = a ?? 0; return { idx: i + 1, salary_component: r["salary_component"], abbr: r["abbr"], amount: a ?? 0 }; });
    const earnings = build("earnings"), deductions = build("deductions");
    const gross = earnings.reduce((t, r) => t + r.amount, 0), ded = deductions.reduce((t, r) => t + r.amount, 0);
    adapter.insertDoc("Salary Slip", { name, employee: emp, employee_name: row["employee_name"], department: row["department"], company: pe["company"], posting_date: pe["posting_date"], start_date: pe["start_date"], end_date: pe["end_date"], payroll_frequency: pe["payroll_frequency"], currency: pe["currency"], salary_structure: st.name, payroll_entry: pe.name, earnings, deductions, gross_pay: gross, total_deduction: ded, net_pay: gross - ded, rounded_total: Math.round(gross - ded), status: "Draft", docstatus: 0 });
    created.push(name);
  }
  if (created.length) adapter.update("Payroll Entry", peName, { salary_slips_created: 1 });
  return { created, errors };
}

// ───────────────────────── Attendance from checkins ─────────────────────────
/** shift_type.py process_auto_attendance for one date (explicit action, not a scheduler): first IN → last OUT working hours. */
export function markAttendanceFromCheckins(shiftType: string, date: string, company: string): string[] {
  const st = adapter.get("Shift Type", shiftType); const absentBelow = n(st?.["working_hours_threshold_for_absent"]), halfBelow = n(st?.["working_hours_threshold_for_half_day"]);
  const logs = adapter.list("Employee Checkin").filter((c) => c["shift"] === shiftType && s(c["time"]).slice(0, 10) === date && !c["attendance"]);
  const byEmp = new Map<string, Doc[]>(); for (const c of logs) byEmp.set(s(c["employee"]), [...(byEmp.get(s(c["employee"])) ?? []), c]);
  const made: string[] = [];
  for (const [emp, cs] of byEmp) {
    if (adapter.list("Attendance").some((a) => a["employee"] === emp && a["attendance_date"] === date && n(a.docstatus) < 2)) continue;
    const t = cs.map((c) => s(c["time"])).sort(); const ins = cs.filter((c) => c["log_type"] !== "OUT").map((c) => s(c["time"])).sort(), outs = cs.filter((c) => c["log_type"] !== "IN").map((c) => s(c["time"])).sort();
    const hrs = ins.length && outs.length ? Math.max(0, (Date.parse(outs.at(-1)!.replace(" ", "T")) - Date.parse(ins[0]!.replace(" ", "T"))) / 36e5) : 0;
    const status = absentBelow && hrs < absentBelow ? "Absent" : halfBelow && hrs < halfBelow ? "Half Day" : "Present";
    const name = `HR-ATT-${emp}-${date}`; const e = adapter.get("Employee", emp);
    adapter.insertDoc("Attendance", { name, employee: emp, employee_name: e?.["employee_name"], attendance_date: date, status, shift: shiftType, company: company || e?.["company"], working_hours: Math.round(hrs * 100) / 100, in_time: t[0], out_time: t.at(-1), docstatus: 1 });
    for (const c of cs) adapter.update("Employee Checkin", c.name, { attendance: name });
    made.push(name);
  }
  return made;
}

// ───────────────────────── Projects ─────────────────────────
/** project.py update_percent_complete (Task Completion / Task Progress / Task Weight). */
export function projectPercent(project: string): number {
  const p = adapter.get("Project", project); const ts = adapter.list("Task").filter((t) => t["project"] === project && t["status"] !== "Cancelled"); if (!ts.length) return 0;
  const m = s(p?.["percent_complete_method"] || "Task Completion");
  if (m === "Task Progress") return Math.round(ts.reduce((t, x) => t + n(x["progress"]), 0) / ts.length * 100) / 100;
  if (m === "Task Weight") { const w = ts.reduce((t, x) => t + n(x["task_weight"]), 0); return w ? Math.round(ts.reduce((t, x) => t + n(x["progress"]) * n(x["task_weight"]), 0) / w * 100) / 100 : 0; }
  return Math.round(ts.filter((x) => x["status"] === "Completed").length / ts.length * 10000) / 100;
}
/** task.py validate_status: cannot complete/cancel while dependent tasks are open; parent must be a group. */
export function taskErrors(t: Doc): string[] {
  const e: string[] = [];
  if (["Completed", "Cancelled"].includes(s(t["status"]))) for (const d of rows(t, "depends_on")) { const dt = adapter.get("Task", s(d["task"])); if (dt && !["Completed", "Cancelled"].includes(s(dt["status"]))) e.push(`Cannot complete task ${t.name} as its dependant task ${dt.name} are not completed / cancelled.`); }
  if (t["parent_task"]) { const p = adapter.get("Task", s(t["parent_task"])); if (p && !n(p["is_group"])) e.push(`Parent Task ${p.name} must be a Group Task`); if (p && p["project"] && t["project"] && p["project"] !== t["project"]) e.push(`Parent Task ${p.name} belongs to another project`); }
  if (t["exp_start_date"] && t["exp_end_date"] && s(t["exp_start_date"]) > s(t["exp_end_date"])) e.push("'Expected Start Date' can not be greater than 'Expected End Date'");
  return e;
}
/** Saves a Task through task.py rules and refreshes the project's percent_complete. */
export function saveTask(name: string, patch: Record<string, unknown>): string[] {
  const t = adapter.get("Task", name); if (!t) return ["not found"];
  const e = taskErrors({ ...t, ...patch }); if (e.length) return e;
  adapter.update("Task", name, { ...patch, ...(patch["status"] === "Completed" ? { progress: 100, completed_on: t["completed_on"] ?? new Date().toISOString().slice(0, 10) } : {}) });
  if (t["project"]) adapter.update("Project", s(t["project"]), { percent_complete: projectPercent(s(t["project"])) });
  return [];
}

// ───────────────────────── Manufacturing ─────────────────────────
/** work_order.py get_items / stock_entry get_items: BOM rows scaled to `qty`. */
export function bomItems(bom: string, qty: number): { item_code: unknown; qty: number; stock_uom?: unknown }[] {
  const b = adapter.get("BOM", bom); if (!b) return []; const per = qty / (n(b["quantity"]) || 1);
  return rows(b, "items").map((r) => ({ item_code: r["item_code"], qty: Math.round(n(r["qty"]) * per * 1000) / 1000, stock_uom: r["stock_uom"] ?? r["uom"] }));
}
/** work_order.make_stock_entry: draft Material Transfer for Manufacture or Manufacture. */
export function makeWorkOrderEntry(wo: string, purpose: "Material Transfer for Manufacture" | "Manufacture", qty: number): string | string[] {
  const w = adapter.get("Work Order", wo); if (!w || n(w.docstatus) !== 1) return ["Work Order must be submitted"];
  const name = `STE-${wo}-${purpose === "Manufacture" ? "MFG" : "MTM"}-${adapter.list("Stock Entry").filter((x) => x["work_order"] === wo).length + 1}`;
  const wip = s(w["wip_warehouse"]), src = s(w["source_warehouse"]), fg = s(w["fg_warehouse"]);
  const items = purpose === "Manufacture"
    ? [...bomItems(s(w["bom_no"]), qty).map((r) => ({ ...r, s_warehouse: wip || src })), { item_code: w["production_item"], qty, t_warehouse: fg, is_finished_item: 1 }]
    : bomItems(s(w["bom_no"]), qty).map((r) => ({ ...r, s_warehouse: src, t_warehouse: wip }));
  adapter.insertDoc("Stock Entry", { name, purpose, stock_entry_type: purpose, company: w["company"], posting_date: new Date().toISOString().slice(0, 10), work_order: wo, bom_no: w["bom_no"], fg_completed_qty: qty, from_bom: 1, items: items.map((r, i) => ({ idx: i + 1, name: `${name}-${i + 1}`, ...r })), docstatus: 0 });
  return name;
}
function woStatus(w: Doc): string {
  if (n(w.docstatus) === 2) return "Cancelled"; if (n(w["produced_qty"]) >= n(w["qty"])) return "Completed";
  return n(w["material_transferred_for_manufacturing"]) > 0 || n(w["produced_qty"]) > 0 ? "In Process" : "Not Started";
}

// ───────────────────────── Quality ─────────────────────────
/** quality_inspection.py inspect_and_set_status: numeric readings within min/max → Accepted. */
export function inspectionStatus(q: Doc): "Accepted" | "Rejected" {
  for (const r of rows(q, "readings")) {
    if (n(r["manual_inspection"]) && r["status"]) { if (r["status"] === "Rejected") return "Rejected"; continue; }
    if (n(r["numeric"]) || r["min_value"] !== undefined || r["max_value"] !== undefined) { const v = n(r["reading_1"]); if ((r["min_value"] !== undefined && v < n(r["min_value"])) || (r["max_value"] !== undefined && n(r["max_value"]) && v > n(r["max_value"]))) return "Rejected"; }
    else if (r["status"] === "Rejected") return "Rejected";
  }
  return "Accepted";
}
/** stock_controller.validate_inspection: inspection required before purchase/delivery, rejected inspection blocks. */
function qualityGateErrors(dt: string, d: Doc): string[] {
  const flag = dt === "Purchase Receipt" || dt === "Purchase Invoice" ? "inspection_required_before_purchase" : dt === "Delivery Note" || dt === "Sales Invoice" ? "inspection_required_before_delivery" : ""; if (!flag) return [];
  const e: string[] = [];
  for (const r of rows(d, "items")) {
    const it = adapter.get("Item", s(r["item_code"])); const qi = r["quality_inspection"] ? adapter.get("Quality Inspection", s(r["quality_inspection"])) : undefined;
    if (n(it?.[flag]) && !qi) e.push(`Row #${r["idx"] ?? 1}: Quality Inspection is required for Item ${r["item_code"]}`);
    else if (qi && n(qi.docstatus) !== 1) e.push(`Row #${r["idx"] ?? 1}: Quality Inspection ${qi.name} is not submitted for the item: ${r["item_code"]}`);
    else if (qi && qi["status"] === "Rejected") e.push(`Row #${r["idx"] ?? 1}: Quality Inspection ${qi.name} was rejected for item ${r["item_code"]}`);
    else if (qi && qi["item_code"] && qi["item_code"] !== r["item_code"]) e.push(`Row #${r["idx"] ?? 1}: Quality Inspection ${qi.name} is for a different item`);
  }
  return e;
}

// ───────────────────────── Support ─────────────────────────
const ISSUE_STATUSES = ["Open", "Replied", "On Hold", "Resolved", "Closed"];
/** issue.py: status transition with first-response / resolution / opening timestamps; validates customer & contact links. */
export function setIssueStatus(name: string, status: string, now = new Date().toISOString().slice(0, 19).replace("T", " ")): string[] {
  const i = adapter.get("Issue", name); if (!i) return ["not found"];
  if (!ISSUE_STATUSES.includes(status)) return [`Invalid status ${status}`];
  if (i["customer"] && !adapter.get("Customer", s(i["customer"]))) return [`Customer ${i["customer"]} not found`];
  const p: Record<string, unknown> = { status };
  if (status === "Replied" && !i["first_responded_on"]) p["first_responded_on"] = now;
  if (["Resolved", "Closed"].includes(status) && !i["resolution_date"]) p["resolution_date"] = now;
  if (status === "Open" && ["Resolved", "Closed"].includes(s(i["status"]))) { p["resolution_date"] = null; p["opening_date"] = now.slice(0, 10); }
  adapter.update("Issue", name, p);
  adapter.insertDoc("Comment", { name: `CMT-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, comment_type: "Info", reference_doctype: "Issue", reference_name: name, content: status, creation: now });
  return [];
}

// ───────────────────────── submit / cancel hooks ─────────────────────────
export function departmentSubmitErrors(dt: string, d: Doc): string[] {
  const e: string[] = [];
  if (dt === "Leave Allocation") {
    if (s(d["from_date"]) > s(d["to_date"])) e.push("To date cannot be before from date");
    const o = submitted("Leave Allocation").find((a) => a.name !== d.name && a["employee"] === d["employee"] && a["leave_type"] === d["leave_type"] && overlap(s(a["from_date"]), s(a["to_date"]), s(d["from_date"]), s(d["to_date"])));
    if (o) e.push(`${d["employee"]} already allocated for Leave Type ${d["leave_type"]} in this period (${o.name})`);
  }
  if (dt === "Leave Application") {
    if (!["Approved", "Rejected"].includes(s(d["status"]))) e.push("Only Leave Applications with status 'Approved' and 'Rejected' can be submitted");
    if (s(d["from_date"]) > s(d["to_date"])) e.push("To date cannot be before from date");
    const o = adapter.list("Leave Application").find((l) => l.name !== d.name && l["employee"] === d["employee"] && n(l.docstatus) < 2 && ["Open", "Approved"].includes(s(l["status"])) && overlap(s(l["from_date"]), s(l["to_date"]), s(d["from_date"]), s(d["to_date"])));
    if (o) e.push(`Employee ${d["employee"]} has already applied for ${o["leave_type"]} between ${o["from_date"]} and ${o["to_date"]} (${o.name})`);
    const lt = adapter.get("Leave Type", s(d["leave_type"]));
    if (d["status"] === "Approved" && !n(lt?.["is_lwp"]) && !n(lt?.["allow_negative"])) {
      const bal = leaveBalance(s(d["employee"]), s(d["leave_type"]), s(d["from_date"]));
      if (n(d["total_leave_days"] ?? days(s(d["from_date"]), s(d["to_date"]))) > bal) e.push(`There is not enough leave balance for Leave Type ${d["leave_type"]} (balance ${bal})`);
    }
  }
  if (dt === "Attendance") {
    const o = adapter.list("Attendance").find((a) => a.name !== d.name && a["employee"] === d["employee"] && a["attendance_date"] === d["attendance_date"] && n(a.docstatus) < 2);
    if (o) e.push(`Attendance for employee ${d["employee"]} is already marked for the date ${d["attendance_date"]}: ${o.name}`);
    const emp = adapter.get("Employee", s(d["employee"])); if (emp?.["date_of_joining"] && s(d["attendance_date"]) < s(emp["date_of_joining"])) e.push(`Attendance date ${d["attendance_date"]} can not be less than employee ${d["employee"]}'s joining date`);
  }
  if (dt === "Shift Assignment") {
    const o = submitted("Shift Assignment").find((a) => a.name !== d.name && a["employee"] === d["employee"] && a["status"] !== "Inactive" && a["shift_type"] === d["shift_type"] && overlap(s(a["start_date"]), s(a["end_date"]), s(d["start_date"]), s(d["end_date"])));
    if (o) e.push(`Employee ${d["employee"]} already has an active Shift ${d["shift_type"]}: ${o.name}`);
  }
  if (dt === "Payroll Entry" && !rows(d, "employees").length) e.push("No employees found for the mentioned criteria");
  if (dt === "Salary Structure" && !rows(d, "earnings").length) e.push("Salary Structure must have at least one earning component");
  if (dt === "Salary Structure Assignment") {
    const st = adapter.get("Salary Structure", s(d["salary_structure"])); if (!st || n(st.docstatus) !== 1) e.push(`Salary Structure ${d["salary_structure"]} must be submitted`);
    if (st && st["is_active"] === "No") e.push(`Salary Structure ${st.name} is not active`);
    if (submitted("Salary Structure Assignment").some((a) => a.name !== d.name && a["employee"] === d["employee"] && a["from_date"] === d["from_date"])) e.push(`Salary Structure Assignment for Employee ${d["employee"]} already exists`);
  }
  if (dt === "Expense Claim" && !["Approved", "Rejected"].includes(s(d["approval_status"]))) e.push("Approval Status must be 'Approved' or 'Rejected'");
  if (dt === "Employee Advance" && n(d["advance_amount"]) <= 0) e.push("Advance Amount must be greater than zero");
  if (dt === "Timesheet") {
    if (!rows(d, "time_logs").length) e.push("Timesheet must have at least one time log");
    for (const r of rows(d, "time_logs")) {
      if (n(r["hours"]) <= 0) e.push(`Row ${r["idx"] ?? 1}: Hours value must be greater than zero.`);
      const t = r["task"] ? adapter.get("Task", s(r["task"])) : undefined; if (t && r["project"] && t["project"] && t["project"] !== r["project"]) e.push(`Row ${r["idx"] ?? 1}: Task ${t.name} does not belong to Project ${r["project"]}`);
    }
  }
  if (dt === "BOM") {
    if (!rows(d, "items").length) e.push("Raw Materials cannot be blank.");
    for (const r of rows(d, "items")) { if (r["item_code"] === d["item"]) e.push(`BOM recursion: ${d["item"]} cannot be child of itself`); if (n(r["qty"]) <= 0) e.push(`Row ${r["idx"] ?? 1}: Quantity should be greater than zero`); }
  }
  if (dt === "Work Order") {
    const b = adapter.get("BOM", s(d["bom_no"]));
    if (!b || n(b.docstatus) !== 1) e.push(`BOM ${d["bom_no"] ?? ""} must be submitted`); else if (b["item"] !== d["production_item"]) e.push(`BOM ${b.name} does not belong to Item ${d["production_item"]}`);
    if (n(d["qty"]) <= 0) e.push("Quantity to Manufacture must be greater than 0.");
  }
  if (dt === "Stock Entry" && d["work_order"]) {
    const w = adapter.get("Work Order", s(d["work_order"])); const q = n(d["fg_completed_qty"]);
    if (!w || n(w.docstatus) !== 1) e.push(`Work Order ${d["work_order"]} must be submitted`);
    else if (d["purpose"] === "Manufacture" && n(w["produced_qty"]) + q > n(w["qty"])) e.push(`Cannot produce more than ${n(w["qty"]) - n(w["produced_qty"])} for Work Order ${w.name}`);
  }
  if (dt === "Quality Inspection") {
    if (!d["reference_type"] || !d["reference_name"]) e.push("Reference Type and Reference Name are mandatory");
    else { const ref = adapter.get(s(d["reference_type"]), s(d["reference_name"])); if (!ref) e.push(`${d["reference_type"]} ${d["reference_name"]} not found`); else if (d["item_code"] && !rows(ref, "items").some((r) => r["item_code"] === d["item_code"]) && ref["production_item"] !== d["item_code"]) e.push(`Item ${d["item_code"]} is not in ${d["reference_type"]} ${ref.name}`); }
  }
  e.push(...qualityGateErrors(dt, d));
  return e;
}

/** Patch merged into the submit patch (status the source sets on submit). */
export function departmentSubmitPatch(dt: string, d: Doc): Record<string, unknown> {
  if (dt === "Work Order") return { status: "Not Started", produced_qty: 0, material_transferred_for_manufacturing: 0 };
  if (dt === "Quality Inspection") return { status: rows(d, "readings").length ? inspectionStatus(d) : d["status"] || "Accepted" };
  if (dt === "Timesheet") return { status: "Submitted", total_hours: rows(d, "time_logs").reduce((t, r) => t + n(r["hours"]), 0) };
  if (dt === "Expense Claim") return { status: d["approval_status"] === "Rejected" ? "Rejected" : "Unpaid" };
  if (dt === "Employee Advance") return { status: "Unpaid" };
  return {};
}

/** on_submit (sign 1) / on_cancel (sign -1) side effects. */
export function departmentAfter(dt: string, d: Doc, sign: 1 | -1): void {
  if (dt === "Leave Allocation" || (dt === "Leave Application" && d["status"] === "Approved")) {
    if (sign === 1) { if (!adapter.get("Leave Ledger Entry", `LLE-${d.name}`)) ledger(d, dt, dt === "Leave Allocation" ? n(d["new_leaves_allocated"] ?? d["total_leaves_allocated"]) : -n(d["total_leave_days"] ?? days(s(d["from_date"]), s(d["to_date"]))), s(d["from_date"]), s(d["to_date"])); }
    else if (adapter.get("Leave Ledger Entry", `LLE-${d.name}`)) adapter.update("Leave Ledger Entry", `LLE-${d.name}`, { is_cancelled: 1 });
  }
  if (dt === "Leave Application" && d["status"] === "Approved") {
    // leave_application.py update_attendance: one "On Leave" Attendance per day
    for (let k = 0, t = days(s(d["from_date"]), s(d["to_date"])); k < t; k++) {
      const date = addDay(s(d["from_date"]), k), name = `HR-ATT-${d["employee"]}-${date}`;
      if (sign === 1 && !adapter.get("Attendance", name)) adapter.insertDoc("Attendance", { name, employee: d["employee"], employee_name: d["employee_name"], attendance_date: date, status: "On Leave", leave_type: d["leave_type"], leave_application: d.name, company: d["company"], docstatus: 1 });
      if (sign === -1 && adapter.get("Attendance", name)?.["leave_application"] === d.name) adapter.update("Attendance", name, { docstatus: 2 });
    }
  }
  if (dt === "Leave Application" && sign === -1) adapter.update(dt, d.name, { status: "Cancelled" });
  if (dt === "Timesheet") for (const r of rows(d, "time_logs")) {
    if (r["task"] && adapter.get("Task", s(r["task"]))) { const t = adapter.get("Task", s(r["task"]))!; adapter.update("Task", t.name, { actual_time: Math.max(0, n(t["actual_time"]) + sign * n(r["hours"])) }); }
    const p = s(r["project"] || d["parent_project"]); if (p && adapter.get("Project", p)) adapter.update("Project", p, { actual_time: Math.max(0, n(adapter.get("Project", p)!["actual_time"]) + sign * n(r["hours"])) });
  }
  if (dt === "Stock Entry" && d["work_order"]) {
    const w = adapter.get("Work Order", s(d["work_order"])); if (!w) return; const q = sign * n(d["fg_completed_qty"]);
    const p = d["purpose"] === "Manufacture" ? { produced_qty: Math.max(0, n(w["produced_qty"]) + q) } : { material_transferred_for_manufacturing: Math.max(0, n(w["material_transferred_for_manufacturing"]) + q) };
    adapter.update("Work Order", w.name, { ...p, status: woStatus({ ...w, ...p }) });
  }
  // salary_slips_submitted is set by submitPayrollSlips only after the batch accrual JE posts; a cancelled slip clears it
  if (dt === "Salary Slip" && d["payroll_entry"] && sign === -1) adapter.update("Payroll Entry", s(d["payroll_entry"]), { salary_slips_submitted: 0 });
}
/** Cancel guards: a Work Order with stock entries, a BOM used by an open Work Order. */
export function departmentCancelErrors(dt: string, name: string): string[] {
  if (dt === "Payroll Entry") { const j = payrollAccrual(name); if (j && n(j.docstatus) === 1) return [`Cancel the accrual Journal Entry ${j.name} before cancelling Payroll Entry ${name}`]; }
  if (dt === "Salary Slip") { const pe = s(adapter.get(dt, name)?.["payroll_entry"]); const j = pe ? payrollAccrual(pe) : undefined; if (j && n(j.docstatus) === 1) return [`Salary Slip ${name} is booked in accrual Journal Entry ${j.name}; cancel it first`]; }
  if (dt === "Work Order" && adapter.list("Stock Entry").some((x) => x["work_order"] === name && n(x.docstatus) === 1)) return [`Cannot cancel because submitted Stock Entry exists against Work Order ${name}`];
  if (dt === "BOM" && adapter.list("Work Order").some((x) => x["bom_no"] === name && n(x.docstatus) === 1)) return [`Cannot cancel BOM ${name}: it is linked with submitted Work Orders`];
  if (dt === "Leave Allocation") { const a = adapter.get(dt, name)!; const used = adapter.list("Leave Application").some((l) => l["employee"] === a["employee"] && l["leave_type"] === a["leave_type"] && n(l.docstatus) === 1 && l["status"] === "Approved" && overlap(s(a["from_date"]), s(a["to_date"]), s(l["from_date"]), s(l["to_date"]))); if (used) return [`Leave Allocation ${name} is linked with an approved Leave Application`]; }
  return [];
}

// ───────────────────────── Payroll Entry lifecycle (payroll_entry.py) ─────────────────────────
type Poster = (dt: string, name: string) => string[];
/** payroll_entry.py fill_employee_details / get_employees: active employees of the company matching branch/department/designation/grade. */
export function getPayrollEmployees(pe: Doc): Record<string, unknown> {
  const f = ["branch", "department", "designation", "grade"] as const;
  const emps = adapter.list("Employee").filter((e) => (e["status"] ?? "Active") === "Active" && (!pe["company"] || e["company"] === pe["company"]) && f.every((k) => !pe[k] || e[k] === pe[k])
    && (!pe["end_date"] || !e["date_of_joining"] || s(e["date_of_joining"]) <= s(pe["end_date"])) && (!e["relieving_date"] || !pe["start_date"] || s(e["relieving_date"]) >= s(pe["start_date"])));
  if (!emps.length) throw new Error("No employees found for the mentioned criteria");
  return { employees: emps.map((e, i) => ({ idx: i + 1, employee: e.name, employee_name: e["employee_name"], department: e["department"], designation: e["designation"] })), number_of_employees: emps.length };
}
/** Accrual JE title/remark in the user language (ERPNext stores _() text at creation). */
function accrualText(a: string, b: string) { const ar = typeof localStorage !== "undefined" && localStorage.getItem("digit-virtual-core:lang") !== "en"; return ar ? { title: `استحقاق الرواتب من ${a} إلى ${b}`, user_remark: `قيد استحقاق الرواتب من ${a} إلى ${b}` } : { title: `Accrual for salaries from ${a} to ${b}`, user_remark: `Accrual Journal Entry for salaries from ${a} to ${b}` }; }
/** Accrual Journal Entry linked to the Payroll Entry (accounts rows reference_type = Payroll Entry), excluding cancelled. */
export function payrollAccrual(peName: string): Doc | undefined {
  return adapter.list("Journal Entry").find((j) => n(j.docstatus) < 2 && rows(j, "accounts").some((r) => r["reference_type"] === "Payroll Entry" && r["reference_name"] === peName));
}
/** payroll_entry.py submit_salary_slips + make_accrual_jv_entry: submit every draft slip, then ONE accrual JE for the batch (idempotent on retry). */
export function submitPayrollSlips(peName: string, submit: Poster): { submitted: string[]; journal?: string; errors: string[] } {
  const pe = adapter.get("Payroll Entry", peName); const errors: string[] = []; const done: string[] = [];
  if (!pe || n(pe.docstatus) !== 1) return { submitted: done, errors: ["Payroll Entry must be submitted"] };
  const slips = adapter.list("Salary Slip").filter((x) => x["payroll_entry"] === peName && n(x.docstatus) < 2);
  if (!slips.length) return { submitted: done, errors: ["No salary slip found to submit for the above selected criteria OR salary slip already submitted"] };
  const abbr = s(adapter.get("Company", s(pe["company"]))?.["abbr"]);
  const payable = s(pe["payroll_payable_account"]), expense = [resolveName("Account", `Salary - ${abbr}`)].find((a) => adapter.get("Account", a)); // renamed masters resolve through the rename log
  if (!payable || !adapter.get("Account", payable)) errors.push(`Payroll Payable Account ${payable || ""} not found`);
  if (!expense) errors.push(`Please set account for Salary Component in company ${pe["company"]}`);
  if (!pe["cost_center"]) errors.push("Cost Center is mandatory");
  if (errors.length) return { submitted: done, errors };
  for (const ss of slips.filter((x) => n(x.docstatus) === 0)) { const e = submit("Salary Slip", ss.name); if (e.length) errors.push(`${ss.name}: ${e.join("; ")}`); else done.push(ss.name); }
  if (errors.length) return { submitted: done, errors };
  const all = adapter.list("Salary Slip").filter((x) => x["payroll_entry"] === peName && n(x.docstatus) === 1);
  let jv = payrollAccrual(peName);
  if (!jv) {
    const gross = Math.round(all.reduce((t, x) => t + n(x["gross_pay"]), 0) * 100) / 100, ded = Math.round(all.reduce((t, x) => t + n(x["total_deduction"]), 0) * 100) / 100;
    const ref = { reference_type: "Payroll Entry", reference_name: peName, cost_center: pe["cost_center"], ...(pe["project"] ? { project: pe["project"] } : {}) };
    const accounts = [{ idx: 1, account: expense, debit_in_account_currency: gross, credit_in_account_currency: 0, ...ref },
      { idx: 2, account: payable, debit_in_account_currency: 0, credit_in_account_currency: Math.round((gross - ded) * 100) / 100, ...ref },
      ...(ded ? [{ idx: 3, account: payable, debit_in_account_currency: 0, credit_in_account_currency: ded, ...ref, user_remark: "Deductions (component accounts not configured)" }] : [])];
    jv = adapter.insertDoc("Journal Entry", { voucher_type: "Journal Entry", company: pe["company"], posting_date: pe["posting_date"], ...accrualText(s(pe["start_date"]), s(pe["end_date"])), total_debit: gross, total_credit: gross, accounts, docstatus: 0 });
  }
  if (n(jv.docstatus) === 0) { const e = submit("Journal Entry", jv.name); if (e.length) return { submitted: done, journal: jv.name, errors: e }; }
  adapter.update("Payroll Entry", peName, { salary_slips_submitted: 1 });
  return { submitted: done, journal: jv.name, errors };
}

/** shift_assignment get_employee_shift: active submitted assignment covering `date`. */
export function activeShift(employee: string, date: string): string | undefined {
  return s(submitted("Shift Assignment").find((a) => a["employee"] === employee && a["status"] !== "Inactive" && s(a["start_date"]) <= date && date <= (s(a["end_date"]) || "9999"))?.["shift_type"]) || undefined;
}

/** Roster ShiftAssignmentDialog (hrms/roster) inserts a submitted Shift Assignment; same validation as the Desk form. */
export function rosterAssign(form: { employee: string; shift_type: string; start_date: string; end_date?: string; status?: string; company: string }, submit: Poster): { name?: string; errors: string[] } {
  const emp = adapter.get("Employee", form.employee); if (!emp) return { errors: [`Employee ${form.employee} not found`] };
  const name = `HR-SHA-${form.employee}-${form.start_date}-${form.shift_type}`.replace(/\s+/g, "-");
  if (adapter.get("Shift Assignment", name)) return { errors: [`Shift Assignment ${name} already exists`] };
  adapter.insertDoc("Shift Assignment", { name, docstatus: 0, status: "Active", ...form, employee_name: emp["employee_name"], department: emp["department"] });
  const errors = submit("Shift Assignment", name);
  if (errors.length) { adapter.remove("Shift Assignment", name); return { errors }; }
  return { name, errors: [] };
}
