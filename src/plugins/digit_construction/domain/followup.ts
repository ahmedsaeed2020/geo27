/**
 * RPT-MGT-04 Decision Follow-up (Run 6). Two separate read models over existing records, joined only by an explicit
 * link:
 *  - decisions  = workflow decision events (Approve, Reject, Return, Certify, Review) read from the native Workflow
 *                 Comment log src/lib/workflow.ts writes on every transition (content = the resulting state). The log
 *                 does not store the action, so the action is the workflow transition from the previous logged state
 *                 into that state; when the log cannot tell transitions apart it is shown as ambiguous, never guessed.
 *  - follow-ups = native ToDo assignments whose custom field `digit_decision` names the decision (Comment) they follow
 *                 up. A ToDo that only points at the same document is NOT a follow-up of the decision: it is counted
 *                 separately as "other open assignments on the document".
 * Visibility follows Frappe's form timeline (docinfo): a decision is listed when the session user may read the
 * document it was taken on; a follow-up's text is shown only to its assignee, its assigner or a System Manager (the
 * frappe ToDo permission rule), its assignee and status to anyone who may read the document (the form sidebar).
 * No SLA, response target or compliance status is inferred (owner decision OD-27): "past due" is only the ToDo's own
 * due date. Reasons are the document's current reason field, labelled as such, not a stored event value.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser, userRoles, ADMIN } from "@/lib/session";
import { CONSTRUCTION_WORKFLOWS, REASON_FIELDS } from "../workflows";
import type { Workflow } from "../../types";
import { DECISIONS } from "../reportsGap";
import { get, list, today } from "./data";
import { constructionProjects } from "./queues";

export type FollowUpState = "No follow-up" | "Open" | "Past due" | "Closed";
export interface FollowUp {
  todo: string; decision: string; doctype: string; name: string; allocated_to: string; assigned_by: string; description: string | null;
  date: string; priority: string; status: string; past_due: boolean;
}
export interface DecisionEvent {
  key: string; doctype: string; name: string; title: string; project: string; company: string;
  action: string; actions: string[]; action_basis: "Workflow log" | "Ambiguous"; from_state: string; to_state: string;
  decided_by: string; decided_on: string; current_state: string; reason_field: string; reason: string;
  followups: FollowUp[]; open_followups: number; past_due_followups: number; followup_state: FollowUpState; other_open: number;
}
export interface FollowUpFilters { company?: string | undefined; project?: string | undefined; from?: string | undefined; to?: string | undefined; action?: string | undefined; document_type?: string | undefined }

const titleOf = (d: Doc) => String(d["title"] ?? d["subject"] ?? d["work_order_title"] ?? d["claim_title"] ?? d["stage_name"] ?? d["expense_title"] ?? d["description"] ?? d.name);
function projectOf(d: Doc): string {
  if (d["project"]) return String(d["project"]);
  for (const [f, dt] of [["contract", "Digit Client Contract"], ["work_order", "Digit Subcontract Work Order"], ["budget", "Digit Project Cost Budget"], ["tender", "Digit Tender"]] as const) {
    const p = get(dt, d[f])?.["project"]; if (p) return String(p);
  }
  return "";
}
const isOpen = (t: Doc) => (t["status"] ?? "Open") === "Open";
/** frappe ToDo has_permission: the assignee, the assigner, the owner or a System Manager may read the assignment text. */
const canReadTodo = (t: Doc, user: string) => user === ADMIN || userRoles(user).includes("System Manager") || [t["allocated_to"], t["assigned_by"], t["owner"]].includes(user);

/**
 * The workflow action(s) that can have produced `to` from `from` (the previous logged state; for the first logged
 * transition the workflow's initial state when such a transition exists). A log gap (the previous logged state has no
 * transition into `to`) widens to every transition into `to`.
 */
export function actionsInto(w: Pick<Workflow, "states" | "transitions">, from: string | undefined, to: string): { from: string; actions: string[] } {
  const into = w.transitions.filter((t) => t.next_state === to);
  const initial = w.states[0]?.state;
  const start = from ?? (into.some((t) => t.state === initial) ? initial : undefined);
  const exact = start !== undefined ? into.filter((t) => t.state === start) : [];
  const cands = exact.length ? exact : into;
  const froms = [...new Set(cands.map((t) => t.state))];
  return { from: exact.length ? start! : froms.length === 1 ? froms[0]! : "", actions: [...new Set(cands.map((t) => t.action))] };
}

