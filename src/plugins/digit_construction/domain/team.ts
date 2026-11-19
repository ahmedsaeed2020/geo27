/**
 * PRJ-TEAM-EXT Project team & responsibilities (contract DOC-PROJECT-TEAM-ASSIGNMENT) — read model, validation, writes.
 *
 * Store: the existing Project custom table `digit_team` (child "Digit Project Team Member"): one dated membership per
 * row with role, optional user, responsibility scope (whole project, one work package or one task of the same project),
 * a primary flag and notes. No second assignment store is created, so Project 360, the native Project form and this
 * screen read the same rows.
 *
 * A membership never grants permissions, never assigns tasks and never changes payroll, cost or schedule. Rules the
 * owner has not decided (primary uniqueness, cross-project concurrency limits, role taxonomy) are shown as checks, not
 * enforced. Enforced: end ≥ start, scope inside the same project, no overlapping duplicate of the same person + role.
 *
 * Writes go through documentApi.updateDocument on the Project after a revision check (stale → conflict, nothing
 * written), so Project permissions and the shared Project hook apply. Child-table edits are not field-versioned, so
 * each change also leaves an Info comment on the Project timeline (who, what, when). Ending sets the end date; the row
 * is never deleted by this screen.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { updateDocument } from "@/lib/documentApi";
import { currentUser, hasPerm } from "@/lib/session";
import { num } from "./calc";
import { rows, today } from "./data";
import { COMMENT_PREFIX, employeeName, iss, projectStart, s, SCOPES, scopeOf, sig, statusOf, TEAM_TABLE, teamIssues, teamRoles, type Issue, type Scope } from "./teamModel";

export * from "./teamModel";

// ---------------------------------------------------------------- writes
export interface AssignmentInput { employee: string; project_role: string; user?: string; from_date: string; to_date?: string; responsibility?: Scope; work_package?: string; task?: string; is_primary?: boolean; notes?: string }
export interface TeamResult { ok: boolean; errors: Issue[]; conflict?: boolean; reused?: boolean; idx?: number }
const fail = (...e: Issue[]): TeamResult => ({ ok: false, errors: e });
const conflictRes = (): TeamResult => ({ ok: false, conflict: true, errors: [iss("The project was changed by someone else after you opened it. Reload it and apply your change again.", "غيّر شخص آخر المشروع بعد أن فتحته. أعد التحميل ثم طبّق التغيير مجددًا.")] });

/** Normalised child row from the form input (scope targets cleared when not used). */
export function toRow(v: AssignmentInput): Record<string, unknown> {
  const sc = SCOPES.includes(v.responsibility as Scope) ? v.responsibility! : "Whole Project";
  return { employee: v.employee.trim(), project_role: v.project_role, ...(v.user ? { user: v.user } : {}), from_date: v.from_date, ...(v.to_date ? { to_date: v.to_date } : {}),
    responsibility: sc, ...(sc === "Work Package" ? { work_package: v.work_package ?? "" } : {}), ...(sc === "Task" ? { task: v.task ?? "" } : {}), is_primary: v.is_primary ? 1 : 0, ...(v.notes?.trim() ? { notes: v.notes.trim() } : {}) };
}
/** Form-level checks before review (required fields), then the same row rules the hook applies. */
export function inputIssues(p: Doc, v: AssignmentInput, replaceIdx?: number): Issue[] {
  const out: Issue[] = [];
  if (!v.employee.trim()) out.push(iss("Choose the employee", "اختر الموظف"));
  if (!v.project_role) out.push(iss("Choose the role", "اختر الدور"));
  else if (!teamRoles().includes(v.project_role)) out.push(iss(`Role ${v.project_role} is not an allowed option`, "الدور غير مسموح"));
  if (!v.from_date) out.push(iss("Set the start date", "حدد تاريخ البداية"));
  if (out.length) return out;
  const next = withRow(p, toRow(v), replaceIdx);
  return teamIssues({ ...p, [TEAM_TABLE]: next }, p);
}
function withRow(p: Doc, row: Record<string, unknown>, replaceIdx?: number) {
  const cur = rows(p, TEAM_TABLE);
  if (replaceIdx === undefined) return [...cur.map((r) => ({ ...r })), { ...row, idx: cur.length + 1 }];
  return cur.map((r, i) => ((num(r["idx"]) || i + 1) === replaceIdx ? { ...r, ...row, idx: num(r["idx"]) || i + 1 } : { ...r }));
}
function write(project: string, base: string, next: Record<string, unknown>[], comment: string, user: string): TeamResult {
  const meta = cachedMeta("Project"); const p = adapter.get("Project", project);
  if (!meta || !p) return fail(iss(`Project ${project} not found`, "المشروع غير موجود"));
  if (!hasPerm(meta, "write", p, user)) return fail(iss("You cannot change this project's team", "لا تملك صلاحية تعديل فريق هذا المشروع"));
  if (s(p["modified"]) !== base) return conflictRes();
  const issues = teamIssues({ ...p, [TEAM_TABLE]: next }, p);
  if (issues.length) return fail(...issues);
  const errs = updateDocument(meta, project, { [TEAM_TABLE]: next }, user);
  if (errs.length) return fail(...errs.map((e) => iss(e, e)));
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: "Project", reference_name: project, content: `${COMMENT_PREFIX}${comment}`, comment_email: user, owner: user });
  return { ok: true, errors: [] };
}
const desc = (r: Record<string, unknown>) => `${employeeName(s(r["employee"]))} (${s(r["employee"])}) · ${s(r["project_role"])} · ${s(r["from_date"]) || "project start"} → ${s(r["to_date"]) || "open"} · ${scopeOf(r)}${r["work_package"] ? ` ${s(r["work_package"])}` : ""}${r["task"] ? ` ${s(r["task"])}` : ""}${num(r["is_primary"]) ? " · primary" : ""}`;

