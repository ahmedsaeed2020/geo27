/**
 * Project team read model and row rules (see domain/team.ts for the contract). Kept free of documentApi so the report
 * graph (manifest → reports) can read team rows without loading the document write path; domain/team.ts re-exports
 * everything here together with the revision-checked writes.
 */
import { canSeeRecord } from "./access";
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { num, r2 } from "./calc";
import { get, list, rows, today } from "./data";
import { constructionProjects } from "./queues";

export const TEAM_TABLE = "digit_team";
export const TEAM_CHILD = "Digit Project Team Member";
export type Scope = "Whole Project" | "Work Package" | "Task";
export type TeamStatus = "Active" | "Upcoming" | "Ended";
export const TEAM_STATUSES: TeamStatus[] = ["Active", "Upcoming", "Ended"];
export const SCOPES: Scope[] = ["Whole Project", "Work Package", "Task"];
export const COMMENT_PREFIX = "Project team: ";
export interface Issue { en: string; ar: string }
export const iss = (en: string, ar: string): Issue => ({ en, ar });

/** Role options come from the child DocType metadata (never a hard-coded list on the screen). */
export function teamRoles(): string[] {
  const f = cachedMeta(TEAM_CHILD)?.fields.find((x) => x.fieldname === "project_role");
  return String(f?.options ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
}

export interface TeamRow {
  project: string; idx: number; employee: string; employee_name: string; role: string; user: string;
  from: string; from_set: boolean; to: string; scope: Scope; work_package: string; task: string; primary: boolean; notes: string;
  status: TeamStatus; flags: Issue[];
}
export const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export const scopeOf = (r: Record<string, unknown>): Scope => (SCOPES.includes(r["responsibility"] as Scope) ? (r["responsibility"] as Scope) : "Whole Project");
export function statusOf(from: string, to: string, on = today()): TeamStatus { return from && from > on ? "Upcoming" : to && to < on ? "Ended" : "Active"; }
export const projectStart = (p: Doc) => s(p["expected_start_date"] ?? p["actual_start_date"]);
const closed = (p: Doc) => ["Completed", "Cancelled"].includes(s(p["status"]));
/** Display name of a team member; "" when the session user may not read that Employee (never the code either). */
export const employeeName = (e: string) => (canSeeRecord("Employee", e) ? s(adapter.get("Employee", e)?.["employee_name"]) || e : "");

export function teamOf(p: Doc, on = today()): TeamRow[] {
  return rows(p, TEAM_TABLE).map((r, i) => {
    const employee = s(r["employee"]), from_set = !!s(r["from_date"]), from = s(r["from_date"]) || projectStart(p), to = s(r["to_date"]);
    const status = statusOf(from, to, on);
    const flags: Issue[] = [];
    const emp = employee ? adapter.get("Employee", employee) : undefined;
    if (!emp) flags.push(iss("Employee record not found", "سجل الموظف غير موجود"));
    else if (s(emp["status"]) && s(emp["status"]) !== "Active" && status !== "Ended") flags.push(iss(`Employee is ${s(emp["status"])} but the assignment is open`, "الموظف غير نشط والتعيين مفتوح"));
    if (status === "Active" && closed(p)) flags.push(iss("Project is closed — end this assignment", "المشروع مغلق — أنهِ هذا التعيين"));
    const sc = scopeOf(r);
    if (sc === "Work Package" && get("Digit Work Package", r["work_package"])?.["project"] !== p.name) flags.push(iss("Work package is missing or belongs to another project", "حزمة العمل غير موجودة أو تتبع مشروعًا آخر"));
    if (sc === "Task" && get("Task", r["task"])?.["project"] !== p.name) flags.push(iss("Task is missing or belongs to another project", "المهمة غير موجودة أو تتبع مشروعًا آخر"));
    return { project: p.name, idx: num(r["idx"]) || i + 1, employee, employee_name: employeeName(employee), role: s(r["project_role"]), user: s(r["user"]), from, from_set, to, scope: sc,
      work_package: s(r["work_package"]), task: s(r["task"]), primary: !!num(r["is_primary"]), notes: s(r["notes"]), status, flags };
  });
}

/** Project-level checks (informational; the owner has not defined these as rules). */
/** DEC-009: roles that must be staffed on a project of this contract type (blank contract type rows apply to every project). */
export function mandatoryRoles(contractType: string): string[] {
  return [...new Set(list("Digit Mandatory Project Role", (d) => !num(d["disabled"]) && (!d["contract_type"] || d["contract_type"] === contractType)).map((d) => s(d["project_role"])).filter(Boolean))];
}
export function teamChecks(p: Doc, on = today()): Issue[] {
  const t = teamOf(p, on), live = t.filter((r) => r.status === "Active");
  const out: Issue[] = [];
  if (!closed(p) && !live.some((r) => r.role === "Project Manager")) out.push(iss("No active project manager on the team", "لا يوجد مدير مشروع نشط في الفريق"));
  const pm = s(p["digit_project_manager"]);
  if (pm && !closed(p) && !live.some((r) => r.employee === pm && r.role === "Project Manager")) out.push(iss(`The project's manager (${employeeName(pm)}) has no active Project Manager assignment`, `مدير المشروع المسجل (${employeeName(pm)}) ليس لديه تعيين نشط كمدير مشروع`));
  for (const role of [...new Set(live.filter((r) => r.primary).map((r) => r.role))]) {
    const n = live.filter((r) => r.primary && r.role === role).length;
    if (n > 1) out.push(iss(`${n} primary members for ${role} — only one primary per role is allowed (owner decision DEC-010)`, `${n} أعضاء رئيسيون لدور ${PROJECT_ROLE_AR[role] ?? role} — المسموح عضو رئيسي واحد لكل دور (قرار المالك DEC-010)`));
  }
  // DEC-009: mandatory project roles of this contract type (owner-maintained Digit Mandatory Project Role list)
  if (!closed(p)) for (const role of mandatoryRoles(s(p["digit_contract_type"]))) if (!live.some((r) => r.role === role))
    out.push(iss(`No active ${role} — this role is mandatory for ${s(p["digit_contract_type"]) || "construction"} projects`, `لا يوجد ${PROJECT_ROLE_AR[role] ?? role} نشط — هذا الدور إلزامي لمشاريع ${CONTRACT_TYPE_AR[s(p["digit_contract_type"])] ?? "المقاولات"}`));
  const flagged = t.filter((r) => r.flags.length).length;
  if (flagged) out.push(iss(`${flagged} assignment(s) need attention`, `${flagged} تعيين يحتاج إلى مراجعة`));
  return out;
}

export const sig = (r: Record<string, unknown>) => JSON.stringify(["employee", "project_role", "user", "from_date", "to_date", "responsibility", "work_package", "task", "is_primary", "notes", "delegate", "allocation_pct"].map((k) => s(r[k])));
const overlaps = (a: [string, string], b: [string, string]) => a[0] <= b[1] && b[0] <= a[1];
/** App role a delegate must hold to act for a member in this project role (F01-02-2); roles without an app role are not checked. */
export const DELEGATE_ROLE: Record<string, string> = { "Project Manager": "Digit Project Manager", QS: "Digit QS", "Site Engineer": "Digit Site Engineer", Foreman: "Digit Site Engineer", Procurement: "Digit Procurement Officer", Accountant: "Digit Accountant" };
export const PROJECT_ROLE_AR: Record<string, string> = { "Project Manager": "مدير مشروع", QS: "مهندس كميات", "Site Engineer": "مهندس موقع", Foreman: "مراقب عمال", Procurement: "مسؤول مشتريات", Accountant: "محاسب", Planner: "مخطط", Safety: "مسؤول سلامة" };
/** DEC-011: one person's total allocation across overlapping memberships (all construction projects) may not exceed this. */
export const ALLOCATION_LIMIT = 100;
const CONTRACT_TYPE_AR: Record<string, string> = { "Lump Sum": "المقطوعية", "Re-measurement": "إعادة القياس", "Cost Plus": "التكلفة زائد نسبة", "Design & Build": "التصميم والتنفيذ" };
const userHas = (u: string, role: string) => (Array.isArray(adapter.get("User", u)?.["roles"]) ? (adapter.get("User", u)!["roles"] as Record<string, unknown>[]) : []).some((r) => r["role"] === role);
/**
 * Row validation for a Project's team table (also the Project hook, so the native form applies the same rules). Rows
 * identical to the stored version are not re-checked, so an old record with legacy data still saves; a duplicate pair is
 * reported when at least one of the two rows is new or changed.
 */
export function teamIssues(doc: Doc, before?: Doc): Issue[] {
  const t = rows(doc, TEAM_TABLE); if (!t.length) return [];
  const old = new Set(rows(before, TEAM_TABLE).map(sig));
  const fresh = (r: Record<string, unknown>) => !old.has(sig(r));
  const start = projectStart(doc) || "0000-00-00";
  const out: Issue[] = [];
  const span = (r: Record<string, unknown>): [string, string] => [s(r["from_date"]) || start, s(r["to_date"]) || "9999-12-31"];
  t.forEach((r, i) => {
    if (!fresh(r)) return;
    const n = num(r["idx"]) || i + 1, from = s(r["from_date"]), to = s(r["to_date"]);
    for (const [k, v] of [["from", from], ["to", to]] as const) if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) out.push(iss(`Row ${n}: ${k === "from" ? "start" : "end"} date must be YYYY-MM-DD`, `الصف ${n}: يجب أن يكون التاريخ بالصيغة YYYY-MM-DD`));
    if (from && to && to < from) out.push(iss(`Row ${n}: end date is before the start date`, `الصف ${n}: تاريخ النهاية قبل البداية`));
    if (r["employee"] && !adapter.get("Employee", s(r["employee"]))) out.push(iss(`Row ${n}: employee ${s(r["employee"])} does not exist`, `الصف ${n}: الموظف غير موجود`));
    if (r["user"] && !adapter.get("User", s(r["user"]))) out.push(iss(`Row ${n}: user ${s(r["user"])} does not exist`, `الصف ${n}: المستخدم غير موجود`));
    const sc = scopeOf(r);
    if (sc === "Work Package") { const w = get("Digit Work Package", r["work_package"]); if (!w) out.push(iss(`Row ${n}: choose the work package this member is responsible for`, `الصف ${n}: اختر حزمة العمل المسؤول عنها العضو`)); else if (w["project"] !== doc.name) out.push(iss(`Row ${n}: work package ${w.name} belongs to another project`, `الصف ${n}: حزمة العمل تتبع مشروعًا آخر`)); }
    if (sc === "Task") { const k = get("Task", r["task"]); if (!k) out.push(iss(`Row ${n}: choose the task this member is responsible for`, `الصف ${n}: اختر المهمة المسؤول عنها العضو`)); else if (k["project"] !== doc.name) out.push(iss(`Row ${n}: task ${k.name} belongs to another project`, `الصف ${n}: المهمة تتبع مشروعًا آخر`)); }
  });
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
    const a = t[i]!, b = t[j]!;
    if (!a["employee"] || a["employee"] !== b["employee"] || s(a["project_role"]) !== s(b["project_role"]) || (!fresh(a) && !fresh(b))) continue;
    if (overlaps(span(a), span(b))) out.push(iss(`${employeeName(s(a["employee"]))} already holds ${s(a["project_role"])} on this project for an overlapping period (rows ${num(a["idx"]) || i + 1} and ${num(b["idx"]) || j + 1})`,
      `${employeeName(s(a["employee"]))} يشغل الدور نفسه في هذا المشروع لفترة متداخلة (الصفان ${num(a["idx"]) || i + 1} و${num(b["idx"]) || j + 1})`));
  }
  // DEC-010 (F01-02-1): exactly one primary member per project role at any date
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
    const a = t[i]!, b = t[j]!;
    if (!num(a["is_primary"]) || !num(b["is_primary"]) || !s(a["project_role"]) || s(a["project_role"]) !== s(b["project_role"]) || (!fresh(a) && !fresh(b)) || !overlaps(span(a), span(b))) continue;
    const role = s(a["project_role"]), x = num(a["idx"]) || i + 1, y = num(b["idx"]) || j + 1;
    out.push(iss(`More than one primary ${role} in the same period (rows ${x} and ${y})`, `أكثر من ${PROJECT_ROLE_AR[role] ?? role} رئيسي في نفس الفترة (الصفان ${x} و${y})`));
  }
  t.forEach((r, i) => {
    if (!fresh(r)) return;
    const n = num(r["idx"]) || i + 1;
    // F01-02-2: the delegate must hold the member's app role
    const need = DELEGATE_ROLE[s(r["project_role"])], d = s(r["delegate"]);
    if (d && need && !userHas(d, need)) out.push(iss(`Row ${n}: ${d} cannot be the delegate — the user does not hold the ${need} role`, `الصف ${n}: لا يُفوَّض لمستخدم ليس له الدور (${PROJECT_ROLE_AR[s(r["project_role"])] ?? need})`));
    // DEC-011: total allocation of one person over overlapping memberships (this and every other project) ≤ 100%
    const pct = num(r["allocation_pct"]); if (!r["employee"] || pct <= 0) return;
    const mine = span(r);
    let total = pct;
    t.forEach((o, k) => { if (k !== i && o["employee"] === r["employee"] && overlaps(mine, span(o))) total += num(o["allocation_pct"]); });
    for (const p of list("Project", (x) => x.name !== doc.name)) {
      const st = projectStart(p) || "0000-00-00";
      for (const o of rows(p, TEAM_TABLE)) if (o["employee"] === r["employee"] && overlaps(mine, [s(o["from_date"]) || st, s(o["to_date"]) || "9999-12-31"])) total += num(o["allocation_pct"]);
    }
    if (total > ALLOCATION_LIMIT + 1e-9) out.push(iss(`Row ${n}: ${employeeName(s(r["employee"]))} would be allocated ${r2(total)}% in an overlapping period (limit ${ALLOCATION_LIMIT}%)`,
      `الصف ${n}: إجمالي تخصيص ${employeeName(s(r["employee"]))} سيبلغ ${r2(total)}% في فترة متداخلة (الحد ${ALLOCATION_LIMIT}%)`));
  });
  return out;
}

