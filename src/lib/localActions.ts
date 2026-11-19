/**
 * Local (virtual) implementations of source form buttons whose source runs a server method.
 * Keyed "<DocType>::<button label>" exactly as extracted into form_actions.json; anything not listed stays server-dependent.
 */
import { adapter, type Doc } from "./adapter";
const isAr = () => typeof localStorage !== "undefined" && localStorage.getItem("digit-virtual-core:lang") !== "en";
import { makeSchedules, postDepreciation, disposeAsset, restoreAsset } from "./assets";
import "./assetDocs";
import { makeInvoices } from "./openingInvoices";
import { getEntries, makeRevaluationJournal } from "./revaluation";
import { setOrderStatus, updateItems } from "./selling";
import { refreshPrev, submit } from "./posting";
import { getPayrollEmployees, createSalarySlips, submitPayrollSlips, markAttendanceFromCheckins, activeShift, saveTask, makeWorkOrderEntry, setIssueStatus } from "./departments";
import { reserveStock, unreserveStock } from "./stock";
import { makeReverseJournal } from "./journalReverse";
import { blockInvoice, changeReleaseDate, unblockInvoice } from "./heldInvoices";
import { autoEmailContent, autoEmailFile, sendAutoEmail } from "./autoEmailReport";
import { download, exportMatrix, toXlsx } from "./reportWorkbench";
import { unreconcileTransaction, getPaymentEntries, updateClearanceDate, getUnreconciledEntries, allocateEntries, reconcile } from "./reconciliation";

const today = () => new Date().toISOString().slice(0, 10);
export type LocalResult = { message: string; open?: [string, string]; patch?: Record<string, unknown> };
export type LocalAction = (d: Doc, ask: (q: string) => string | null) => LocalResult;

const ensureSchedule = (d: Doc) => { if (!adapter.list("Asset Depreciation Schedule").some((s) => s["asset"] === d.name && Number(s.docstatus) !== 2)) makeSchedules(d.name); };

