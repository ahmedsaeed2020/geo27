/**
 * Round-2 setup and organisation: SET-02 organisation wizard (company › branch › department tree with side-panel
 * create, native inserts), SET-03 Saudi registration of the legal entity (CR, GOSI and MOL establishment numbers,
 * unified 700 number; required before a WPS submission or bank file), SET-04 reference data sets shared or per company,
 * SET-05 bulk import with a precheck that lists every bad row and its reason before anything is written, ORG-05 position
 * approval (an unapproved position cannot be linked to a Job Opening), ORG-06 position → requisition → opening with the
 * values carried over, ORG-08 the concepts explained on the screen with the links between them.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser } from "@/lib/session";
import { applyWorkflow } from "@/lib/workflow";
import { scopedList, scopedGet } from "../../compat/scope";
import { applyBulk, type BulkOp, type BulkResult } from "./platform";
import { createDoc, rulesErrors, guarded, ok, fail, s, d10, todayISO, nowISO, type ActionResult } from "../write";

const list = (dt: string, user = currentUser()): Doc[] => { try { return scopedList(dt, user); } catch { return []; } };

/* ------------------------------------------------------------------ SET-02 organisation wizard */
export interface OrgNode { kind: "company" | "branch" | "department"; name: string; label: string; children: OrgNode[]; headcount: number }
export function orgTree(user = currentUser()): OrgNode[] {
  const emps = list("Employee", user).filter((e) => s(e["status"]) === "Active");
  const deps = list("Department", user);
  const depNode = (d: Doc): OrgNode => ({ kind: "department", name: d.name, label: s(d["department_name"]) || d.name, headcount: emps.filter((e) => e["department"] === d.name).length, children: deps.filter((x) => x["parent_department"] === d.name).map(depNode) });
  return list("Company", user).map((c) => {
    const branches = [...new Set(emps.filter((e) => e["company"] === c.name).map((e) => s(e["branch"])).filter(Boolean))];
    const roots = deps.filter((d) => (s(d["company"]) === c.name) && (!s(d["parent_department"]) || !deps.some((x) => x.name === d["parent_department"]) || /^All Departments/.test(s(d["parent_department"]))) && !/^All Departments/.test(d.name));
    return { kind: "company", name: c.name, label: s(c["company_name"]) || c.name, headcount: emps.filter((e) => e["company"] === c.name).length,
      children: [...branches.map((b) => ({ kind: "branch" as const, name: b, label: b, headcount: emps.filter((e) => e["company"] === c.name && e["branch"] === b).length, children: [] })), ...roots.map(depNode)] };
  });
}
export function addOrgUnit(kind: "branch" | "department", name: string, company: string, parent?: string, user = currentUser()): ActionResult {
  return guarded(() => {
    if (!name.trim()) return fail("Give the unit a name.", "اكتب اسم الوحدة.");
    if (kind === "branch") {
      if (adapter.get("Branch", name)) return fail("This branch already exists.", "هذا الفرع موجود.");
      const d = createDoc("Branch", { name, branch: name }, user); return ok(`Branch ${name} added.`, `أُضيف الفرع ${name}.`, { created: [["Branch", d.name]] });
    }
    const co = adapter.get("Company", company); if (!co) return fail("Company not found.", "الشركة غير موجودة.");
    const abbr = s(co["abbr"]) || company.slice(0, 3).toUpperCase(); const id = `${name} - ${abbr}`;
    if (adapter.get("Department", id)) return fail("This department already exists in the company.", "هذه الإدارة موجودة في الشركة.");
    if (parent && !scopedGet("Department", parent, user)) return fail("Parent department not found or not permitted.", "الإدارة الأم غير موجودة أو غير مسموحة.");
    const d = createDoc("Department", { name: id, department_name: name, company, parent_department: parent ?? "", is_group: 0 }, user);
    if (parent) adapter.update("Department", parent, { is_group: 1 });
    return ok(`Department ${name} added.`, `أُضيفت الإدارة ${name}.`, { created: [["Department", d.name]] });
  });
}

