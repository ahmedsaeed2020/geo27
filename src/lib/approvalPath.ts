/**
 * Approval path model (Enterprise Visual Round 1 §9): the steps a document walks through — done (who + when), current
 * («بانتظار <name> منذ 3 أيام», overdue after the step allowance), next — read from the document's workflow definition
 * (workflow.ts) or, for status-approved documents (Leave Application …), its status and approver field, with who/when taken
 * from the Version history the adapter writes. Average waiting comes from the same history of the DocType.
 * Decisions run through the app's registered handler (apps own the logic), else the shared workflow engine.
 */
import { adapter, type Doc } from "./adapter";
import { activeWorkflow, applyWorkflow, currentState, transitionsFor } from "./workflow";
import { currentUser } from "./session";

/** Hours a step may wait before it reads as overdue. */
export const STEP_ALLOWANCE_HOURS = 48;
export type StepStatus = "done" | "current" | "next" | "rejected";
/** `verb`: what the person did on a done / rejected step (أنشأ، أرسل، اعتمد، رفض، طلب تعديل، أعاد …). */
export interface PathStep { state: string; status: StepStatus; who?: string | undefined; at?: string | undefined; verb?: VerbKind | undefined }

/**
 * Decision trail verbs (Construction phase 4 C4-03): one past-tense verb per kind of step, shared by every approval
 * trail (approval path, decision timeline, follow-up, change log), so a trail never reads «نقله إلى» or a noun.
 */
export type VerbKind = "create" | "send" | "approve" | "reject" | "changes" | "return" | "cancel" | "hold" | "close" | "move";
export const VERBS: Record<VerbKind, [string, string]> = {
  create: ["created", "أنشأ"], send: ["sent", "أرسل"], approve: ["approved", "اعتمد"], reject: ["rejected", "رفض"], changes: ["requested changes", "طلب تعديل"], return: ["returned", "أعاد"],
  cancel: ["cancelled", "ألغى"], hold: ["put on hold", "علّق"], close: ["closed", "أغلق"], move: ["moved", "نقل"],
};
export const verbText = (k: VerbKind, ar: boolean) => VERBS[k][ar ? 1 : 0];
/** The verb a workflow action name stands for; undefined when the name says nothing about the decision. */
export function actionVerb(action: string): VerbKind | undefined {
  const a = action.trim(); if (!a) return undefined;
  if (/reject|declin|refus/i.test(a)) return "reject";
  if (/request(ed)?\s*(changes?|revision|modification|amendment)|changes requested|needs? changes/i.test(a)) return "changes";
  if (/return|send back|sent back|reopen|rework|back to/i.test(a)) return "return";
  if (/cancel|void|withdraw/i.test(a)) return "cancel";
  if (/suspend|hold|pause/i.test(a)) return "hold";
  if (/^(close|complete|archive)/i.test(a)) return "close";
  if (/^(re)?submit|send|raise|issue|propose|notify|request approval|for review|for approval|to client/i.test(a)) return "send";
  if (/approv|certif|confirm|accept|award|activat|verif|review|sign|endorse|authori|agree/i.test(a)) return "approve";
  return undefined;
}
/** The verb of a move into `to` when the state it left is unknown (a workflow log line): the first decisive action into it. */
export function intoVerb(doctype: string, to: string): VerbKind {
  for (const t of activeWorkflow(doctype)?.transitions.filter((x) => x.next_state === to) ?? []) { const k = actionVerb(t.action); if (k) return k; }
  return moveVerb(doctype, "\u0000", to);
}
/** The verb of one state move: the workflow action that leads from `from` to `to` (or the given action), else the move's direction. */
export function moveVerb(doctype: string, from: string, to: string, action?: string): VerbKind {
  const w = activeWorkflow(doctype);
  const act = action || w?.transitions.find((t) => t.state === from && t.next_state === to)?.action || "";
  const k = act ? actionVerb(act) : undefined;
  if (k) return k;
  if (/changes requested|طلب تعديل/i.test(to)) return "changes";
  if (/cancel|ملغ/i.test(to)) return "cancel";
  if (/reject|declin|مرفوض/i.test(to)) return "reject";
  if (!from) return "create";
  if (w) {
    const order = w.states.map((x) => x.state); const fi = order.indexOf(from), ti = order.indexOf(to);
    if (fi >= 0 && ti >= 0 && ti < fi) return "return";
    if (fi === 0) return "send";
  }
  if (/approv|certif|confirm|accept|معتمد/i.test(to)) return "approve";
  if (/pending|submit|review|sent|بانتظار/i.test(to)) return "send";
  return "move";
}
export interface ApprovalModel {
  kind: "workflow" | "status"; steps: PathStep[];
  current?: { state: string; approver?: string | undefined; since?: string | undefined; waitingH: number; overdueH: number } | undefined;
  avgH?: number | undefined;
  /** what the session user may decide on the current step (the transition / decision names) */
  can: { approve?: string | undefined; reject?: string | undefined; changes?: string | undefined };
}
export type Decision = "approve" | "reject" | "changes";
type Handler = (doctype: string, name: string, decision: Decision, comment: string) => string[];
const handlers = new Map<string, Handler>();
/** An app owning a DocType's approval logic registers how a decision is applied (e.g. HR decideLeave). */
export function registerApprovalHandler(doctype: string, h: Handler) { handlers.set(doctype, h); }

