/**
 * NB-2/NB-3 onboarding activities (02.2). Pure plan facts plus three guarded native operations that mirror HRMS
 * EmployeeBoardingController: template activities copied onto a draft (get_onboarding_details), an activity owner set
 * on a draft row, and one Task per activity of a submitted onboarding (create_task_and_notify_user). Holiday shifting,
 * ToDo assignment, e-mail notification, project creation and boarding_status roll-up stay server-dependent.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { assertScoped, scopedGet } from "@/plugins/digit_hr/compat/scope";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter rows are untyped JSON documents
type Row = any;
const s = (v: unknown) => (v == null ? "" : String(v));
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const addDays = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const intOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);

export type ActivityState = "done" | "overdue" | "due-soon" | "in-progress" | "scheduled" | "no-task" | "task-hidden";
export type PlanRow = { index: number; activity: string; user: string; role: string; start: string; due: string; task: string; taskStatus: string; weight: number; state: ActivityState; required: boolean };

/**
 * Native task window: start = boarding_begins_on + begin_on, end = boarding_begins_on + begin_on + duration (HRMS
 * get_task_dates, before holiday shifting). Either date is empty when its inputs are missing.
 */
export function activityWindow(beginsOn: string, beginOn: unknown, duration: unknown): { start: string; due: string } {
  const b = intOrNull(beginOn), d = intOrNull(duration);
  if (!isDate(beginsOn) || b === null) return { start: "", due: "" };
  return { start: addDays(beginsOn, b), due: d === null ? "" : addDays(beginsOn, b + d) };
}

const DONE = new Set(["Completed"]);
/** `taskStatus(name)` returns the Task status, or undefined when the task exists but cannot be read by this user. */
export function onboardingPlan(onb: Row, taskStatus: (task: string) => string | undefined, today: string, soonDays = 7): PlanRow[] {
  const rows = (Array.isArray(onb?.activities) ? onb.activities : []) as Row[];
  const submitted = Number(onb?.docstatus) === 1;
  return rows.map((a, index) => {
    const { start, due } = activityWindow(s(onb.boarding_begins_on), a.begin_on, a.duration);
    const task = s(a.task); const st = task ? taskStatus(task) : undefined;
    let state: ActivityState;
    if (task && st === undefined) state = "task-hidden";
    else if (st && DONE.has(st)) state = "done";
    else if (due && due < today) state = "overdue";
    else if (due && due <= addDays(today, soonDays)) state = "due-soon";
    else if (!task && submitted) state = "no-task";
    else if (task && start && start <= today) state = "in-progress";
    else state = "scheduled";
    return { index, activity: s(a.activity_name), user: s(a.user), role: s(a.role), start, due, task, taskStatus: st ?? "", weight: Number(a.task_weight || 0), state, required: !!Number(a.required_for_employee_creation || 0) };
  });
}

/** Completion share: task_weight-weighted when any activity has a weight (as HRMS project progress), else by count. */
export function onboardingProgress(plan: PlanRow[]): { done: number; total: number; pct: number; weighted: boolean } {
  const weighted = plan.some((r) => r.weight > 0);
  const w = (r: PlanRow) => (weighted ? r.weight : 1);
  const total = plan.reduce((a, r) => a + w(r), 0), done = plan.filter((r) => r.state === "done").reduce((a, r) => a + w(r), 0);
  return { done: plan.filter((r) => r.state === "done").length, total: plan.length, pct: total ? Math.round((done / total) * 100) : 0, weighted };
}

/* ---------------------------------------------------------------- guarded operations */

function draftFor(name: string): Row {
  const doc: Row = scopedGet("Employee Onboarding", name);
  if (!doc) throw new Error("Onboarding not found or not permitted");
  if (Number(doc.docstatus) !== 0) throw new Error("Only a draft onboarding can be changed here");
  assertScoped("Employee Onboarding", "write", doc);
  return doc;
}
const ACTIVITY_FIELDS = ["activity_name", "user", "role", "begin_on", "duration", "task_weight", "required_for_employee_creation", "description"] as const;

/** Copy a template's activities onto a draft that has none (native template selection). Never overwrites existing rows. */
export function applyOnboardingTemplate(name: string, template: string): Doc {
  const doc = draftFor(name);
  const tpl: Row = scopedGet("Employee Onboarding Template", template);
  if (!tpl) throw new Error("Template not found or not permitted");
  if ((Array.isArray(doc.activities) ? doc.activities : []).length) throw new Error("This onboarding already has activities");
  const acts = (Array.isArray(tpl.activities) ? tpl.activities : []) as Row[];
  if (!acts.length) throw new Error("The template has no activities");
  const activities = acts.map((a) => Object.fromEntries(ACTIVITY_FIELDS.filter((k) => a[k] !== undefined && a[k] !== "").map((k) => [k, a[k]])));
  adapter.update("Employee Onboarding", name, { employee_onboarding_template: template, activities });
  return adapter.get("Employee Onboarding", name)!;
}

/** Set (or clear) the responsible user of one activity on a draft. The user must be an existing User record. */
export function assignActivityOwner(name: string, index: number, user: string): Doc {
  const doc = draftFor(name);
  const rows = (Array.isArray(doc.activities) ? doc.activities : []) as Row[];
  if (!rows[index]) throw new Error("Activity not found");
  if (user && user !== "Administrator" && !adapter.get("User", user)) throw new Error("Unknown user");
  adapter.update("Employee Onboarding", name, { activities: rows.map((a, i) => (i === index ? { ...a, user: user || undefined } : a)) });
  return adapter.get("Employee Onboarding", name)!;
}

/**
 * Create the native Task for one activity of a submitted onboarding. Idempotent (an existing linked task is returned),
 * scope-checked for both documents, and rolled back if the activity link cannot be saved.
 */
export function startOnboardingTask(name: string, index: number): Doc {
  const doc: Row = scopedGet("Employee Onboarding", name);
  if (!doc) throw new Error("Onboarding not found or not permitted");
  if (Number(doc.docstatus) !== 1) throw new Error("Tasks are created for a submitted onboarding");
  assertScoped("Employee Onboarding", "write", doc);
  const rows = (Array.isArray(doc.activities) ? doc.activities : []) as Row[];
  const a = rows[index];
  if (!a || !s(a.activity_name).trim()) throw new Error("Activity not found");
  if (a.task) { const prior = scopedGet("Task", s(a.task)); if (!prior) throw new Error("Existing task is not permitted"); return prior; }
  const { start, due } = activityWindow(s(doc.boarding_begins_on), a.begin_on, a.duration);
  const fields: Record<string, unknown> = { subject: `${s(a.activity_name)} : ${s(doc.employee_name) || s(doc.employee)}`, project: doc.project || undefined, description: a.description || undefined, department: doc.department || undefined, company: doc.company, task_weight: a.task_weight || undefined, status: "Open", ...(start ? { exp_start_date: start } : {}), ...(due ? { exp_end_date: due } : {}) };
  assertScoped("Task", "create", { name: "", doctype: "Task", ...fields });
  const task = adapter.insertDoc("Task", fields);
  try { adapter.update("Employee Onboarding", name, { activities: rows.map((r, i) => (i === index ? { ...r, task: task.name } : r)) }); }
  catch (e) { adapter.remove("Task", task.name); throw e; }
  return task;
}
