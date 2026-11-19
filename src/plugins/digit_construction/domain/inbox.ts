/**
 * HOME-02 "My approvals & tasks" read model and the guarded decision (MGT-03/MGT-04 split from the blueprint):
 *  - approvals = documents of the app's workflows the session user may read AND can move now (src/lib/workflow.ts
 *    transitionsFor: role, state, condition, self-approval rule) — the same engine the form header uses;
 *  - waiting   = documents the user owns whose next step needs another approver (segregation of duties);
 *  - tasks     = open ToDo assignments of the user (native frappe ToDo, allocated_to) on construction records.
 * A decision re-reads the document and refuses when it changed since the inbox was shown (stale-write guard, the
 * virtual equivalent of frappe's TimestampMismatchError / HTTP 409), then applies the workflow through the shared
 * engine. Nothing here writes a ledger row; submit/cancel effects stay in posting.ts.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { activeWorkflow, applyWorkflow, currentState, selfApprovalBlocked, transitionsFor } from "@/lib/workflow";
import { currentUser, hasPerm } from "@/lib/session";
import { cachedMeta } from "@/lib/catalog";
import { CONSTRUCTION_WORKFLOWS, REASON_FIELDS } from "../workflows";
import { constructionProjects } from "./queues";
import { get, list } from "./data";
import { num } from "./calc";
import { delegatedFor } from "./teamModel";

export interface ApprovalItem {
  /** F01-02-2: users of the team members this user acts for on the item's project (delegate), empty when acting for themselves */
  on_behalf?: string[];
  doctype: string; name: string; title: string; project: string; company: string; state: string; owner: string;
  modified: string; age_days: number; actions: string[]; reason_field: Record<string, string>;
}
export interface TaskItem { todo: string; doctype: string; name: string; description: string; project: string; date: string; priority: string; overdue: boolean; assigned_by: string }

/** Actions that need a reason before the transition (defined with the workflows). */
export { REASON_FIELDS };

const today = () => new Date().toISOString().slice(0, 10);
const ageDays = (iso: string) => { const t = Date.parse(iso); return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86400000)); };
const titleOf = (d: Doc) => String(d["title"] ?? d["subject"] ?? d["work_order_title"] ?? d["claim_title"] ?? d["stage_name"] ?? d["expense_title"] ?? d["description"] ?? d.name);
/** Project of a record: own field, else through its contract / work order / budget link. */
export function projectOf(d: Doc | undefined): string {
  if (!d) return "";
  if (d["project"]) return String(d["project"]);
  for (const [f, dt] of [["contract", "Digit Client Contract"], ["work_order", "Digit Subcontract Work Order"], ["budget", "Digit Project Cost Budget"], ["tender", "Digit Tender"]] as const) {
    const p = get(dt, d[f])?.["project"]; if (p) return String(p);
  }
  return "";
}
/** Doctypes with an app workflow (only the active definition of each, so a disabled app shows nothing). */
export const approvalDoctypes = () => [...new Set(CONSTRUCTION_WORKFLOWS.map((w) => w.document_type))].filter((dt) => !!activeWorkflow(dt));

const item = (dt: string, w: NonNullable<ReturnType<typeof activeWorkflow>>, d: Doc, actions: string[]): ApprovalItem => {
  const modified = String(d["modified"] ?? d["creation"] ?? "");
  return { doctype: dt, name: d.name, title: titleOf(d), project: projectOf(d), company: String(d["company"] ?? get("Project", projectOf(d))?.["company"] ?? ""), state: currentState(w, d), owner: String(d["owner"] ?? ""),
    modified, age_days: ageDays(modified), actions, reason_field: REASON_FIELDS[dt] ?? {} };
};
/**
 * Decisions on other people's work the user can take now: readable, not cancelled, past the workflow's initial (draft)
 * state, not owned by the user, at least one permitted transition. Own drafts and returned documents are "my documents".
 */
export function approvalsFor(user = currentUser()): ApprovalItem[] {
  const out: ApprovalItem[] = [];
  for (const dt of approvalDoctypes()) {
    const w = activeWorkflow(dt)!;
    const initial = w.states[0]?.state;
    for (const d of list(dt, (x) => num(x.docstatus) !== 2 && x["owner"] !== user)) {
      if (currentState(w, d) === initial) continue;
      const ts = transitionsFor(w, d, user);
      if (!ts.length) continue;
      out.push({ ...item(dt, w, d, [...new Set(ts.map((t) => t.action))]), on_behalf: delegatedFor(projectOf(d), user).map((r) => String(r["user"])) });
    }
  }
  return out.sort((a, b) => b.age_days - a.age_days || a.doctype.localeCompare(b.doctype) || a.name.localeCompare(b.name));
}
/** The user's own documents the user can move now (submit a draft, resubmit after a return, …). */
export function ownActionable(user = currentUser()): ApprovalItem[] {
  const out: ApprovalItem[] = [];
  for (const dt of approvalDoctypes()) {
    const w = activeWorkflow(dt)!;
    for (const d of list(dt, (x) => num(x.docstatus) !== 2 && x["owner"] === user)) {
      const ts = transitionsFor(w, d, user);
      if (ts.length) out.push(item(dt, w, d, [...new Set(ts.map((t) => t.action))]));
    }
  }
  return out.sort((a, b) => b.age_days - a.age_days || a.name.localeCompare(b.name));
}
/** The user's own documents whose next step must be taken by someone else (self-approval not allowed). */
export function waitingOnOthers(user = currentUser()): ApprovalItem[] {
  const out: ApprovalItem[] = [];
  for (const dt of approvalDoctypes()) {
    const w = activeWorkflow(dt)!;
    for (const d of list(dt, (x) => num(x.docstatus) !== 2 && x["owner"] === user)) {
      const blocked = selfApprovalBlocked(w, d, user);
      if (!blocked.length) continue;
      out.push({ ...item(dt, w, d, [...new Set(blocked.map((t) => t.action))]), reason_field: {} });
    }
  }
  return out;
}