/** Add a dated membership. An identical existing row is reused (idempotent retry), never duplicated. */
export function addAssignment(project: string, v: AssignmentInput, base: string, user = currentUser()): TeamResult {
  const p = adapter.get("Project", project); if (!p) return fail(iss(`Project ${project} not found`, "المشروع غير موجود"));
  const row = toRow(v);
  const same = rows(p, TEAM_TABLE).find((r) => sig({ ...r }) === sig(row));
  if (same) return { ok: true, reused: true, errors: [], idx: num(same["idx"]) };
  const pre = inputIssues(p, v); if (pre.length) return fail(...pre);
  const next = withRow(p, row);
  const r = write(project, base, next, `added ${desc(row)}`, user);
  return r.ok ? { ...r, idx: next.length } : r;
}
/** Edit scope, primary flag, notes, user and end date; the start date changes only while the assignment has not started. */
export function editAssignment(project: string, idx: number, employee: string, v: AssignmentInput, base: string, user = currentUser(), on = today()): TeamResult {
  const p = adapter.get("Project", project); if (!p) return fail(iss(`Project ${project} not found`, "المشروع غير موجود"));
  const cur = rows(p, TEAM_TABLE).find((r, i) => (num(r["idx"]) || i + 1) === idx);
  if (!cur || s(cur["employee"]) !== employee) return conflictRes();
  const curFrom = s(cur["from_date"]) || projectStart(p);
  if (statusOf(curFrom, s(cur["to_date"]), on) === "Ended") return fail(iss("An ended assignment is kept as history — add a new assignment instead", "التعيين المنتهي يبقى سجلًا تاريخيًا — أضف تعيينًا جديدًا بدلًا من ذلك"));
  if (v.employee !== employee || v.project_role !== s(cur["project_role"])) return fail(iss("Person and role cannot change — end this assignment and add a new one", "لا يمكن تغيير الشخص أو الدور — أنهِ هذا التعيين وأضف تعيينًا جديدًا"));
  if (v.from_date !== s(cur["from_date"]) && statusOf(curFrom, "", on) !== "Upcoming") return fail(iss("The start date of an assignment that has started cannot change (correction policy not defined)", "لا يمكن تغيير تاريخ بداية تعيين بدأ (سياسة التصحيح غير محددة)"));
  const row = toRow({ ...v, from_date: v.from_date || s(cur["from_date"]) });
  if (!v.from_date && !cur["from_date"]) delete row["from_date"];
  const merged = { ...cur, work_package: "", task: "", user: "", notes: "", to_date: "", ...row };
  if (sig(merged) === sig(cur)) return { ok: true, reused: true, errors: [], idx };
  const pre = inputIssues(p, { ...v, from_date: v.from_date || curFrom }, idx); if (pre.length) return fail(...pre);
  const next = rows(p, TEAM_TABLE).map((r, i) => ((num(r["idx"]) || i + 1) === idx ? merged : { ...r }));
  return { ...write(project, base, next, `changed row ${idx}: ${desc(merged)}`, user), idx };
}
/** End an assignment on a date with a reason; nothing else (task assignees, user permissions) changes. */
export function endAssignment(project: string, idx: number, employee: string, end: string, reason: string, base: string, user = currentUser()): TeamResult {
  const p = adapter.get("Project", project); if (!p) return fail(iss(`Project ${project} not found`, "المشروع غير موجود"));
  const cur = rows(p, TEAM_TABLE).find((r, i) => (num(r["idx"]) || i + 1) === idx);
  if (!cur || s(cur["employee"]) !== employee) return conflictRes();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return fail(iss("Set the end date", "حدد تاريخ النهاية"));
  if (!reason.trim()) return fail(iss("Give the reason for ending the assignment", "اذكر سبب إنهاء التعيين"));
  const from = s(cur["from_date"]) || projectStart(p);
  if (from && end < from) return fail(iss("The end date is before the start date", "تاريخ النهاية قبل البداية"));
  if (s(cur["to_date"]) && s(cur["to_date"]) <= end) return fail(iss(`This assignment already ends on ${s(cur["to_date"])}`, `ينتهي هذا التعيين أصلًا في ${s(cur["to_date"])}`));
  const next = rows(p, TEAM_TABLE).map((r, i) => ((num(r["idx"]) || i + 1) === idx ? { ...r, to_date: end } : { ...r }));
  return { ...write(project, base, next, `ended row ${idx} on ${end}: ${desc({ ...cur, to_date: end })} — reason: ${reason.trim()}`, user), idx };
}
export interface TeamEvent { name: string; at: string; by: string; content: string }
export function teamHistory(project: string): TeamEvent[] {
  return adapter.list("Comment").filter((c) => c["reference_doctype"] === "Project" && c["reference_name"] === project && s(c["content"]).startsWith(COMMENT_PREFIX))
    .map((c) => ({ name: c.name, at: s(c["creation"]), by: s(c["comment_email"] || c["owner"]), content: s(c["content"]).slice(COMMENT_PREFIX.length) }))
    .sort((a, b) => b.at.localeCompare(a.at) || b.name.localeCompare(a.name));
}