const s = (v: unknown) => String(v ?? "");
/** `mark`: a demo "pending since" entry (Version `__pending_mark`), used for the waiting time but never as a decision in averages. */
type Move = { field: string; from: string; to: string; who: string; at: string; mark?: boolean };
let vCache = -1; const byDoc = new Map<string, Move[]>(); const byDt = new Map<string, Move[]>();
function history(): void {
  if (adapter.version() === vCache) return;
  vCache = adapter.version(); byDoc.clear(); byDt.clear();
  for (const v of adapter.list("Version")) {
    let data: { changed?: unknown[] } = {}; try { data = JSON.parse(s(v["data"])) as { changed?: unknown[] }; } catch { continue; }
    if (!Array.isArray(data.changed)) continue;
    for (const c of data.changed) {
      if (!Array.isArray(c) || c.length < 3) continue;
      const f = s(c[0]); if (!/(workflow_state|approval_status|status|docstatus|case_status|_state)$/.test(f)) continue;
      const m: Move = { field: f, from: s(c[1]), to: s(c[2]), who: s(v["owner"]), at: s(v["creation"]), ...(v["__pending_mark"] ? { mark: true } : {}) };
      const k = `${s(v["ref_doctype"])}\u0000${s(v["docname"])}`;
      byDoc.set(k, [...(byDoc.get(k) ?? []), m]); byDt.set(s(v["ref_doctype"]), [...(byDt.get(s(v["ref_doctype"])) ?? []), m]);
    }
  }
}
const hoursBetween = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / 3600000);
/** Average hours a step waited in this DocType's history (consecutive state moves of one field). */
function averageWait(doctype: string, field: string): number | undefined {
  history();
  const per = new Map<string, Move[]>();
  for (const [k, ms] of byDoc) if (k.startsWith(`${doctype}\u0000`)) per.set(k, ms.filter((m) => m.field === field));
  const waits: number[] = [];
  for (const [k, ms] of per) {
    // the first step waited from the document's creation to its first decision; later steps from move to move
    const created = s(adapter.get(doctype, k.slice(doctype.length + 1))?.["creation"]);
    if (ms[0] && !ms[0].mark && created && Date.parse(created.replace(" ", "T")) <= Date.parse(ms[0].at.replace(" ", "T"))) waits.push(hoursBetween(created.replace(" ", "T"), ms[0].at.replace(" ", "T")));
    for (let i = 1; i < ms.length; i++) if (!ms[i]!.mark) waits.push(hoursBetween(ms[i - 1]!.at, ms[i]!.at));
  }
  return waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : undefined;
}
const APPROVER_FIELDS = ["leave_approver", "expense_approver", "approver", "shift_approver", "approver_user"];
function approverOf(doc: Doc, roles: string[]): string | undefined {
  const f = APPROVER_FIELDS.find((x) => s(doc[x])); if (f) return s(doc[f]);
  for (const r of roles) { const u = adapter.list("User").find((x) => Array.isArray(x["roles"]) && (x["roles"] as Doc[]).some((y) => y["role"] === r) && x["enabled"] !== 0); if (u) return u.name; }
  return roles[0];
}
const REJECT = /(reject|cancel|declin|مرفوض|ملغ)/i;