/* ------------------------------------------------------------------ SET-03 legal entity registration */
export const REG_FIELDS: [string, string, string][] = [["cr_number", "Commercial registration (CR)", "رقم السجل التجاري"], ["gosi_establishment_no", "GOSI establishment number", "رقم منشأة التأمينات"], ["mol_establishment_no", "MHRSD (Qiwa) establishment number", "رقم المنشأة في وزارة الموارد البشرية"], ["unified_number_700", "Unified number (700)", "الرقم الموحد 700"]];
export function registrationGaps(company: string): { field: string; en: string; ar: string }[] {
  const c = adapter.get("Company", company); const le = adapter.list("DIGIT Legal Entity").find((x) => x["company"] === company && s(x["status"]) !== "Inactive");
  return REG_FIELDS.filter(([f]) => !s(c?.[f]) && !s(le?.[f])).map(([field, en, ar]) => ({ field, en, ar }));
}
/** Refusal used by the WPS Submission / Payroll Bank File rule: GOSI establishment number is mandatory. */
export function wpsRegistrationError(company: string): string {
  const g = registrationGaps(company).find((x) => x.field === "gosi_establishment_no");
  return g ? `Company ${company} has no GOSI establishment number; add it under Organization & Legal Entities before preparing WPS.` : "";
}

/* ------------------------------------------------------------------ SET-04 reference data sets */
/** Values of a reference set for a company: a company-specific set wins over the shared one; inactive values are hidden. */
export function referenceValues(setName: string, company?: string): { code: string; value_en: string; value_ar: string; from: string }[] {
  const sets = adapter.list("DIGIT Reference Data Set").filter((x) => x["set_name"] === setName);
  const own = company ? sets.find((x) => x["scope"] === "Company" && x["company"] === company) : undefined;
  const shared = sets.find((x) => s(x["scope"]) !== "Company");
  const pick = own ?? shared; if (!pick) return [];
  return ((pick["values_table"] as Doc[] | undefined) ?? []).filter((v) => Number(v["is_active"] ?? 1) === 1).map((v) => ({ code: s(v["code"]), value_en: s(v["value_en"]), value_ar: s(v["value_ar"]), from: own ? `Company set ${pick.name}` : `Shared set ${pick.name}` }));
}

/* ------------------------------------------------------------------ SET-05 import precheck */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
export interface PrecheckRow { row: number; ok: boolean; errors: string[]; values: Record<string, unknown> }
/** Check every row against the DocType: required fields, Link targets that exist and that the user may read, number /
 *  date / option formats, duplicates inside the file and the Before Save rules. Nothing is written. */