/** Every decision event the user may see, newest first, with its explicitly linked follow-ups. */
export function decisionEvents(f: FollowUpFilters = {}, on = today(), user = currentUser()): DecisionEvent[] {
  const projects = new Map(constructionProjects({ company: f.company || undefined, project: f.project || undefined }).map((p) => [p.name, p]));
  const flows = new Map(CONSTRUCTION_WORKFLOWS.filter((w) => !f.document_type || w.document_type === f.document_type).map((w) => [w.document_type, w]));
  // readable documents per type (session-scoped list = role, if_owner and User Permission rules)
  const readable = new Map<string, Map<string, Doc>>();
  const docOf = (dt: string, name: string) => { if (!readable.has(dt)) readable.set(dt, new Map(list(dt).map((d) => [d.name, d]))); return readable.get(dt)!.get(name); };
  // workflow log per document, in order
  const logs = new Map<string, Doc[]>();
  for (const c of adapter.list("Comment")) {
    if (c["comment_type"] !== "Workflow" || !flows.has(String(c["reference_doctype"]))) continue;
    const k = `${String(c["reference_doctype"])}|${String(c["reference_name"])}`; logs.set(k, [...(logs.get(k) ?? []), c]);
  }
  const todos = adapter.list("ToDo").filter((t) => (t["status"] ?? "Open") !== "Cancelled");
  const byDecision = new Map<string, Doc[]>(), otherOpen = new Map<string, number>();
  for (const t of todos) {
    const dec = String(t["digit_decision"] ?? "");
    if (dec) byDecision.set(dec, [...(byDecision.get(dec) ?? []), t]);
    else if (isOpen(t) && t["reference_name"]) { const k = `${String(t["reference_type"])}|${String(t["reference_name"])}`; otherOpen.set(k, (otherOpen.get(k) ?? 0) + 1); }
  }
  const out: DecisionEvent[] = [];
  for (const [k, cs] of logs) {
    const [dt, name] = k.split("|") as [string, string];
    const w = flows.get(dt)!; const d = docOf(dt, name); if (!d) continue;
    const project = projectOf(d); if (!projects.has(project)) continue;
    const sorted = [...cs].sort((a, b) => String(a["creation"] ?? "").localeCompare(String(b["creation"] ?? "")) || a.name.localeCompare(b.name));
    sorted.forEach((c, i) => {
      const to = String(c["content"] ?? "");
      const prev = i > 0 ? String(sorted[i - 1]!["content"] ?? "") : undefined;
      const r = actionsInto(w, prev, to);
      const decisive = r.actions.filter((a) => DECISIONS.has(a)); if (!decisive.length) return;
      const decided_on = String(c["creation"] ?? "").slice(0, 10);
      if ((f.from && decided_on < f.from) || (f.to && decided_on > f.to)) return;
      const action = r.actions.length === 1 ? r.actions[0]! : r.actions.join(" / ");
      if (f.action && !r.actions.includes(f.action)) return;
      const reasonField = r.actions.length === 1 ? REASON_FIELDS[dt]?.[action] ?? "" : "";
      const fus: FollowUp[] = (byDecision.get(c.name) ?? []).map((t) => {
        const date = String(t["date"] ?? "");
        return { todo: t.name, decision: c.name, doctype: dt, name, allocated_to: String(t["allocated_to"] ?? ""), assigned_by: String(t["assigned_by"] ?? ""),
          description: canReadTodo(t, user) ? String(t["description"] ?? "").replace(/<[^>]+>/g, "").trim() : null, date, priority: String(t["priority"] ?? "Medium"), status: String(t["status"] ?? "Open"),
          past_due: isOpen(t) && !!date && date < on };
      }).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.todo.localeCompare(b.todo));
      const open = fus.filter((x) => x.status === "Open").length, pastDue = fus.filter((x) => x.past_due).length;
      const state: FollowUpState = !fus.length ? "No follow-up" : pastDue ? "Past due" : open ? "Open" : "Closed";
      out.push({ key: c.name, doctype: dt, name, title: titleOf(d), project, company: String(d["company"] ?? projects.get(project)?.["company"] ?? ""),
        action, actions: r.actions, action_basis: r.actions.length === 1 ? "Workflow log" : "Ambiguous", from_state: r.from, to_state: to,
        decided_by: String(c["comment_email"] ?? c["owner"] ?? ""), decided_on, current_state: String(d[w.workflow_state_field] ?? w.states[0]?.state ?? ""),
        reason_field: reasonField, reason: reasonField ? String(d[reasonField] ?? "") : "", followups: fus, open_followups: open, past_due_followups: pastDue, followup_state: state,
        other_open: otherOpen.get(k) ?? 0 });
    });
  }
  return out.sort((a, b) => b.decided_on.localeCompare(a.decided_on) || b.key.localeCompare(a.key));
}

export interface FollowUpSummary { decisions: number; by_action: Record<string, number>; with_followup: number; without_followup: number; open: number; past_due: number; closed: number }
export function followUpSummary(events: DecisionEvent[]): FollowUpSummary {
  const by_action: Record<string, number> = {};
  for (const e of events) by_action[e.action] = (by_action[e.action] ?? 0) + 1;
  const fus = events.flatMap((e) => e.followups);
  return { decisions: events.length, by_action, with_followup: events.filter((e) => e.followups.length).length, without_followup: events.filter((e) => !e.followups.length).length,
    open: fus.filter((x) => x.status === "Open").length, past_due: fus.filter((x) => x.past_due).length, closed: fus.filter((x) => x.status === "Closed").length };
}

/** Report rows (one per decision; follow-up counts only — the follow-ups themselves are their own ToDo rows). */
export function decisionFollowUpRows(f: Record<string, unknown>, on = today()): Record<string, unknown>[] {
  const s = (k: string) => (typeof f[k] === "string" && f[k] ? String(f[k]) : undefined);
  return decisionEvents({ company: s("company"), project: s("project"), from: s("from_date"), to: s("to_date"), action: s("decision"), document_type: s("document_type") }, on).map((e) => ({
    source_doctype: e.doctype, source: e.name, source_table: "", row_no: null, title: e.title, project: e.project, company: e.company,
    decision: e.action, action_basis: e.action_basis, from_state: e.from_state, to_state: e.to_state, decided_by: e.decided_by, decided_on: e.decided_on, current_state: e.current_state,
    current_reason: e.reason, followups: e.followups.length, open_followups: e.open_followups, past_due_followups: e.past_due_followups, followup_state: e.followup_state,
    other_open_assignments: e.other_open, decision_log: e.key,
  }));
}