/** The approval path of a document, or null when it has none. */
export function approvalModel(doctype: string, doc: Doc, user = currentUser(), now = Date.now()): ApprovalModel | null {
  history();
  const k = `${doctype}\u0000${doc.name}`;
  const w = activeWorkflow(doctype);
  if (w) {
    const field = w.workflow_state_field;
    const cur = currentState(w, doc);
    // main path: from the first state follow the first forward, non-rejecting transition
    const path: string[] = [s(w.states[0]?.state)];
    for (let guard = 0; guard < 12; guard++) {
      const last = path[path.length - 1]!;
      const t = w.transitions.find((x) => x.state === last && !REJECT.test(x.next_state) && !REJECT.test(x.action) && !path.includes(x.next_state));
      if (!t) break; path.push(t.next_state);
    }
    // a last state that still has a decision out of it (e.g. a claim awaiting the client certificate, reached by another
    // document) waits on the next listed state, so the path shows the step as current instead of finished
    const lastSt = path[path.length - 1]!;
    if (w.transitions.some((x) => x.state === lastSt)) {
      const li = w.states.findIndex((x) => x.state === lastSt);
      const nx = w.states.slice(li + 1).find((x) => !REJECT.test(x.state) && !path.includes(x.state));
      if (nx) path.push(nx.state);
    }
    const moves = (byDoc.get(k) ?? []).filter((m) => m.field === field);
    const into = (st: string) => [...moves].reverse().find((m) => m.to === st);
    let ci = path.indexOf(cur);
    const steps: PathStep[] = [];
    if (ci < 0) { // off the main path (Rejected …): the steps up to where it left, then the rejection
      const from = into(cur)?.from; const fi = from ? path.indexOf(from) : 0;
      path.slice(0, Math.max(1, fi + 1)).forEach((st, i) => steps.push({ state: st, status: "done", who: i ? into(st)?.who : s(doc["owner"]), at: i ? into(st)?.at : s(doc["creation"]), verb: i ? moveVerb(doctype, into(st)?.from ?? path[i - 1]!, st) : "create" }));
      steps.push({ state: cur, status: "rejected", who: into(cur)?.who, at: into(cur)?.at, verb: moveVerb(doctype, into(cur)?.from ?? "", cur) === "cancel" ? "cancel" : "reject" });
      ci = -1;
    } else {
      const terminal = ci === path.length - 1 && ci > 0;
      path.forEach((st, i) => { const done = i < ci || (terminal && i === ci);
        steps.push({ state: st, status: done ? "done" : i === ci ? "current" : "next", who: i < ci || terminal ? (i ? into(st)?.who : s(doc["owner"])) : undefined, at: i < ci || terminal ? (i ? into(st)?.at : s(doc["creation"])) : undefined, ...(done ? { verb: i ? moveVerb(doctype, into(st)?.from ?? path[i - 1]!, st) : "create" } : {}) }); });
      if (terminal) ci = -1;
    }
    const trs = transitionsFor(w, doc, user);
    const can = ci >= 0 ? {
      approve: trs.find((t) => !REJECT.test(t.action) && !REJECT.test(t.next_state) && path.indexOf(t.next_state) > ci)?.action,
      reject: trs.find((t) => REJECT.test(t.action) || REJECT.test(t.next_state))?.action,
      changes: trs.find((t) => path.indexOf(t.next_state) >= 0 && path.indexOf(t.next_state) < ci)?.action,
    } : {};
    let current: ApprovalModel["current"];
    if (ci > 0 || (ci === 0 && moves.length)) {
      const since = into(cur)?.at || s(doc["modified"]) || s(doc["creation"]);
      const waitingH = since ? hoursBetween(since, new Date(now).toISOString()) : 0;
      const roles = [...new Set(w.transitions.filter((t) => t.state === cur).map((t) => t.allowed))];
      current = { state: cur, approver: ci === 0 ? s(doc["owner"]) : approverOf(doc, roles), since, waitingH, overdueH: Math.max(0, waitingH - STEP_ALLOWANCE_HOURS) };
    } else if (ci === 0) {
      current = { state: cur, approver: s(doc["owner"]), since: s(doc["creation"]), waitingH: 0, overdueH: 0 };
    }
    return { kind: "workflow", steps, current, avgH: averageWait(doctype, field), can };
  }
  // status-approved documents: created → awaiting the approver → approved / rejected
  const hasApprover = APPROVER_FIELDS.some((f) => f in doc);
  const status = s(doc["status"] || doc["approval_status"]);
  if (!hasApprover || !status) return null;
  const field = doc["approval_status"] !== undefined && !doc["status"] ? "approval_status" : "status";
  const moves = (byDoc.get(k) ?? []).filter((m) => m.field === field || m.field === "docstatus");
  const decided = /approv/i.test(status) ? "Approved" : REJECT.test(status) ? "Rejected" : "";
  const created: PathStep = { state: "Draft", status: "done", who: s(doc["owner"]), at: s(doc["creation"]), verb: "create" };
  const into = (st: string) => [...moves].reverse().find((m) => m.to === st);
  const steps: PathStep[] = [created,
    { state: "Pending Approval", status: decided ? "done" : "current", ...(decided ? { who: s(doc["owner"]), at: s(doc["creation"]), verb: "send" as const } : {}) },
    decided ? { state: decided, status: decided === "Rejected" ? "rejected" : "done", who: into(decided)?.who || s(doc["modified_by"]), at: into(decided)?.at || s(doc["modified"]), verb: decided === "Rejected" ? "reject" : "approve" } : { state: "Approved", status: "next" }];
  const since = s(doc["creation"]);
  const waitingH = decided || !since ? 0 : hoursBetween(since, new Date(now).toISOString());
  const approver = approverOf(doc, []);
  const mine = !decided && (user === "Administrator" || approver === user);
  return { kind: "status", steps, current: decided ? undefined : { state: "Pending Approval", approver, since, waitingH, overdueH: Math.max(0, waitingH - STEP_ALLOWANCE_HOURS) },
    avgH: averageWait(doctype, field), can: mine && handlers.has(doctype) ? { approve: "Approve", reject: "Reject", changes: "Request changes" } : {} };
}

/** Apply a decision (comment required on reject / changes); returns errors (empty = done). */
export function decide(doctype: string, name: string, decision: Decision, comment: string, model: ApprovalModel): string[] {
  if ((decision === "reject" || decision === "changes") && !comment.trim()) return ["A comment is required"];
  // one store write and one notification for the whole decision (status, submit, history, comment), as seeders do
  return adapter.batch(() => decideNow(doctype, name, decision, comment, model));
}
function decideNow(doctype: string, name: string, decision: Decision, comment: string, model: ApprovalModel): string[] {
  const action = model.can[decision];
  const h = handlers.get(doctype);
  let errs: string[] = [];
  if (h) errs = h(doctype, name, decision, comment);
  else if (action) errs = applyWorkflow(doctype, name, action);
  else if (decision === "changes") errs = [];
  else return ["Not permitted"];
  if (!errs.length && comment.trim()) adapter.insertDoc("Comment", { comment_type: "Comment", reference_doctype: doctype, reference_name: name, content: comment.trim(), comment_email: currentUser() });
  return errs;
}