export function precheckImport(dt: string, csv: string, user = currentUser()): { header: string[]; rows: PrecheckRow[]; valid: number; failed: number } {
  const meta = cachedMeta(dt); const grid = parseCsv(csv.replace(/^\uFEFF/, ""));
  const header = (grid[0] ?? []).map((h) => h.trim());
  const fields = new Map((meta?.fields ?? []).map((f) => [s(f.fieldname), f]));
  const byLabel = new Map((meta?.fields ?? []).map((f) => [s(f.label).toLowerCase(), s(f.fieldname)]));
  const keys = header.map((h) => (fields.has(h) ? h : byLabel.get(h.toLowerCase()) ?? h));
  const seen = new Set<string>();
  const rows = grid.slice(1).map((r, i) => {
    const values: Record<string, unknown> = {}; const errors: string[] = [];
    keys.forEach((k, j) => { const v = (r[j] ?? "").trim(); if (v !== "") values[k] = v; });
    for (const k of keys) if (k !== "name" && !fields.has(k)) errors.push(`Unknown column ${k}`);
    for (const f of meta?.fields ?? []) {
      const fn = s(f.fieldname); const v = s(values[fn]);
      if (Number(f.reqd) === 1 && !v && !f.default && !s(f.fetch_from) && !/Break$|^Table/.test(s(f.fieldtype))) errors.push(`${s(f.label) || fn} is required`);
      if (!v) continue;
      if (f.fieldtype === "Link" && s(f.options)) { const target = s(f.options); if (!adapter.get(target, v)) errors.push(`${s(f.label)}: ${target} ${v} does not exist`); else if (!scopedGet(target, v, user) && ["Company", "Employee", "Department", "Branch"].includes(target)) errors.push(`${s(f.label)}: ${v} is outside your scope`); }
      if (["Int", "Float", "Currency", "Percent"].includes(s(f.fieldtype)) && Number.isNaN(Number(v))) errors.push(`${s(f.label)}: "${v}" is not a number`);
      if (f.fieldtype === "Date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors.push(`${s(f.label)}: "${v}" is not a date (YYYY-MM-DD)`);
      if (f.fieldtype === "Select" && s(f.options) && !s(f.options).split("\n").includes(v)) errors.push(`${s(f.label)}: "${v}" is not an allowed option`);
    }
    const key = s(values["name"]) || (dt === "Employee" ? `${s(values["employee_name"])}|${s(values["date_of_birth"])}` : "");
    if (key && key !== "|") { if (seen.has(key)) errors.push("Duplicate row in the file"); seen.add(key); }
    if (s(values["name"]) && adapter.get(dt, s(values["name"]))) errors.push(`${dt} ${s(values["name"])} already exists`);
    if (!errors.length) errors.push(...rulesErrors(dt, { doctype: dt, name: s(values["name"]), ...values } as Doc));
    return { row: i + 2, ok: errors.length === 0, errors, values };
  });
  return { header, rows, valid: rows.filter((r) => r.ok).length, failed: rows.filter((r) => !r.ok).length };
}
/** Import after a clean precheck: all-or-nothing (atomic) or the valid rows only (each); a DIGIT Import Batch records it. */
export function runImport(dt: string, csv: string, mode: "atomic" | "each", fileName = "import.csv", user = currentUser()): ActionResult & { result?: BulkResult } {
  return guarded(() => {
    const pc = precheckImport(dt, csv, user);
    if (mode === "atomic" && pc.failed) return fail(`${pc.failed} row(s) have errors; fix them or import the valid rows only.`, `${pc.failed} صف فيها أخطاء؛ صححها أو استورد الصفوف السليمة فقط.`, pc.rows.filter((r) => !r.ok).map((r) => `Row ${r.row}: ${r.errors.join("; ")}`));
    const ops: BulkOp[] = pc.rows.filter((r) => r.ok).map((r) => ({ op: "create", doctype: dt, values: r.values }));
    const res = applyBulk(ops, mode, user);
    const b = adapter.insertDoc("DIGIT Import Batch", { import_doctype: dt, file_name: fileName, started_on: nowISO(), rows_total: pc.rows.length, rows_valid: res.ok, rows_failed: pc.failed + res.failed, status: res.failed || pc.failed ? "Partly Imported" : "Imported", errors: pc.rows.filter((r) => !r.ok).map((r) => `Row ${r.row}: ${r.errors.join("; ")}`).join("\n").slice(0, 5000) });
    return { ...ok(`${res.ok} row(s) imported, ${pc.failed + res.failed} skipped.`, `استُورد ${res.ok} صف وتُخطي ${pc.failed + res.failed}.`, { created: [["DIGIT Import Batch", b.name]] }), result: res };
  });
}

/* ------------------------------------------------------------------ ORG-05 / ORG-06 / ORG-08 positions */
export const POS = "DIGIT Position";
/** Empty approval status = a position recorded before the approval flow (treated as approved). */
export const positionApproved = (p: Doc | undefined) => !!p && (!s(p["approval_status"]) || s(p["approval_status"]) === "Approved");
export function decidePosition(name: string, action: "Submit for Approval" | "Approve" | "Reject" | "Revise", user = currentUser()): ActionResult {
  const errs = applyWorkflow(POS, name, action, user);
  if (errs.length) return fail("The position decision was refused.", "رُفض قرار المنصب.", errs);
  if (action === "Approve") adapter.update(POS, name, { approver: user, approved_on: nowISO() });
  return ok(`Position: ${action}.`, action === "Approve" ? "اعتُمد المنصب." : action === "Reject" ? "رُفض المنصب." : action === "Revise" ? "أُعيد المنصب للتعديل." : "أُرسل المنصب للاعتماد.");
}
export function jobOpeningPositionError(doc: Doc): string {
  const p = s(doc["digit_position"]); if (!p) return "";
  const pos = adapter.get(POS, p); if (!pos) return `Position ${p} does not exist`;
  if (!positionApproved(pos)) return `Position ${p} is not approved (${s(pos["approval_status"])}); approve it before linking a job opening`;
  if (["Frozen", "Closed"].includes(s(pos["position_status"]))) return `Position ${p} is ${s(pos["position_status"]).toLowerCase()}`;
  return "";
}
/** Position → Job Requisition → Job Opening: one requisition and one opening per open position, values carried over. */
export function requisitionFromPosition(position: string, reason: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const p = scopedGet(POS, position, user); if (!p) return fail("Position not found or not permitted.", "المنصب غير موجود أو غير مسموح.");
    if (!positionApproved(p)) return fail("Approve the position first.", "اعتمد المنصب أولًا.");
    if (s(p["position_status"]) !== "Vacant") return fail("Only a vacant position needs a requisition.", "يحتاج طلب التوظيف منصبًا شاغرًا فقط.");
    const prior = adapter.list("Job Requisition").find((r) => r["digit_position"] === position && !["Cancelled", "Filled"].includes(s(r["status"])));
    if (prior) return ok(`Requisition ${prior.name} already exists for this position.`, `يوجد طلب توظيف ${prior.name} لهذا المنصب.`, { data: { requisition: prior.name, duplicate: true } });
    const d = createDoc("Job Requisition", { designation: p["designation"], department: p["department"], company: p["company"], no_of_positions: 1, expected_compensation: 0, status: "Pending", requested_by: "", posting_date: todayISO(), reason_for_requesting: reason || `Vacant position ${s(p["position_title"])}`, digit_position: position }, user);
    return ok(`Requisition ${d.name} created from the position.`, `أُنشئ طلب التوظيف ${d.name} من المنصب.`, { created: [["Job Requisition", d.name]] });
  });
}
export function openingFromRequisition(requisition: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const r = scopedGet("Job Requisition", requisition, user); if (!r) return fail("Requisition not found or not permitted.", "طلب التوظيف غير موجود أو غير مسموح.");
    const prior = adapter.list("Job Opening").find((o) => o["job_requisition"] === requisition);
    if (prior) return ok(`Opening ${prior.name} already exists.`, `توجد وظيفة شاغرة ${prior.name}.`, { data: { opening: prior.name, duplicate: true } });
    const pos = s(r["digit_position"]); const p = pos ? adapter.get(POS, pos) : undefined;
    const d = createDoc("Job Opening", { job_title: s(p?.["position_title"]) || s(r["designation"]), designation: r["designation"], department: r["department"], company: r["company"], status: "Open", posted_on: todayISO(), job_requisition: requisition, planned_vacancies: r["no_of_positions"] ?? 1, digit_position: pos, description: s(r["description"]) || s(r["reason_for_requesting"]) }, user);
    adapter.update("Job Requisition", requisition, { status: "Open & Approved" });
    return ok(`Job opening ${d.name} created with the position and department.`, `أُنشئت الوظيفة الشاغرة ${d.name} بالمنصب والإدارة.`, { created: [["Job Opening", d.name]] });
  });
}
export const CONCEPTS: { id: string; en: [string, string]; ar: [string, string] }[] = [
  { id: "Designation", en: ["Job (designation)", "What the work is called and graded — shared by many people (e.g. Accountant)."], ar: ["الوظيفة (المسمى)", "اسم العمل ودرجته — يشترك فيه كثيرون (مثل محاسب)."] },
  { id: "DIGIT Position", en: ["Position", "One budgeted seat in a department, filled by one person at a time."], ar: ["المنصب", "مقعد واحد معتمد في إدارة يشغله شخص واحد في كل مرة."] },
  { id: "Job Requisition", en: ["Requisition", "The request to fill a vacant position (why, when, how many)."], ar: ["طلب التوظيف", "طلب شغل منصب شاغر (لماذا ومتى وكم)."] },
  { id: "Job Opening", en: ["Opening (vacancy ad)", "The advertised job candidates apply to; it carries the position and the requisition."], ar: ["الوظيفة الشاغرة (الإعلان)", "الإعلان الذي يتقدم إليه المرشحون؛ يحمل المنصب وطلب التوظيف."] },
];
/** The chain around one record (position ↔ requisition ↔ opening), for the concepts strip on each form. */
export function chainOf(dt: string, name: string): { position?: string; requisition?: string; opening?: string; designation?: string } {
  const d = adapter.get(dt, name); if (!d) return {};
  if (dt === "Job Opening") return { position: s(d["digit_position"]) || undefined, requisition: s(d["job_requisition"]) || undefined, opening: name, designation: s(d["designation"]) || undefined } as never;
  if (dt === "Job Requisition") return { position: s(d["digit_position"]) || undefined, requisition: name, opening: adapter.list("Job Opening").find((o) => o["job_requisition"] === name)?.name, designation: s(d["designation"]) || undefined } as never;
  if (dt === POS) { const r = adapter.list("Job Requisition").find((x) => x["digit_position"] === name); return { position: name, requisition: r?.name, opening: adapter.list("Job Opening").find((o) => o["digit_position"] === name)?.name, designation: s(d["designation"]) || undefined } as never; }
  return {};
}

