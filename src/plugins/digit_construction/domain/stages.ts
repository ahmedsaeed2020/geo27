/**
 * Construction phase 4 C4-06 — stage columns for tenders (status pipeline) and change events (workflow states): the
 * cards of each stage with their age (days since the document was raised) and time in the stage (days since the
 * Version history moved it there, else since it was raised), the column totals, and the moves a ⋯ menu may make.
 * Moves go through the normal paths only: a tender's status through lib/kanbanBoard.ts moveCards (documentApi
 * saveDocument: permissions, hooks), a change event through its workflow action (domain/inbox.ts decide). A stage the
 * system sets (⚡) — a tender won / lost by its award decision, a workflow state no action leads to — refuses manual moves.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { moveCards } from "@/lib/kanbanBoard";
import { activeWorkflow, currentState, transitionsFor } from "@/lib/workflow";
import { currentUser } from "@/lib/session";
import { num } from "./calc";
import { list } from "./data";
import { decide } from "./inbox";

export type Bi = [string, string];
export interface StageDef { key: string; label: Bi; auto: boolean; autoHint?: Bi | undefined }
export interface StageItem { doc: Doc; stage: string; ageDays: number; inStageDays: number; amount: number | null; late: boolean }
export interface StageBoardData { doctype: string; stages: StageDef[]; items: StageItem[] }
export interface BoardScope { company?: string | undefined; project?: string | undefined }

const s = (v: unknown) => String(v ?? "");
const day = (v: unknown) => s(v).slice(0, 10);
const days = (from: string, on: string) => (from ? Math.max(0, Math.round((Date.parse(on) - Date.parse(from)) / 86400000)) : 0);
let vCache = -1; const moves = new Map<string, { field: string; to: string; at: string }[]>();
/** When the document last moved into `state` on `field` (Version history), else undefined. */
export function enteredAt(dt: string, name: string, field: string, state: string): string | undefined {
  if (adapter.version() !== vCache) {
    vCache = adapter.version(); moves.clear();
    for (const v of adapter.list("Version")) {
      let data: { changed?: unknown[] } = {}; try { data = JSON.parse(s(v["data"])) as typeof data; } catch { continue; }
      for (const c of data.changed ?? []) if (Array.isArray(c) && c.length >= 3) { const k = `${s(v["ref_doctype"])}\u0000${s(v["docname"])}`; moves.set(k, [...(moves.get(k) ?? []), { field: s(c[0]), to: s(c[2]), at: s(v["creation"]) }]); }
    }
  }
  return (moves.get(`${dt}\u0000${name}`) ?? []).filter((m) => m.field === field && m.to === state).map((m) => m.at).sort().pop();
}
const inScope = (sc: BoardScope) => (d: Doc) => num(d.docstatus) !== 2 && (!sc.company || !d["company"] || d["company"] === sc.company) && (!sc.project || d["project"] === sc.project);

export const TENDER_STAGES: StageDef[] = [
  { key: "Draft", label: ["Draft", "مسودة"], auto: false }, { key: "Pricing", label: ["Pricing", "قيد التسعير"], auto: false }, { key: "Submitted", label: ["Submitted", "مُقدَّم"], auto: false },
  { key: "Won", label: ["Won", "فائز"], auto: true, autoHint: ["Set by the submitted tender award decision", "تُضبط من قرار الترسية المعتمد للمناقصة"] },
  { key: "Lost", label: ["Lost", "خاسر"], auto: true, autoHint: ["Set by the submitted tender award decision", "تُضبط من قرار الترسية المعتمد للمناقصة"] },
  { key: "Cancelled", label: ["Cancelled", "ملغى"], auto: true, autoHint: ["Set by a «withdrawn» tender award decision", "تُضبط من قرار ترسية «انسحاب»"] },
];
export function tenderBoard(sc: BoardScope, on: string): StageBoardData {
  const items = list("Digit Tender", inScope(sc)).map((d) => {
    const st = s(d["status"]) || "Draft"; const raised = day(d["creation"]);
    const sel = d["est_selling"]; const amount = sel === null || sel === undefined || sel === "" ? null : num(sel);
    return { doc: d, stage: st, ageDays: days(raised, on), inStageDays: days(day(enteredAt("Digit Tender", d.name, "status", st)) || raised, on), amount, late: ["Draft", "Pricing"].includes(st) && !!day(d["submission_deadline"]) && day(d["submission_deadline"]) < on };
  });
  return { doctype: "Digit Tender", stages: TENDER_STAGES, items: items.sort((a, b) => b.inStageDays - a.inStageDays || a.doc.name.localeCompare(b.doc.name)) };
}

