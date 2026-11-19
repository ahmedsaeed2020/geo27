/**
 * APR-03 Smart Guide — port of digit_hr.api.guide.document for the same 14 reviewed HR DocTypes. The guide is shown next
 * to the FULL native form, never instead of it, and everything comes from the source:
 * - will_block_save: Frappe's server mandatory check (meta reqd + child-table reqd) on the form's current values;
 * - form_rules: fields whose requirement is a form expression (mandatory_depends_on), evaluated by the host as the native
 *   form does (the server never claims them);
 * - server_check: the source dry-runs the document's own before_validate + validate on the Frappe server. Controllers
 *   never run in this preview, so it is reported as "server_required" (never guessed as passing);
 * - facts: native values (leave balance by the HRMS ledger rule, approver, overlapping shift assignments, effective dates,
 *   linked applicant / offer / contract states, recorded payroll preflight);
 * - actions: save / submit / cancel / workflow transitions from permissions, docstatus and the active workflow, flagged
 *   with will_fail when the source already knows they will fail (never hidden).
 * Identity and state come from the saved record, never from the client values.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { evalDependsSafe } from "@/lib/expr";
import { activeWorkflow, canEditInState, transitionsFor } from "@/lib/workflow";
import { currentUser } from "@/lib/session";
import { t } from "@/i18n";
import { leaveBalances } from "@/plugins/digit_hr/leaveFacts";
import { _, can, PermissionError, R9ValidationError, requireApp, s, today } from "./core";

export const GUIDED: Record<string, { section: string; dry_run: boolean }> = {
  "Leave Application": { section: "03.1", dry_run: true }, "Shift Request": { section: "03.3", dry_run: true },
  "Expense Claim": { section: "04.5", dry_run: true }, "DIGIT HR Service Case": { section: "05.3", dry_run: true },
  "Payroll Entry": { section: "04.1", dry_run: false },
  "Employee Promotion": { section: "01.5", dry_run: true }, "Employee Transfer": { section: "01.5", dry_run: true },
  "DIGIT Employment Contract": { section: "01.6", dry_run: true }, "DIGIT Contract Amendment": { section: "01.6", dry_run: true },
  "DIGIT Document Renewal": { section: "01.6", dry_run: true }, "Job Offer": { section: "02.1", dry_run: true },
  "Employee Onboarding": { section: "02.2", dry_run: true }, "Attendance Request": { section: "03.2", dry_run: true },
  "Employee Advance": { section: "04.5", dry_run: true },
};
const LIFECYCLE_DATE: Record<string, string> = { "Employee Promotion": "promotion_date", "Employee Transfer": "transfer_date" };
const STATE_FIELDS = ["status", "approval_status", "case_status", "workflow_state"] as const;
const IDENTITY = ["doctype", "name", "docstatus", "owner", "creation", "modified", "modified_by", "amended_from"];
const NOVALUE = new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Button", "Fold", "Heading", "Image"]);
const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const n = (v: unknown) => Number(v) || 0;
const d10 = (v: unknown) => s(v).slice(0, 10);

export type Missing = { fieldname: string; label: string; table?: string; row?: number };
export type Fact = { key: string; state: "ok" | "blocked" | "warning" | "no_allocation" | "recorded" | "server_required"; value?: unknown; source?: string; [k: string]: unknown };
export type GuideAction = { action: "save" | "submit" | "cancel" | "workflow"; transition?: string; label?: string; next_state?: string; will_fail?: string };

/** BaseDocument._get_missing_mandatory_fields on the document and every child row (naming_series is set by autoname). */
function missing(dt: string, doc: Doc): Missing[] {
  const meta = cachedMeta(dt); if (!meta) return [];
  const label = (m: typeof meta, f: string) => { const df = m.fields.find((x) => x.fieldname === f); return df?.label ? t(df.label, m.name) : f; };
  const reqd = (m: typeof meta, d: Doc) => m.fields.filter((f) => f.fieldname && f.fieldname !== "naming_series" && Number(f.reqd ?? 0) && !NOVALUE.has(f.fieldtype) && empty(d[f.fieldname]));
  const out: Missing[] = reqd(meta, doc).map((f) => ({ fieldname: f.fieldname!, label: label(meta, f.fieldname!) }));
  for (const tf of meta.fields.filter((f) => f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect")) {
    const cm = tf.options ? cachedMeta(tf.options) : undefined; if (!cm) continue;
    ((doc[tf.fieldname!] as Doc[] | undefined) ?? []).forEach((row, i) => {
      for (const f of reqd(cm, row)) out.push({ fieldname: f.fieldname!, label: label(cm, f.fieldname!), table: tf.fieldname!, row: n(row["idx"]) || i + 1 });
    });
  }
  return out;
}
function formRules(dt: string, doc: Doc) {
  const meta = cachedMeta(dt);
  return (meta?.fields ?? []).filter((f) => f.mandatory_depends_on).map((f) => ({
    fieldname: f.fieldname!, label: f.label ? t(f.label, dt) : f.fieldname!, mandatory_if: f.mandatory_depends_on!,
    ...(f.depends_on ? { visible_if: f.depends_on } : {}),
    // host evaluation, exactly as the native form (frappe.ui.form.Layout) does
    required_now: evalDependsSafe(f.mandatory_depends_on, doc).value && (!f.depends_on || evalDependsSafe(f.depends_on, doc).value), filled: !empty(doc[f.fieldname!]),
  }));
}
/** digit_hr.api.approvals._flag_shift_overlaps for one request row. */
export function shiftOverlaps(employee: string, from: string, to: string, user = currentUser()): { blocked: boolean; blocking: string[] } {
  const hr = adapter.get("HR Settings", "HR Settings");
  if (hr && n(hr["allow_multiple_shift_assignments"])) return { blocked: false, blocking: [] };
  const hits = adapter.list("Shift Assignment").filter((a) => s(a["employee"]) === employee && n(a.docstatus) === 1 && s(a["status"]) === "Active"
    && d10(a["start_date"]) <= (to || from) && (!a["end_date"] || d10(a["end_date"]) >= from));
  return { blocked: hits.length > 0, blocking: hits.filter((a) => can("Shift Assignment", "read", a, user)).map((a) => a.name).sort() };
}
function facts(dt: string, doc: Doc, saved: Doc | undefined, user: string): Fact[] {
  const out: Fact[] = [];
  if (dt === "Leave Application" && doc["employee"] && doc["leave_type"] && doc["from_date"]) {
    // hrms get_leave_details: server-side (no row permission), approved leaves deducted, open requests reported apart
    const on = d10(doc["from_date"]);
    const row = leaveBalances(adapter.list("Leave Allocation").filter((a) => s(a["employee"]) === s(doc["employee"]) && s(a["leave_type"]) === s(doc["leave_type"])),
      adapter.list("Leave Application").filter((l) => s(l.name) !== s(saved?.name)), on)[0];
    out.push({ key: "leave_balance", source: "hrms.get_leave_details", as_of: on, ...(row ? { state: "ok", remaining: row.balance, allocated: row.allocated, taken: row.taken, pending_approval: row.pending } : { state: "no_allocation" }) } as Fact);
    if (doc["leave_approver"]) out.push({ key: "leave_approver", state: "ok", value: doc["leave_approver"], source: "DIGIT HR approver (employee / department)" });
  }
  if (dt === "Shift Request" && doc["employee"] && doc["from_date"]) {
    const r = shiftOverlaps(s(doc["employee"]), d10(doc["from_date"]), d10(doc["to_date"] || doc["from_date"]), user);
    out.push({ key: "shift_overlap", state: r.blocked ? "blocked" : "ok", blocking_records: r.blocking, source: "DIGIT HR Shift Assignment overlap rule (HR Settings «allow multiple shift assignments»)" });
  }
  if (dt === "Expense Claim") for (const k of ["expense_approver", "currency", "exchange_rate", "cost_center"]) if (!empty(doc[k])) out.push({ key: k, state: "ok", value: doc[k] });
  const lf = LIFECYCLE_DATE[dt];
  if (lf && doc[lf]) out.push({ key: "effective_date", state: d10(doc[lf]) <= today() ? "ok" : "blocked", value: d10(doc[lf]), source: "DIGIT HR: applied to the Employee record only on submit, and not before this date" });
  if (dt === "Job Offer" && doc["job_applicant"]) {
    const a = adapter.get("Job Applicant", s(doc["job_applicant"]));
    if (a && can("Job Applicant", "read", a, user) && a["status"]) out.push({ key: "applicant_status", state: "ok", value: a["status"], record: ["Job Applicant", a.name] });
  }
  if (dt === "Employee Onboarding" && doc["job_offer"]) {
    const o = adapter.get("Job Offer", s(doc["job_offer"]));
    if (o && can("Job Offer", "read", o, user)) out.push({ key: "job_offer_status", state: s(o["status"]) === "Accepted" ? "ok" : "blocked", value: o["status"], record: ["Job Offer", o.name] });
  }
  if (dt === "Employee Advance" && doc["employee"]) out.push({ key: "pending_advance_amount", state: "ok", value: doc["pending_amount"], source: "DIGIT HR: submitted advances of this employee not yet paid (computed by the document itself)" });
  if (dt === "DIGIT Employment Contract" && doc["end_date"]) {
    const days = Math.round((Date.parse(`${d10(doc["end_date"])}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 864e5);
    out.push({ key: "contract_end", state: days < 0 ? "blocked" : days > 60 ? "ok" : "warning", value: d10(doc["end_date"]), days_left: days });
  }
  if (dt === "DIGIT Contract Amendment" && doc["contract"]) {
    const c = adapter.get("DIGIT Employment Contract", s(doc["contract"]));
    if (c && can("DIGIT Employment Contract", "read", c, user)) out.push({ key: "amended_contract", state: "ok", value: c.name, contract_status: c["contract_status"], end_date: d10(c["end_date"]), record: ["DIGIT Employment Contract", c.name] });
  }
  if (dt === "Payroll Entry" && saved) {
    // ADV-11 preflight runs on the Frappe server; the latest recorded result (DIGIT Payroll Preflight) is shown when readable
    const latest = adapter.list("DIGIT Payroll Preflight").filter((p) => s(p["payroll_entry"]) === saved.name && can("DIGIT Payroll Preflight", "read", p, user))
      .sort((a, b) => s(b["creation"]).localeCompare(s(a["creation"])))[0];
    out.push({ key: "payroll_readiness", source: "ADV-11 preflight", ...(latest ? { state: "recorded", value: latest["preflight_status"], latest_record: latest.name, checked_on: latest["checked_on"] } : { state: "server_required" }) } as Fact);
  }
  return out;
}
function actions(dt: string, saved: Doc | undefined, user: string): GuideAction[] {
  const meta = cachedMeta(dt);
  if (!saved) return can(dt, "create", undefined, user) ? [{ action: "save" }] : [];
  const out: GuideAction[] = [];
  const wf = activeWorkflow(dt);
  if (wf) {
    out.push(...transitionsFor(wf, saved, user).map((x) => ({ action: "workflow" as const, transition: x.action, label: t(x.action), next_state: x.next_state })));
    if (n(saved.docstatus) === 0 && can(dt, "write", saved, user) && canEditInState(wf, saved, user)) out.push({ action: "save" });
    return out;
  }
  if (n(saved.docstatus) === 0 && can(dt, "write", saved, user)) out.push({ action: "save" });
  if (meta?.is_submittable && n(saved.docstatus) === 0 && can(dt, "submit", saved, user)) out.push({ action: "submit" });
  if (meta?.is_submittable && n(saved.docstatus) === 1 && can(dt, "cancel", saved, user)) out.push({ action: "cancel" });
  return out;
}

export function guideDocument(doctype: string, name?: string, values?: Record<string, unknown>, user = currentUser()) {
  requireApp(user);
  const spec = GUIDED[doctype];
  if (!spec) throw new R9ValidationError(_("Invalid value for {0}", "doctype"));
  const vals: Record<string, unknown> = { ...(values ?? {}) };
  for (const k of IDENTITY) delete vals[k];
  for (const k of Object.keys(vals)) if (k.startsWith("__")) delete vals[k];
  let saved: Doc | undefined; let editable: boolean;
  if (name) {
    saved = adapter.get(doctype, name);
    if (!saved || !can(doctype, "read", saved, user)) throw new PermissionError(_("You do not have permission to view this document"));
    const wf = activeWorkflow(doctype);
    editable = n(saved.docstatus) === 0 && can(doctype, "write", saved, user) && (!wf || canEditInState(wf, saved, user));
  } else {
    if (!can(doctype, "create", undefined, user)) throw new PermissionError(_("Not permitted"));
    editable = true;
  }
  const meta = cachedMeta(doctype);
  const has = (f: string) => !!meta?.fields.some((x) => x.fieldname === f);
  const current: Doc = editable ? ({ ...(saved ?? {}), ...vals } as Doc) : (saved as Doc);
  const out = {
    contract: "digit-hr-guide", version: 1, doctype, name: saved?.name ?? null, section: spec.section, docstatus: n(saved?.docstatus), editable,
    state: Object.fromEntries(STATE_FIELDS.filter((f) => has(f) && saved?.[f]).map((f) => [f, saved![f]])),
    form_rules: formRules(doctype, current), actions: actions(doctype, saved, user),
    readback: saved ? { modified: s(saved["modified"]), docstatus: n(saved.docstatus), ...Object.fromEntries(STATE_FIELDS.filter(has).map((f) => [f, saved![f] ?? null])) } : undefined,
    server_check: editable ? { state: spec.dry_run ? "server_required" as const : "not_applicable" as const } : undefined,
    will_block_save: editable ? missing(doctype, current) : undefined,
    facts: facts(doctype, current, saved, user),
  };
  const blocked = out.facts.filter((f) => f.state === "blocked").map((f) => f.key);
  for (const a of out.actions) {
    if (a.action === "submit" && blocked.length) a.will_fail = blocked[0]!;
    if ((a.action === "save" || a.action === "submit") && out.will_block_save?.length) a.will_fail ??= "missing_fields";
  }
  return out;
}
export type Guide = ReturnType<typeof guideDocument>;