/** Open ToDo assignments of the user on construction records (construction projects' Tasks or app DocTypes). */
export function tasksFor(user = currentUser()): TaskItem[] {
  const projects = new Set(constructionProjects().map((p) => p.name));
  const appTypes = new Set(CONSTRUCTION_WORKFLOWS.map((w) => w.document_type));
  const on = today();
  return list("ToDo", (t) => t["allocated_to"] === user && (t["status"] ?? "Open") === "Open").flatMap((t) => {
    const dt = String(t["reference_type"] ?? ""), name = String(t["reference_name"] ?? "");
    const ref = dt && name ? get(dt, name) : undefined;
    const project = dt === "Project" ? name : projectOf(ref);
    const relevant = (dt.startsWith("Digit ") || appTypes.has(dt) || (!!project && projects.has(project)));
    if (!relevant) return [];
    // a reference the user cannot read is not shown (no name, no count)
    if (dt && name && !list(dt, (x) => x.name === name).length) return [];
    const date = String(t["date"] ?? "");
    return [{ todo: t.name, doctype: dt, name, description: String(t["description"] ?? "").replace(/<[^>]+>/g, "").trim(), project, date, priority: String(t["priority"] ?? "Medium"), overdue: !!date && date < on, assigned_by: String(t["assigned_by"] ?? "") }];
  }).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.todo.localeCompare(b.todo));
}

export interface DecisionResult { ok: boolean; conflict?: boolean; errors: string[]; state?: string }
/**
 * Applies a workflow action from the inbox. `seen` is the document's `modified` stamp when the row was shown: a
 * different stamp (another user decided, or the record was edited) refuses the decision with conflict=true, so two
 * approvers can never both act on the same version. A reason, when the action needs one, is written first.
 */
export function decide(doctype: string, name: string, action: string, seen: string, reason?: string, user = currentUser()): DecisionResult {
  const w = activeWorkflow(doctype); const d = adapter.get(doctype, name);
  if (!w || !d) return { ok: false, errors: ["Document or workflow not found"] };
  const now = String(d["modified"] ?? d["creation"] ?? "");
  if (now !== seen) return { ok: false, conflict: true, errors: [`${doctype} ${name} was changed by ${String(d["modified_by"] ?? "another user")} after you opened it (now ${currentState(w, d)}). Refresh and review again.`] };
  if (!transitionsFor(w, d, user).some((t) => t.action === action)) return { ok: false, errors: applyWorkflow(doctype, name, action, user) };
  const field = REASON_FIELDS[doctype]?.[action];
  if (field) {
    if (!reason?.trim()) return { ok: false, errors: ["A reason is required for this action"] };
    try { adapter.update(doctype, name, { [field]: reason.trim() }); } catch (e) { return { ok: false, errors: [(e as Error).message] }; }
  }
  const errs = applyWorkflow(doctype, name, action, user);
  if (errs.length) return { ok: false, errors: errs };
  return { ok: true, errors: [], state: String(adapter.get(doctype, name)?.[w.workflow_state_field] ?? "") };
}

/** Closes a ToDo assignment (frappe ToDo status Closed); only its assignee may close it. */
export function closeTask(todo: string, user = currentUser()): string[] {
  const t = adapter.get("ToDo", todo);
  if (!t) return ["Assignment not found"];
  if (t["allocated_to"] !== user && user !== "Administrator") return ["Only the assignee can close this assignment"];
  adapter.update("ToDo", todo, { status: "Closed", modified: new Date().toISOString(), modified_by: user });
  return [];
}

/** Quick actions (MGT-05): new records offered from the inbox, each shown only when the user's roles may create it. */
export const QUICK_ACTIONS: { doctype: string; en: string; ar: string }[] = [
  { doctype: "Digit Site Activity Report", en: "Site activity report", ar: "تقرير نشاط موقع" }, { doctype: "Digit Progress Update", en: "Progress update", ar: "تحديث إنجاز" },
  { doctype: "Digit Measurement Book", en: "Measurement book", ar: "دفتر قياس" }, { doctype: "Digit Site Expense", en: "Site expense", ar: "مصروف موقع" },
  { doctype: "Material Request", en: "Material request", ar: "طلب مواد" }, { doctype: "Digit Client Variation", en: "Client variation", ar: "أمر تغيير عميل" },
  { doctype: "Digit Client Claim", en: "Client claim", ar: "مطالبة عميل" },
];
/** Quick actions the user may create now (DocType create permission through session.ts; unknown meta = not offered). */
export const quickActionsFor = (user = currentUser()) => QUICK_ACTIONS.filter((x) => { const m = cachedMeta(x.doctype); return !!m && hasPerm(m, "create", undefined, user); });