const BACK = /^(return|revise|reopen|send back|rework|resume negotiation)/i;
const NEGATIVE = /reject|cancel|closed|withdraw|lost|superseded/i;
/**
 * Process order of workflow states: the longest forward path from the initial state (return / revise transitions are
 * back edges), so a column sits after every stage that leads to it; end states that stop the work (rejected,
 * cancelled, closed) follow the positive path.
 */
export function processOrder(states: string[], transitions: { state: string; action: string; next_state: string }[]): string[] {
  const depth = new Map<string, number>(states.map((x, i) => [x, i === 0 ? 0 : -1]));
  const fwd = transitions.filter((t) => !BACK.test(t.action) && t.state !== t.next_state);
  for (let k = 0; k < states.length; k++) for (const t of fwd) { const d = depth.get(t.state) ?? -1; if (d >= 0 && d + 1 > (depth.get(t.next_state) ?? -1) && d + 1 < states.length) depth.set(t.next_state, d + 1); }
  const rank = (x: string) => (NEGATIVE.test(x) && !fwd.some((t) => t.state === x) ? 1000 : 0) + (depth.get(x)! >= 0 ? depth.get(x)! : 500);
  return [...states].sort((a, b) => rank(a) - rank(b) || states.indexOf(a) - states.indexOf(b));
}
/** Change event stages = the workflow's states in process order; a state no transition leads to is set by the system (⚡). */
export function changeStages(): StageDef[] {
  const w = activeWorkflow("Digit Change Event"); if (!w) return [];
  const order = processOrder(w.states.map((x) => x.state), w.transitions);
  return order.map((state, i) => { const auto = i > 0 && !w.transitions.some((t) => t.next_state === state);
    return { key: state, label: [state, state], auto, ...(auto ? { autoHint: ["Set by the system — no manual action leads to this stage", "تضبطها المنظومة — لا يؤدي إليها إجراء يدوي"] as Bi } : {}) }; });
}
export function changeBoard(sc: BoardScope, on: string): StageBoardData {
  const w = activeWorkflow("Digit Change Event");
  const items = list("Digit Change Event", inScope(sc)).map((d) => {
    const st = w ? currentState(w, d) : s(d["workflow_state"] || "Draft"); const raised = day(d["ce_date"] || d["creation"]);
    const ci = d["cost_impact"]; const amount = ci === null || ci === undefined || ci === "" ? null : num(ci);
    return { doc: d, stage: st, ageDays: days(raised, on), inStageDays: days(day(enteredAt("Digit Change Event", d.name, w?.workflow_state_field ?? "workflow_state", st)) || raised, on), amount, late: st === "Pricing Requested" && !!day(d["pricing_due_on"]) && day(d["pricing_due_on"]) < on };
  });
  return { doctype: "Digit Change Event", stages: changeStages(), items: items.sort((a, b) => b.inStageDays - a.inStageDays || a.doc.name.localeCompare(b.doc.name)) };
}

export interface MoveOut { moved: string[]; refused: { name: string; reason: string }[] }
/** Moves cards one stage through the document's own path; an automated target stage refuses. */
export function moveStage(doctype: string, names: string[], from: string, to: string, user = currentUser()): MoveOut {
  const stages = doctype === "Digit Tender" ? TENDER_STAGES : changeStages();
  const target = stages.find((x) => x.key === to);
  if (!target) return { moved: [], refused: names.map((name) => ({ name, reason: `Unknown stage ${to}` })) };
  if (target.auto) return { moved: [], refused: names.map((name) => ({ name, reason: target.autoHint?.[0] ?? "Set automatically" })) };
  if (doctype === "Digit Tender") {
    const meta = cachedMeta("Digit Tender"); if (!meta) return { moved: [], refused: names.map((name) => ({ name, reason: "Tender definition not loaded" })) };
    return moveCards(meta, names, "status", to, user);
  }
  const w = activeWorkflow(doctype); const out: MoveOut = { moved: [], refused: [] };
  for (const name of names) {
    const d = adapter.get(doctype, name); if (!d || !w) { out.refused.push({ name, reason: "Not found" }); continue; }
    if (currentState(w, d) !== from) { out.refused.push({ name, reason: `Now in ${currentState(w, d)}` }); continue; }
    const t = transitionsFor(w, d, user).find((x) => x.next_state === to);
    if (!t) { out.refused.push({ name, reason: `No action of your role moves it from ${from} to ${to}` }); continue; }
    const r = decide(doctype, name, t.action, String(d["modified"] ?? d["creation"] ?? ""), undefined, user);
    if (r.ok) out.moved.push(name); else out.refused.push({ name, reason: r.errors[0] ?? "Refused" });
  }
  return out;
}
