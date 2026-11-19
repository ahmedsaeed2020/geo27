/**
 * Expands ./schema.ts into the app's DocType JSON, Before Save rules (client condition + Python twin), approval
 * workflows, section placement, print formats and Arabic labels. Pure data: importing this module never touches the store.
 */
import type { PluginManifest, PrintFormat, ServerScript, Workflow } from "@/plugins/types";
import { ENTITIES, R10_CUSTOM_FIELDS, R10_OWNED_FIELDS, type EntitySpec } from "./schema";
import { sectionPerms, approversOf, requestersOf } from "./roles";
import { PRINT_KIT } from "../product/prints";

type F = Record<string, unknown>;
type DT = NonNullable<PluginManifest["doctypes"]>[number];

const UPPER: Record<string, string> = { gosi: "GOSI", mol: "MOL", cr: "CR", vat: "VAT", id: "ID", sla: "SLA", wps: "WPS", eos: "EOS", url: "URL", mfa: "MFA", hrms: "HRMS", hr: "HR", ip: "IP", pct: "%", no: "No.", en: "(English)", ar: "(Arabic)", qiwa: "Qiwa", m: "(m)", last4: "Last 4 Digits" };
/** English label from a fieldname (digit_ prefix dropped; acronyms kept upper case). */
export function labelOf(fieldname: string): string {
  return fieldname.replace(/^digit_/, "").split("_").map((w) => UPPER[w] ?? (w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

const NUMERIC = new Set(["Int", "Float", "Currency", "Percent"]);
const DATEISH = new Set(["Date", "Datetime"]);
const LONG = new Set(["Small Text", "Text", "Long Text", "Table", "Table MultiSelect", "Attach"]);
const TOKEN = /^([a-z0-9_]+)(\*)?(?::([A-Za-z ]*))?(?:>([^=~]+))?(?:=([^~]*))?(?:~(.+))?$/;

export interface ParsedFields { fields: F[]; ar: Record<string, string>; options: string[] }
const MACRO_AR: Record<string, string> = { Employee: "الموظف", "Employee Name": "اسم الموظف", Company: "الشركة", Department: "الإدارة", Branch: "الفرع", "From Date": "من تاريخ", "To Date": "إلى تاريخ" };

/** Parse one field spec string (grammar in ./schema.ts). */
export function parseFields(spec: string, child = false): ParsedFields {
  const fields: F[] = []; const ar: Record<string, string> = {}; const options: string[] = [];
  let cb = 0, sb = 0, lastEmpty = false, listed = 0;
  const has = (n: string) => fields.find((f) => f["fieldname"] === n);
  const push = (f: F) => {
    if (has(String(f["fieldname"]))) return;
    const t = String(f["fieldtype"] ?? "Data");
    if (!/Break$/.test(t) && !LONG.has(t) && !f["fetch_from"] && listed < (child ? 5 : 4) && !f["hidden"]) { f["in_list_view"] = 1; listed++; }
    fields.push(f);
  };
  const emp = (reqd: boolean) => {
    push({ fieldname: "employee", fieldtype: "Link", label: "Employee", options: "Employee", ...(reqd ? { reqd: 1 } : {}), in_standard_filter: 1 });
    push({ fieldname: "employee_name", fieldtype: "Data", label: "Employee Name", fetch_from: "employee.employee_name", read_only: 1, in_list_view: 1 });
    push({ fieldname: "company", fieldtype: "Link", label: "Company", options: "Company", fetch_from: "employee.company", read_only: 1, in_standard_filter: 1, ...(reqd ? { reqd: 1 } : {}) });
  };
  for (const raw of spec.split("|")) {
    const tok = raw.trim();
    if (!tok) { if (!lastEmpty && fields.length) push({ fieldname: `column_break_${++cb}`, fieldtype: "Column Break" }); lastEmpty = true; continue; }
    lastEmpty = false;
    if (tok.startsWith("--")) { const [en, a] = tok.slice(2).split("~"); push({ fieldname: `section_${++sb}`, fieldtype: "Section Break", label: en }); if (a) ar[en!] = a; continue; }
    if (tok === "@emp" || tok === "@empo") { emp(tok === "@emp"); continue; }
    if (tok === "@co") {
      const c = has("company");
      if (c) { Object.assign(c, { reqd: 1, read_only: 0, fetch_if_empty: 1 }); continue; }
      push({ fieldname: "company", fieldtype: "Link", label: "Company", options: "Company", reqd: 1, in_standard_filter: 1 }); continue;
    }
    if (tok === "@dept") { push({ fieldname: "department", fieldtype: "Link", label: "Department", options: "Department", in_standard_filter: 1 }); continue; }
    if (tok === "@br") { push({ fieldname: "branch", fieldtype: "Link", label: "Branch", options: "Branch", in_standard_filter: 1 }); continue; }
    if (tok === "@period") { push({ fieldname: "from_date", fieldtype: "Date", label: "From Date", reqd: 1 }); push({ fieldname: "to_date", fieldtype: "Date", label: "To Date", reqd: 1 }); continue; }
    const m = TOKEN.exec(tok);
    if (!m) throw new Error(`r10 schema: bad field token "${tok}"`);
    const [, name, req, type0, target, opts, a] = m;
    const fieldtype = type0 || (opts !== undefined ? "Select" : target ? "Link" : "Data");
    const label = labelOf(name!);
    const f: F = { fieldname: name, fieldtype, label };
    if (req) f["reqd"] = 1;
    if (target) f["options"] = target.trim();
    if (opts !== undefined) {
      const list = opts.split(",");
      f["options"] = list.join("\n");
      if (list[0]) f["default"] = list[0];
      f["in_standard_filter"] = 1;
      for (const o of list) if (o) options.push(o);
    }
    if (fieldtype === "Link") f["in_standard_filter"] = f["in_standard_filter"] ?? (["employee", "company", "department", "branch"].includes(name!) ? 1 : 0);
    if (fieldtype === "Check" && /^(is_active|is_primary)$/.test(name!)) f["default"] = "1";
    if (fieldtype === "Datetime" && /^(posted_on|requested_on|event_time|run_on|started_on)$/.test(name!)) f["default"] = "Now";
    if (a) ar[label] = a;
    push(f);
  }
  for (const f of fields) { const l = String(f["label"] ?? ""); if (MACRO_AR[l]) ar[l] = MACRO_AR[l]!; }
  return { fields, ar, options };
}

const AUTO_PAIRS: [string, string][] = [["from_date", "to_date"], ["start_date", "end_date"], ["effective_from", "effective_to"], ["issue_date", "expiry_date"], ["opens_on", "closes_on"], ["given_on", "withdrawn_on"]];
export interface Rule { condition: string; message: string; ar: string }
/** Explicit rules plus the date-order rules of every from/to pair the DocType carries. */
export function rulesOf(e: EntitySpec, fields: F[], ar: Record<string, string>): Rule[] {
  const out: Rule[] = (e.rules ?? []).map(([condition, message, a]) => ({ condition, message, ar: a }));
  const names = new Set(fields.map((f) => String(f["fieldname"])));
  for (const [a, b] of AUTO_PAIRS) {
    if (!names.has(a) || !names.has(b)) continue;
    const condition = `doc.${b} && doc.${a} && doc.${b} < doc.${a}`;
    if (out.some((r) => r.condition.includes(`doc.${b} < doc.${a}`))) continue;
    const la = labelOf(a), lb = labelOf(b);
    out.push({ condition, message: `${lb} cannot be before ${la}`, ar: `لا يمكن أن يكون ${ar[lb] ?? lb} قبل ${ar[la] ?? la}` });
  }
  return out;
}

/** The same condition as Python for the Frappe Server Script (flt for numbers, string compare for dates). */
export function toPython(cond: string, fields: F[]): string {
  const type = new Map(fields.map((f) => [String(f["fieldname"]), String(f["fieldtype"] ?? "Data")]));
  return cond
    .replace(/doc\.([a-z0-9_]+)/g, (_m, n: string) => { const t = type.get(n) ?? "Data"; return NUMERIC.has(t) ? `flt(doc.${n})` : DATEISH.has(t) ? `str(doc.${n} or "")` : `doc.${n}`; })
    .replace(/&&/g, " and ").replace(/\|\|/g, " or ").replace(/!(?!=)/g, "not ").replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\s+/g, " ").trim();
}

const used = new Set(["DDR", "DSC", "DJF", "DJP", "DPOS", "DPB", "DEC", "DCR", "DSM", "DLP", "DSP", "DWP", "DWR", "DAH", "DCA", "DIL", "DSRS", "DWPS", "DGA", "DPP", "DPV", "DAD", "DBC", "DOI", "DPA", "DPL"]);
function prefixOf(name: string): string {
  const words = name.replace(/^DIGIT /, "").split(/\s+/);
  let p = "H" + words.map((w) => w[0]!.toUpperCase()).join("");
  const last = words[words.length - 1]!.toUpperCase();
  let i = 1;
  while (used.has(p)) p = p + (last[i++] ?? String(i));
  used.add(p);
  return p;
}

export interface Built { meta: DT; spec: EntitySpec; rules: Rule[]; ar: Record<string, string>; options: string[]; prefix?: string }
const APPROVAL = "approval_status";

function build(e: EntitySpec): Built {
  const { fields, ar, options } = parseFields(e.fields, e.child);
  if (e.wf) {
    fields.push({ fieldname: "section_approval", fieldtype: "Section Break", label: "Approval" }, { fieldname: APPROVAL, fieldtype: "Select", label: "Approval Status", options: "Draft\nPending Approval\nApproved\nRejected", default: "Draft", read_only: 1, in_standard_filter: 1, allow_on_submit: 1 }, { fieldname: "approver", fieldtype: "Link", label: "Approver", options: "User", read_only: 1 }, { fieldname: "column_break_appr", fieldtype: "Column Break" }, { fieldname: "approved_on", fieldtype: "Datetime", label: "Approved On", read_only: 1 }, ...(!fields.some(f => f["fieldname"] === "decision_note") ? [{ fieldname: "decision_note", fieldtype: "Small Text", label: "Decision Note" }] : []));
    ar["Approval"] = "الاعتماد"; ar["Approval Status"] = "حالة الاعتماد"; ar["Approver"] = "المعتمد"; ar["Approved On"] = "تاريخ الاعتماد"; ar["Decision Note"] = "ملاحظة القرار";
  }
  const dataFields = fields.filter((f) => !/Break$/.test(String(f["fieldtype"])));
  const title = e.title ?? String((dataFields.find((f) => /(_name|^title|^subject|name\*?)$/.test(String(f["fieldname"])) && f["fieldtype"] === "Data") ?? dataFields.find((f) => f["fieldname"] === "employee_name") ?? dataFields[0])?.["fieldname"]);
  const hasEmployee = fields.some((f) => f["fieldname"] === "employee" && f["options"] === "Employee");
  const rules = rulesOf(e, fields, ar);
  if (e.child) {
    return { spec: e, rules: [], ar, options, meta: { name: e.name, module: "DIGIT HR", istable: 1, editable_grid: 1, fields, permissions: [] } as unknown as DT };
  }
  const prefix = prefixOf(e.name);
  const search = dataFields.filter((f) => f["fieldtype"] === "Data" || f["fieldtype"] === "Link").slice(0, 3).map((f) => f["fieldname"]).join(",");
  const meta = {
    name: e.name, module: "DIGIT HR", autoname: `format:${prefix}-{YYYY}-{#####}`, naming_rule: "Expression", title_field: title, search_fields: search,
    track_changes: 1, ...(e.submit ? { is_submittable: 1 } : {}), fields,
    permissions: sectionPerms(e.section, { submittable: !!e.submit, hasEmployee }),
    description: `${e.src}`,
  } as unknown as DT;
  return { meta, spec: e, rules, ar, options, prefix };
}

export const R10_BUILT: Built[] = ENTITIES.map(build);
export const R10_DOCTYPES: DT[] = R10_BUILT.map((b) => b.meta);
export const R10_NAMES = new Set(ENTITIES.map((e) => e.name));
export const R10_SPEC = new Map(ENTITIES.map((e) => [e.name, e]));

/** Section → new DocTypes (child tables are reached through their parents). */
export const R10_MAP: Record<string, string[]> = {};
for (const e of ENTITIES) if (!e.child) (R10_MAP[e.section] ??= []).push(e.name);

export const R10_SCRIPTS: ServerScript[] = R10_BUILT.filter((b) => b.rules.length).map((b) => ({
  name: `${b.meta.name} Validate`, script_type: "DocType Event", reference_doctype: b.meta.name, doctype_event: "Before Save",
  validate: b.rules.map((r) => ({ condition: r.condition, message: r.message })),
  script: b.rules.map((r) => `if ${toPython(r.condition, b.meta.fields as F[])}:\n    frappe.throw(_("${r.message.replace(/"/g, '\\"')}"))\n`).join(""),
}));

/** Approval workflow on approval_status: requesters submit, section approvers decide; four-eyes documents forbid self-approval. */
export const R10_WORKFLOWS: Workflow[] = R10_BUILT.filter((b) => b.spec.wf).map((b) => {
  const s = b.spec.section; const ap = [...new Set(["HR Manager", ...approversOf(s)])]; const rq = [...new Set(["HR Manager", ...requestersOf(s)])];
  const self = b.spec.four ? 0 : 1;
  return {
    name: `${b.meta.name} Approval`, document_type: b.meta.name, workflow_state_field: APPROVAL, is_active: 1,
    states: [{ state: "Draft", doc_status: "0", allow_edit: rq[0]! }, { state: "Pending Approval", doc_status: "0", allow_edit: ap[0]! }, { state: "Approved", doc_status: b.spec.submit ? "1" : "0", allow_edit: ap[0]! }, { state: "Rejected", doc_status: "0", allow_edit: ap[0]! }],
    transitions: [
      ...rq.map((role) => ({ state: "Draft", action: "Submit for Approval", next_state: "Pending Approval", allowed: role })),
      ...ap.flatMap((role) => [{ state: "Pending Approval", action: "Approve", next_state: "Approved", allowed: role, allow_self_approval: self }, { state: "Pending Approval", action: "Reject", next_state: "Rejected", allowed: role, allow_self_approval: self }]),
      ...rq.map((role) => ({ state: "Rejected", action: "Revise", next_state: "Draft", allowed: role })),
    ],
  };
});

/** ORG-05: the position itself is approved (requester ≠ approver), separate from the position budget. */
R10_WORKFLOWS.push({
  name: "DIGIT Position Approval", document_type: "DIGIT Position", workflow_state_field: APPROVAL, is_active: 1,
  states: [{ state: "Draft", doc_status: "0", allow_edit: "HR Manager" }, { state: "Pending Approval", doc_status: "0", allow_edit: "HR Manager" }, { state: "Approved", doc_status: "0", allow_edit: "HR Manager" }, { state: "Rejected", doc_status: "0", allow_edit: "HR Manager" }],
  transitions: [...new Set(["HR Manager", "HR User", "HR Business Partner", ...requestersOf("01.3")])].map((role) => ({ state: "Draft", action: "Submit for Approval", next_state: "Pending Approval", allowed: role }))
    .concat([...new Set(["HR Manager", "CHRO", ...approversOf("01.3")])].flatMap((role) => [{ state: "Pending Approval", action: "Approve", next_state: "Approved", allowed: role, allow_self_approval: 0 }, { state: "Pending Approval", action: "Reject", next_state: "Rejected", allowed: role, allow_self_approval: 0 }] as never[]))
    .concat([...new Set(["HR Manager", "HR User", ...requestersOf("01.3")])].map((role) => ({ state: "Rejected", action: "Revise", next_state: "Draft", allowed: role })) as never[]),
});

/** Custom fields on native / existing DocTypes. */
export const R10_CUSTOM: NonNullable<PluginManifest["custom_fields"]> = R10_CUSTOM_FIELDS.map(([dt, spec, after]) => {
  const f = parseFields(spec).fields[0]!;
  const { in_list_view: _l, ...rest } = f;
  return { dt, insert_after: after, ...rest } as NonNullable<PluginManifest["custom_fields"]>[number];
});

/** Owned DocTypes (HR app definitions) gain the round-2 fields in their own definition. */
export function withOwnedFields<T extends { name: string; fields: unknown[] }>(list: T[]): T[] {
  return list.map((d) => {
    const spec = R10_OWNED_FIELDS[d.name];
    if (!spec) return d;
    const add = parseFields(spec).fields.filter((f) => !(d.fields as F[]).some((x) => x["fieldname"] === f["fieldname"])).map((f) => { const { in_list_view: _l, ...r } = f; return r; });
    const fields = (d.fields as F[]).map((f) => (d.name === "DIGIT HR Service Case" && f["fieldname"] === "category" && !String(f["options"]).includes("Long Leave") ? { ...f, options: `${String(f["options"])}\nLong Leave` }
      : d.name === "DIGIT HR Service Case" && f["fieldname"] === "case_status" && !String(f["options"]).includes("On Hold") ? { ...f, options: String(f["options"]).replace("In Progress", "In Progress\nOn Hold") } : f));
    return { ...d, fields: [...fields, ...add] };
  });
}

// ------------------------------------------------------------------------------------------- prints
const { CSS, th, head, meta, sign } = PRINT_KIT;
const cell = (f: F) => {
  const n = String(f["fieldname"]); const t = String(f["fieldtype"]);
  if (t === "Currency") return `{{ frappe.utils.fmt_money(doc.${n}) }}`;
  if (t === "Date") return `{% if doc.${n} %}{{ frappe.utils.formatdate(doc.${n}) }}{% else %}—{% endif %}`;
  if (t === "Check") return `{% if doc.${n} %}✓{% else %}—{% endif %}`;
  if (t === "Select" || t === "Link") return `{{ _(doc.${n}) if doc.${n} else "—" }}`;
  return `{{ doc.${n} or "—" }}`;
};
export const R10_PRINTS: PrintFormat[] = R10_BUILT.filter((b) => b.spec.print).map((b) => {
  const fs = (b.meta.fields as F[]).filter((f) => !/Break$|^Table|^Attach|Text$/.test(String(f["fieldtype"])) && f["fieldname"] !== "company");
  const texts = (b.meta.fields as F[]).filter((f) => /Text$/.test(String(f["fieldtype"])));
  const tables = (b.meta.fields as F[]).filter((f) => f["fieldtype"] === "Table");
  const childHtml = tables.map((t) => {
    const child = R10_BUILT.find((x) => x.meta.name === t["options"]);
    const cols = ((child?.meta.fields ?? []) as F[]).filter((f) => !/Break$/.test(String(f["fieldtype"]))).slice(0, 6);
    return `<h3>${b.ar[String(t["label"])] ?? t["label"]} · ${t["label"]}</h3><table><thead><tr>${cols.map((c) => th(child?.ar[String(c["label"])] ?? String(c["label"]), String(c["label"]))).join("")}</tr></thead><tbody>{% for r in doc.${t["fieldname"]} %}<tr>${cols.map((c) => `<td>{{ r.${c["fieldname"]} or "" }}</td>`).join("")}</tr>{% endfor %}</tbody></table>`;
  }).join("");
  const textHtml = texts.map((f) => `{% if doc.${f["fieldname"]} %}<h3>${b.ar[String(f["label"])] ?? f["label"]} · ${f["label"]}</h3><p class="dhp-p">{{ doc.${f["fieldname"]} }}</p>{% endif %}`).join("");
  const title = b.spec.ar;
  return {
    name: `${b.meta.name.replace(/^DIGIT /, "")} (Bilingual)`, doc_type: b.meta.name, print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head(title, b.meta.name.replace(/^DIGIT /, ""))}${meta(fs.map((f) => [b.ar[String(f["label"])] ?? String(f["label"]), String(f["label"]), cell(f)]))}${childHtml}${textHtml}${sign(["الموظف", "Employee"], ["الموارد البشرية", "Human Resources"], ["الاعتماد", "Approval"])}</div>`,
  } as PrintFormat;
});
export const R10_PRINT_TITLES: Record<string, [string, string]> = Object.fromEntries(R10_BUILT.filter((b) => b.spec.print).map((b) => [b.meta.name, [b.meta.name.replace(/^DIGIT /, ""), b.spec.ar]]));

/** Arabic for DocType names, labels and rule messages (option values come from ./ar.ts). */
export const R10_AR_BASE: Record<string, string> = {};
for (const b of R10_BUILT) {
  R10_AR_BASE[b.meta.name] = b.spec.ar;
  for (const [k, v] of Object.entries(b.ar)) R10_AR_BASE[k] ??= v;
  for (const r of b.rules) R10_AR_BASE[r.message] = r.ar;
}
for (const [, spec] of R10_CUSTOM_FIELDS) { const p = parseFields(spec); for (const [k, v] of Object.entries(p.ar)) R10_AR_BASE[k] ??= v; }
for (const spec of Object.values(R10_OWNED_FIELDS)) { const p = parseFields(spec); for (const [k, v] of Object.entries(p.ar)) R10_AR_BASE[k] ??= v; }
/** Every Select option value the round-2 DocTypes declare (the Arabic test checks each has a translation). */
export const R10_OPTIONS = [...new Set([...R10_BUILT.flatMap((b) => b.options), ...R10_CUSTOM_FIELDS.flatMap(([, s]) => parseFields(s).options), ...Object.values(R10_OWNED_FIELDS).flatMap((s) => parseFields(s).options), "Draft", "Pending Approval", "Approved", "Rejected", "Long Leave"])];

/** Native DocTypes the round-2 features use, placed in their HR section (native-first rows, ruling 2). */
export const R10_NATIVE_PLACEMENT: Record<string, { doctype: string; app: string; slug: string }[]> = {
  // includes the round-2 sheet 06 native-first masters and tools, each opened from its HR section
  "01.2": [{ doctype: "Employee Grade", app: "hrms", slug: "employee_grade" }],
  "02.1": [{ doctype: "Interview Type", app: "hrms", slug: "interview_type" }, { doctype: "Employee Referral", app: "hrms", slug: "employee_referral" }, { doctype: "Appointment Letter", app: "hrms", slug: "appointment_letter" }, { doctype: "Job Opening Template", app: "hrms", slug: "job_opening_template" }, { doctype: "Job Applicant Source", app: "hrms", slug: "job_applicant_source" }, { doctype: "Job Offer Term Template", app: "hrms", slug: "job_offer_term_template" }, { doctype: "Offer Term", app: "hrms", slug: "offer_term" }],
  "03.1": [{ doctype: "Leave Encashment", app: "hrms", slug: "leave_encashment" }, { doctype: "Leave Period", app: "hrms", slug: "leave_period" }, { doctype: "Leave Block List", app: "hrms", slug: "leave_block_list" }, { doctype: "Holiday List Assignment", app: "hrms", slug: "holiday_list_assignment" }, { doctype: "Leave Adjustment", app: "hrms", slug: "leave_adjustment" }, { doctype: "Leave Control Panel", app: "hrms", slug: "leave_control_panel" }],
  "03.3": [{ doctype: "Shift Location", app: "hrms", slug: "shift_location" }, { doctype: "Shift Assignment Tool", app: "hrms", slug: "shift_assignment_tool" }, { doctype: "Shift Schedule Assignment", app: "hrms", slug: "shift_schedule_assignment" }, { doctype: "Overtime Type", app: "hrms", slug: "overtime_type" }],
  "04.4": [{ doctype: "Employee Health Insurance", app: "hrms", slug: "employee_health_insurance" }, { doctype: "Employee Benefit Claim", app: "hrms", slug: "employee_benefit_claim" }, { doctype: "Employee Incentive", app: "hrms", slug: "employee_incentive" }, { doctype: "Retention Bonus", app: "hrms", slug: "retention_bonus" }, { doctype: "Employee Other Income", app: "hrms", slug: "employee_other_income" }, { doctype: "Employee Benefit Ledger", app: "hrms", slug: "employee_benefit_ledger" }],
  "04.5": [{ doctype: "Travel Request", app: "hrms", slug: "travel_request" }, { doctype: "Expense Claim Type", app: "hrms", slug: "expense_claim_type" }, { doctype: "Purpose of Travel", app: "hrms", slug: "purpose_of_travel" }, { doctype: "Vehicle Log", app: "hrms", slug: "vehicle_log" }, { doctype: "Vehicle Service Item", app: "hrms", slug: "vehicle_service_item" }],
  "05.1": [{ doctype: "Help Article", app: "frappe", slug: "help_article" }, { doctype: "Help Category", app: "frappe", slug: "help_category" }],
  "05.3": [{ doctype: "Grievance Type", app: "hrms", slug: "grievance_type" }],
  "06.3": [{ doctype: "Auto Email Report", app: "frappe", slug: "auto_email_report" }],
  "07.2": [{ doctype: "Access Log", app: "frappe", slug: "access_log" }, { doctype: "Activity Log", app: "frappe", slug: "activity_log" }],
  "07.4": [{ doctype: "Webhook", app: "frappe", slug: "webhook" }],
  "01.4": [{ doctype: "Employment Type", app: "hrms", slug: "employment_type" }, { doctype: "Identification Document Type", app: "hrms", slug: "identification_document_type" }, { doctype: "Interest", app: "hrms", slug: "interest" }],
  "07.1": [{ doctype: "HR Telemetry Milestone", app: "hrms", slug: "hr_telemetry_milestone" }, { doctype: "Payroll Settings", app: "hrms", slug: "payroll_settings" }, { doctype: "Income Tax Slab", app: "hrms", slug: "income_tax_slab" }, { doctype: "Employee Tax Exemption Category", app: "hrms", slug: "employee_tax_exemption_category" }, { doctype: "Employee Tax Exemption Sub Category", app: "hrms", slug: "employee_tax_exemption_sub_category" }],
  "02.2": [{ doctype: "Appointment Letter Template", app: "hrms", slug: "appointment_letter_template" }],
  "01.5": [{ doctype: "Employee Separation Template", app: "hrms", slug: "employee_separation_template" }],
  "03.2": [{ doctype: "Employee Attendance Tool", app: "hrms", slug: "employee_attendance_tool" }],
  "04.1": [{ doctype: "Bulk Salary Structure Assignment", app: "hrms", slug: "bulk_salary_structure_assignment" }, { doctype: "Payroll Period", app: "hrms", slug: "payroll_period" }, { doctype: "Salary Withholding", app: "hrms", slug: "salary_withholding" }],
  "04.3": [{ doctype: "Employee Tax Exemption Declaration", app: "hrms", slug: "employee_tax_exemption_declaration" }, { doctype: "Employee Tax Exemption Proof Submission", app: "hrms", slug: "employee_tax_exemption_proof_submission" }],
  "02.3": [{ doctype: "KRA", app: "hrms", slug: "kra" }, { doctype: "Employee Feedback Criteria", app: "hrms", slug: "employee_feedback_criteria" }],
  "07.3": [{ doctype: "PWA Notification", app: "hrms", slug: "pwa_notification" }],
};