/* ------------------------------------------------------------------ INT-12 position budget → labour cost budget lines */
/** Months covered by a budget period (calendar months touched, at least 1). */
const monthsIn = (from: string, to: string) => Math.max(1, (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1);
/**
 * INT-12: an approved DIGIT Position Budget becomes a DIGIT Labor Cost Budget whose lines split the approved cost by
 * salary component, in the proportions the department was actually paid (earnings on its latest month of submitted
 * salary slips; the whole company when the department has none). Each line carries the component's budget cost code
 * from Salary Component.digit_cost_code (the setting Finance maintains); a component without a code is named as a
 * warning and its line keeps an empty code, so nothing is guessed. Re-running for the same position budget is refused.
 */
export function laborBudgetFromPosition(positionBudget: string, project = "", user = currentUser()): ActionResult & { warnings?: string[] } {
  return guarded(() => {
    const pb = scopedGet("DIGIT Position Budget", positionBudget, user);
    if (!pb) return fail("Position budget not found or not permitted.", "ميزانية المناصب غير موجودة أو غير مسموح بها.");
    if (Number(pb.docstatus) !== 1 && s(pb["budget_status"]) !== "Approved") return fail("Only an approved position budget can become a labour cost budget.", "لا تتحول إلى ميزانية تكلفة عمالة إلا ميزانية مناصب معتمدة.");
    if (list("DIGIT Labor Cost Budget", user).some((b) => b["position_budget"] === pb.name && Number(b.docstatus ?? 0) !== 2)) return fail("A labour cost budget already exists for this position budget.", "توجد ميزانية تكلفة عمالة لميزانية المناصب هذه بالفعل.");
    const cost = Number(pb["approved_cost"]) || 0; if (cost <= 0) return fail("The position budget has no approved cost.", "لا توجد تكلفة معتمدة في ميزانية المناصب.");
    const company = s(pb["company"]), dept = s(pb["department"]);
    const emps = new Map(list("Employee", user).filter((e) => e["company"] === company).map((e) => [e.name, e]));
    const slips = list("Salary Slip", user).filter((x) => Number(x.docstatus) === 1 && emps.has(s(x["employee"])));
    const pick = (rs: Doc[]) => { const last = rs.map((x) => d10(x["start_date"]).slice(0, 7)).sort().pop(); return last ? rs.filter((x) => d10(x["start_date"]).startsWith(last)) : []; };
    let base = pick(slips.filter((x) => dept && s(emps.get(s(x["employee"]))?.["department"]) === dept)); let scope: [string, string] = ["department", "القسم"];
    if (!base.length) { base = pick(slips); scope = ["company", "الشركة"]; }
    const mix = new Map<string, number>();
    for (const sl of base) for (const e of (sl["earnings"] as Doc[] | undefined) ?? []) { const c = s(e["salary_component"]); if (c) mix.set(c, (mix.get(c) ?? 0) + (Number(e["amount"]) || 0)); }
    const tot = [...mix.values()].reduce((a, b) => a + b, 0);
    if (!tot) return fail("No submitted salary slip with earnings to take the component mix from.", "لا توجد قسيمة راتب معتمدة بمكونات استحقاق لأخذ نسب المكونات منها.");
    const months = monthsIn(d10(pb["from_date"]) || todayISO(), d10(pb["to_date"]) || d10(pb["from_date"]) || todayISO());
    const warnings: string[] = []; const r2 = (v: number) => Math.round(v * 100) / 100;
    const comps = [...mix.entries()].sort((a, b) => b[1] - a[1]);
    let left = cost; const lines = comps.map(([c, amt], i) => {
      const period = i === comps.length - 1 ? r2(left) : r2((cost * amt) / tot); left = r2(left - period);
      const code = s(adapter.get("Salary Component", c)?.["digit_cost_code"]); if (!code) warnings.push(`Salary component "${c}" has no budget cost code (Salary Component › Budget Cost Code).`);
      const monthly = r2(period / months);
      return { salary_component: c, cost_code: code, department: dept, monthly_amount: monthly, annual_amount: r2(monthly * 12) };
    });
    const doc = createDoc("DIGIT Labor Cost Budget", { title: `${s(pb["budget_title"]) || pb.name} — labour cost`, company, fiscal_year: Number((d10(pb["from_date"]) || todayISO()).slice(0, 4)), position_budget: pb.name, project, total_budget: cost, lines }, user);
    return { ...ok(`Labour cost budget ${doc.name} created: ${lines.length} component lines over ${months} months, split by the ${scope[0]} pay mix.`, `أُنشئت ميزانية تكلفة العمالة ${doc.name}: ${lines.length} بنود مكونات على ${months} أشهر، موزعة حسب نسب رواتب ${scope[1]}.`, { created: [["DIGIT Labor Cost Budget", doc.name]], rows: lines }), ...(warnings.length ? { warnings } : {}) };
  });
}