// ---------------------------------------------------------------- delegation (F01-02-2)
/** Active team rows of a project whose member delegates to `user` (membership window = delegation window). */
export function delegatedFor(project: string, user: string, on = today()): Record<string, unknown>[] {
  const p = project ? adapter.get("Project", project) : undefined; if (!p || !user) return [];
  const st = projectStart(p);
  return rows(p, TEAM_TABLE).filter((r) => s(r["delegate"]) === user && !!r["user"] && r["user"] !== user && statusOf(s(r["from_date"]) || st, s(r["to_date"]), on) === "Active");
}
/** Audit line written when a delegate decides: «on behalf of» the members, with the state change. */
export function onBehalfText(members: Record<string, unknown>[], from: string, to: string): string {
  const who = members.map((r) => `${employeeName(s(r["employee"])) || s(r["user"])} (${s(r["project_role"])})`).join(", ");
  return `نيابة عن ${who}: ${from} ← ${to} · On behalf of ${who}: ${from} → ${to}`;
}

// ---------------------------------------------------------------- cross-project view
export interface PersonAllocation { employee: string; employee_name: string; rows: TeamRow[]; activeProjects: string[]; crews: { crew: string; project: string }[]; flags: Issue[] }
/** People across readable construction projects: active / upcoming memberships, crew memberships and concurrency checks. */
export function peopleAllocation(on = today()): PersonAllocation[] {
  const by = new Map<string, PersonAllocation>();
  const add = (e: string) => { let x = by.get(e); if (!x) by.set(e, (x = { employee: e, employee_name: employeeName(e), rows: [], activeProjects: [], crews: [], flags: [] })); return x; };
  const ps = constructionProjects();
  const names = new Set(ps.map((p) => p.name));
  for (const p of ps) for (const r of teamOf(p, on)) if (r.employee && r.status !== "Ended") add(r.employee).rows.push(r);
  for (const c of list("Digit Crew", (c) => names.has(s(c["project"])) && s(c["status"] || "Active") === "Active")) for (const m of rows(c, "members")) if (m["employee"]) add(s(m["employee"])).crews.push({ crew: c.name, project: s(c["project"]) });
  for (const x of by.values()) {
    x.activeProjects = [...new Set(x.rows.filter((r) => r.status === "Active").map((r) => r.project))];
    if (x.activeProjects.length > 1) x.flags.push(iss(`Active on ${x.activeProjects.length} projects at the same time`, `نشط في ${x.activeProjects.length} مشاريع في الوقت نفسه`));
    const crewOther = x.crews.filter((c) => x.activeProjects.length && !x.activeProjects.includes(c.project));
    if (crewOther.length) x.flags.push(iss("In a crew on a project where they have no active team assignment", "عضو طاقم في مشروع ليس له فيه تعيين نشط"));
  }
  return [...by.values()].sort((a, b) => b.activeProjects.length - a.activeProjects.length || a.employee_name.localeCompare(b.employee_name));
}