export const LOCAL_ACTIONS: Record<string, LocalAction> = {
  // asset.js "Depreciation Entry" → depreciation.py make_depreciation_entry for due rows
  "Asset::Depreciation Entry": (d) => { ensureSchedule(d); const j = postDepreciation(d.name, today()); return { message: j.length ? `Journal Entry ${j.join(", ")}` : "No depreciation due", ...(j.length ? { open: ["Journal Entry", j[j.length - 1]!] as [string, string] } : {}) }; },
  "Asset::Scrap Asset": (d) => { if (d["calculate_depreciation"]) ensureSchedule(d); const r = disposeAsset(d.name, today(), 0); return { message: `Journal Entry ${r.journal}`, open: ["Journal Entry", r.journal] }; },
  "Asset::Sell Asset": (d, ask) => {
    const v = ask("Selling Amount"); if (v === null) return { message: "" };
    const amt = Number(v); if (!(amt > 0)) throw new Error("Selling Amount must be greater than 0");
    if (d["calculate_depreciation"]) ensureSchedule(d);
    const r = disposeAsset(d.name, today(), amt); return { message: `Journal Entry ${r.journal}`, open: ["Journal Entry", r.journal] };
  },
  // asset.js "Transfer Asset" → make_asset_movement draft (purpose Transfer, current location/custodian as source)
  "Asset::Transfer Asset": (d) => { const m = adapter.insertDoc("Asset Movement", { company: d["company"], purpose: "Transfer", transaction_date: new Date().toISOString().slice(0, 19).replace("T", " "), assets: [{ idx: 1, asset: d.name, asset_name: d["asset_name"], source_location: d["location"] ?? "", from_employee: d["custodian"] ?? "" }], docstatus: 0 }); return { message: `Asset Movement ${m.name}`, open: ["Asset Movement", m.name] }; },
  // asset.js "Capitalize Asset" (draft Composite Asset) → Asset Capitalization with target_asset
  "Asset::Capitalize Asset": (d) => { const c = adapter.insertDoc("Asset Capitalization", { company: d["company"], target_asset: d.name, target_asset_name: d["asset_name"], target_item_code: d["item_code"], posting_date: today(), stock_items: [], asset_items: [], service_items: [], docstatus: 0 }); return { message: `Asset Capitalization ${c.name}`, open: ["Asset Capitalization", c.name] }; },
  // exchange_rate_revaluation.js Create > Journal Entries / Reversal Journal Entries → make_jv_for_revaluation (draft JE)
  "Exchange Rate Revaluation::Journal Entries": (d) => { const j = makeRevaluationJournal(d); return { message: `Journal Entry ${j}`, open: ["Journal Entry", j] }; },
  "Exchange Rate Revaluation::Reversal Journal Entries": (d) => { const j = makeRevaluationJournal(d, true); return { message: `Journal Entry ${j}`, open: ["Journal Entry", j] }; },
  "Bank Transaction::Unreconcile Transaction": (d) => { unreconcileTransaction(d.name); return { message: "Bank Transaction unreconciled" }; },
  // single tools: act on the unsaved form values and hand back a patch
  "Bank Clearance::Get Payment Entries": (d) => { const p = getPaymentEntries(d); return { message: `${(p["payment_entries"] as unknown[]).length} entries`, patch: p }; },
  "Bank Clearance::Update Clearance Date": (d) => { const k = updateClearanceDate(d); return { message: k ? "Clearance Date updated" : "Clearance Date not mentioned", patch: getPaymentEntries(d) }; },
  "Payment Reconciliation::Get Unreconciled Entries": (d) => ({ message: "", patch: getUnreconciledEntries(d) }),
  "Payment Reconciliation::Allocate": (d) => ({ message: "", patch: allocateEntries(d) }),
  "Payment Reconciliation::Reconcile": (d) => { const r = reconcile(d); return { message: "Successfully Reconciled", patch: r.patch }; },
  // opening_invoice_creation_tool.js set_primary_action "Create Invoices" → make_invoices
  "Opening Invoice Creation Tool::Create Invoices": (d) => { const r = makeInvoices(d); return { message: `${r.created.length} invoice(s) created: ${r.created.join(", ")}`, patch: { invoices: [] } }; },
  // sales_order.js / purchase_order.js Status group → update_status; Hold asks for a reason (frappe.desk.form.utils.add_comment)
  ...Object.fromEntries(["Sales Order", "Purchase Order"].flatMap((dt) => ["Hold", "Resume", "Close", "Re-open"].map((a) => [`${dt}::${a}`, ((d: Doc, ask: (q: string) => string | null) => {
    const reason = a === "Hold" ? ask("Reason for Hold") : undefined; if (a === "Hold" && reason === null) return { message: "" };
    return { message: `Status: ${setOrderStatus(dt, d.name, a, refreshPrev, reason ?? undefined)}` };
  }) as LocalAction]))),
  // sales_order.js / purchase_order.js "Update Items" → update_child_qty_rate (qty or qty@rate per row, ";" separated)
  ...Object.fromEntries(["Sales Order", "Purchase Order"].map((dt) => [`${dt}::Update Items`, ((d: Doc, ask: (q: string) => string | null) => {
    const cur = ((d["items"] as Doc[] | undefined) ?? []).map((r) => `${r["qty"]}@${r["rate"]}`).join("; ");
    const v = ask(`Update Items: quantity@rate per row, separated by ; (current: ${cur})`); if (v === null) return { message: "" };
    return { message: `${updateItems(dt, d.name, v, refreshPrev)} row(s) updated` };
  }) as LocalAction])),
  // sales_order.js Stock Reservation group → create / cancel_stock_reservation_entries; "Reserved Stock" opens the entries
  "Sales Order::Reserve": (d) => { const m = reserveStock(d.name); return { message: `Stock Reservation Entry ${m.join(", ")}` }; },
  "Sales Order::Unreserve": (d) => ({ message: `${unreserveStock(d.name)} Stock Reservation Entry cancelled` }),
  "Sales Order::Reserved Stock": (d) => { const s = adapter.list("Stock Reservation Entry").filter((x) => x["voucher_no"] === d.name && Number(x["docstatus"]) === 1); if (!s.length) throw new Error(`No reserved stock for Sales Order ${d.name}`); return { message: s.map((x) => `${x["item_code"]}: ${x["reserved_qty"]} (${x["status"]})`).join(", "), open: ["Stock Reservation Entry", s[0]!.name] }; },
  // material_request.js Stop / Re-open → update_status
  "Material Request::Stop": (d) => ({ message: `Status: ${setOrderStatus("Material Request", d.name, "Stop", refreshPrev)}` }),
  "Material Request::Re-open": (d) => ({ message: `Status: ${setOrderStatus("Material Request", d.name, "Re-open", refreshPrev)}` }),
  "Asset::Restore Asset": (d) => { restoreAsset(d.name); return { message: "Asset restored" }; },
  // journal_entry.js "Reverse Journal Entry" → make_reverse_journal_entry: a draft with debits/credits swapped and reversal_of set
  "Journal Entry::Reverse Journal Entry": (d) => { const j = makeReverseJournal(d.name); return { message: `Journal Entry ${j}`, open: ["Journal Entry", j] }; },
  // purchase_invoice.js Hold Invoice dialog → block_invoice / unblock_invoice / change_release_date
  "Purchase Invoice::Block Invoice": (d, ask) => {
    const reason = ask("Reason For Putting On Hold"); if (reason === null) return { message: "" };
    const release = ask("Release Date (YYYY-MM-DD, leave empty to hold until released)"); if (release === null) return { message: "" };
    blockInvoice(d.name, reason, release); return { message: "Invoice put on hold" };
  },
  "Purchase Invoice::Unblock Invoice": (d) => { unblockInvoice(d.name); return { message: "Invoice released" }; },
  "Purchase Invoice::Change Release Date": (d, ask) => {
    const release = ask("Release Date (YYYY-MM-DD)"); if (release === null) return { message: "" };
    changeReleaseDate(d.name, release); return { message: "Release date updated" };
  },
  // auto_email_report.js "Download" / "Send Now" (research topic Export Options: scheduled report delivery) — autoEmailReport.ts
  "Auto Email Report::Download": (d) => {
    const c = autoEmailContent(d); if (!c.ok) throw new Error(c.reason);
    if (String(d["format"] ?? "") === "XLSX") {
      const base = String(d["report"] ?? "report");
      void toXlsx(exportMatrix(c.columns, c.rows, { includeFilters: true, appliedFilters: c.filters }), base.slice(0, 31), c.columns.map((x) => (x.fieldtype === "Data" || x.fieldtype === "Link" ? 160 : 110)))
        .then((bytes) => download(`${base}.xlsx`, bytes as BlobPart, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
      return { message: `${c.rows.length} rows · ${base}.xlsx` };
    }
    const f = autoEmailFile(d, c); download(f.name, f.data, f.mime); return { message: `${c.rows.length} rows · ${f.name}` };
  },
  "Auto Email Report::Send Now": (d) => { const r = sendAutoEmail(d); if (!r.ok) throw new Error(r.reason); return { message: r.message }; },
};
export const localActionFor = (dt: string, label: string) => LOCAL_ACTIONS[`${dt}::${label}`];

/** In-form Button fields with a local port, keyed "<DocType>::<fieldname>"; returns a patch for the form. */
export const LOCAL_FIELD_BUTTONS: Record<string, (d: Doc) => Record<string, unknown>> = {
  "Exchange Rate Revaluation::get_entries": (d) => getEntries(d),
};

/** Primary actions set in source JS via frm.page.set_primary_action (not add_custom_button), keyed by DocType. */
export const LOCAL_PRIMARY: Record<string, string> = { "Opening Invoice Creation Tool": "Create Invoices" };

// ───────────── Department document actions (HRMS, Projects, Manufacturing, Quality, Support) ─────────────
const fail = (e: string[]) => { if (e.length) throw new Error(e.join("\n")); };
const num = (v: unknown) => Number(v) || 0;
/** Sets an approval field then submits through posting.ts (leave_application.js / expense_claim.js approval flow). */
const approveSubmit = (dt: string, field: string, value: string): LocalAction => (d) => {
  const prev = d[field]; adapter.update(dt, d.name, { [field]: value });
  const e = submit(dt, d.name); if (e.length) { adapter.update(dt, d.name, { [field]: prev }); fail(e); }
  return { message: `${dt} ${d.name}: ${value}` };
};
function DEPARTMENT_ACTIONS(): Record<string, LocalAction> {
  return {
    "Leave Application::Approve": approveSubmit("Leave Application", "status", "Approved"),
    "Leave Application::Reject": approveSubmit("Leave Application", "status", "Rejected"),
    "Expense Claim::Approve": approveSubmit("Expense Claim", "approval_status", "Approved"),
    "Expense Claim::Reject": approveSubmit("Expense Claim", "approval_status", "Rejected"),
    // payroll_entry.js buttons → payroll_entry.py fill_employee_details / create_salary_slips / submit_salary_slips
    "Payroll Entry::Get Employees": (d) => { const p = getPayrollEmployees(d); return { message: `${p["number_of_employees"]} employee(s)`, patch: p }; },
    "Payroll Entry::Create Salary Slips": (d) => { const r = createSalarySlips(d.name); if (!r.created.length) fail(r.errors.length ? r.errors : ["Salary Slips already created"]); return { message: `${isAr() ? `تم إنشاء ${r.created.length} من قسائم الرواتب` : `${r.created.length} Salary Slip(s) created`}${r.errors.length ? ` — ${r.errors.join("; ")}` : ""}` }; },
    "Payroll Entry::Submit Salary Slip": (d) => { const r = submitPayrollSlips(d.name, submit); fail(r.errors); return { message: isAr() ? `تم اعتماد ${r.submitted.length} من قسائم الرواتب · قيد اليومية ${r.journal}` : `${r.submitted.length} Salary Slip(s) submitted · Journal Entry ${r.journal}`, ...(r.journal ? { open: ["Journal Entry", r.journal] as [string, string] } : {}) }; },
    // employee_checkin.js "Fetch Shift" → fetch_shift; shift_type.js "Mark Attendance" → process_auto_attendance (one explicit date)
    "Employee Checkin::Fetch Shift": (d) => { const sh = activeShift(String(d["employee"] ?? ""), String(d["time"] ?? "").slice(0, 10)); if (!sh) throw new Error(`No shift assigned to ${d["employee"]} on ${String(d["time"] ?? "").slice(0, 10)}`); return { message: `Shift ${sh}`, patch: { shift: sh } }; },
    "Shift Type::Mark Attendance": (d, ask) => { const dt = ask("Attendance Date (YYYY-MM-DD)"); if (dt === null) return { message: "" }; if (!/^\d{4}-\d{2}-\d{2}$/.test(dt)) throw new Error("Invalid date"); const m = markAttendanceFromCheckins(d.name, dt, ""); return { message: `${m.length} Attendance marked`, ...(m.length ? { open: ["Attendance", m[0]!] as [string, string] } : {}) }; },
    // task.js status changes go through task.py validate (dependencies) and project.update_percent_complete
    ...Object.fromEntries(["Working", "Pending Review", "Completed", "Cancelled", "Open"].map((st) => [`Task::${st}`, ((d: Doc) => { fail(saveTask(d.name, { status: st })); return { message: `Status: ${st}` }; }) as LocalAction])),
    "Project::Set Project Status": (d, ask) => { const st = ask("Status (Open / Completed / Cancelled)"); if (st === null) return { message: "" }; if (!["Open", "Completed", "Cancelled"].includes(st.trim())) throw new Error("Status must be Open, Completed or Cancelled"); adapter.update("Project", d.name, { status: st.trim() }); return { message: `Status: ${st.trim()}` }; },
    // work_order.js Start / Finish → make_stock_entry; Status group → stop_unstop / close
    "Work Order::Start": (d) => { const q = num(d["qty"]) - num(d["material_transferred_for_manufacturing"]); if (q <= 0) throw new Error("Materials already transferred"); const r = makeWorkOrderEntry(d.name, "Material Transfer for Manufacture", q); if (Array.isArray(r)) fail(r); return { message: `Stock Entry ${r}`, open: ["Stock Entry", r as string] }; },
    "Work Order::Finish": (d) => { const q = Math.min(num(d["qty"]), num(d["material_transferred_for_manufacturing"]) || num(d["qty"])) - num(d["produced_qty"]); if (q <= 0) throw new Error("Nothing left to manufacture"); const r = makeWorkOrderEntry(d.name, "Manufacture", q); if (Array.isArray(r)) fail(r); return { message: `Stock Entry ${r}`, open: ["Stock Entry", r as string] }; },
    "Work Order::Stop": (d) => { adapter.update("Work Order", d.name, { status: "Stopped" }); return { message: "Status: Stopped" }; },
    "Work Order::Re-open": (d) => { adapter.update("Work Order", d.name, { status: num(d["produced_qty"]) >= num(d["qty"]) ? "Completed" : num(d["material_transferred_for_manufacturing"]) || num(d["produced_qty"]) ? "In Process" : "Not Started" }); return { message: "Re-opened" }; },
    "Work Order::Close": (d) => { adapter.update("Work Order", d.name, { status: "Closed" }); return { message: "Status: Closed" }; },
    // issue.js Close / Reopen (+ Replied / Resolved status set through the same issue.py timestamp rules)
    "Issue::Close": (d) => { fail(setIssueStatus(d.name, "Closed")); return { message: "Status: Closed" }; },
    "Issue::Reopen": (d) => { fail(setIssueStatus(d.name, "Open")); return { message: "Status: Open" }; },
    "Issue::Replied": (d) => { fail(setIssueStatus(d.name, "Replied")); return { message: "Status: Replied" }; },
    "Issue::Resolved": (d) => { fail(setIssueStatus(d.name, "Resolved")); return { message: "Status: Resolved" }; },
    // quality_inspection: navigate back to the inspected transaction
    "Quality Inspection::Open Reference": (d) => { if (!d["reference_type"] || !d["reference_name"] || !adapter.get(String(d["reference_type"]), String(d["reference_name"]))) throw new Error(`${d["reference_type"] ?? ""} ${d["reference_name"] ?? ""} not found`); return { message: "", open: [String(d["reference_type"]), String(d["reference_name"])] }; },
  };
}

/** Eligibility (docstatus / status) for every local action; actions without an entry are always eligible. Mirrors the source refresh() conditions. */
const ds = (d: Doc) => num(d.docstatus); const st = (d: Doc) => String(d["status"] ?? "");
export const LOCAL_WHEN: Record<string, (d: Doc) => boolean> = {
  "Leave Application::Approve": (d) => ds(d) === 0 && !d["__islocal"] && ["Open", ""].includes(st(d)),
  "Leave Application::Reject": (d) => ds(d) === 0 && !d["__islocal"] && ["Open", ""].includes(st(d)),
  "Expense Claim::Approve": (d) => ds(d) === 0 && !d["__islocal"] && !["Approved", "Rejected"].includes(String(d["approval_status"] ?? "")),
  "Expense Claim::Reject": (d) => ds(d) === 0 && !d["__islocal"] && !["Approved", "Rejected"].includes(String(d["approval_status"] ?? "")),
  "Payroll Entry::Get Employees": (d) => ds(d) === 0,
  "Payroll Entry::Create Salary Slips": (d) => ds(d) === 1 && !num(d["salary_slips_created"]),
  "Payroll Entry::Submit Salary Slip": (d) => ds(d) === 1 && !!num(d["salary_slips_created"]) && !num(d["salary_slips_submitted"]),
  "Employee Checkin::Fetch Shift": (d) => !!d["employee"] && !!d["time"],
  ...Object.fromEntries(["Working", "Pending Review", "Completed", "Cancelled"].map((x) => [`Task::${x}`, (d: Doc) => !d["__islocal"] && !["Completed", "Cancelled", x].includes(st(d))])),
  "Task::Open": (d) => ["Completed", "Cancelled"].includes(st(d)),
  "Project::Set Project Status": (d) => !d["__islocal"],
  "Work Order::Start": (d) => ds(d) === 1 && !["Stopped", "Closed", "Completed"].includes(st(d)) && num(d["material_transferred_for_manufacturing"]) < num(d["qty"]),
  "Work Order::Finish": (d) => ds(d) === 1 && ["In Process"].includes(st(d)) && num(d["produced_qty"]) < num(d["qty"]),
  "Work Order::Stop": (d) => ds(d) === 1 && ["Not Started", "In Process"].includes(st(d)),
  "Work Order::Re-open": (d) => ds(d) === 1 && st(d) === "Stopped",
  "Work Order::Close": (d) => ds(d) === 1 && !["Closed", "Completed"].includes(st(d)),
  "Issue::Close": (d) => !d["__islocal"] && !["Closed"].includes(st(d)),
  "Issue::Reopen": (d) => ["Resolved", "Closed"].includes(st(d)),
  "Issue::Replied": (d) => ["Open", "On Hold"].includes(st(d)) && !d["__islocal"],
  "Issue::Resolved": (d) => ["Open", "Replied", "On Hold"].includes(st(d)) && !d["__islocal"],
  "Quality Inspection::Open Reference": (d) => !!d["reference_name"],
};
/** Local buttons with no add_custom_button in source JS (approval is a status field / workflow there), grouped for the toolbar. */
export const LOCAL_EXTRA: Record<string, { label: string; group?: string; primary?: boolean }[]> = {
  "Leave Application": [{ label: "Approve", primary: true }, { label: "Reject" }],
  "Expense Claim": [{ label: "Approve", primary: true }, { label: "Reject" }],
  Task: ["Working", "Pending Review", "Completed", "Cancelled", "Open"].map((label) => ({ label, group: "Set Status" })),
  Issue: [{ label: "Replied", group: "Status" }, { label: "Resolved", group: "Status" }],
  "Quality Inspection": [{ label: "Open Reference" }],
};
/** Eligibility of a local action: its LOCAL_WHEN rule, else the source button conditions (`fallback`, e.g. asset.js shows
 *  Restore Asset only when status is Scrapped), so a ported button never appears where the source form hides it. */
export const localWhen = (dt: string, label: string, d: Doc, fallback: (d: Doc) => boolean = () => true) => (LOCAL_WHEN[`${dt}::${label}`] ?? fallback)(d);
Object.assign(LOCAL_ACTIONS, DEPARTMENT_ACTIONS());
