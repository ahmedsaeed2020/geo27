/**
 * Demo freshness of pending approvals (owner rule: demo dates relative to today; a pending approval waits 2–5 days, never
 * weeks). A demo document (seeded / sample, never one a user has edited) waiting in a decision step (reportsGap DECISIONS) with no
 * recorded move into that step gets the move a real decision records — a Version state change and the «Workflow» log
 * comment — dated 2–5 days before today (stable per document, by the document's owner). The approval path, the decision
 * timeline and the approval-aging report all read those records, so they show one waiting time. The Version carries
 * `__pending_mark`, so approval averages never count it as a decision, and it is re-dated once it grows past five days;
 * documents with a real move into their current step are left alone.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { approvalModel } from "@/lib/approvalPath";
import { activeWorkflow } from "@/lib/workflow";
import { CONSTRUCTION_DOCTYPES } from "./schema";
import { DECISIONS } from "./reportsGap";

const DAY = 86400000;
export const PENDING_MAX_DAYS = 5;
const hash = (v: string) => { let h = 7; for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0; return h; };
/** The stable "moved into the current step" stamp of a demo document: 2–5 days before `now`, during working hours. */
export function pendingStamp(dt: string, name: string, now = Date.now()): string {
  // 2 days to 4 days 10 hours back, whole minutes
  const h = hash(`${dt}|${name}`); const t = now - (2 + (h % 3)) * DAY - ((h >>> 5) % 600) * 60000;
  return new Date(Math.floor(t / 60000) * 60000).toISOString();
}
const isDemo = (d: Doc) => !!(d["__synthetic"] || d["__sample"] || d["__demo"]);
const markName = (dt: string, name: string) => `VER-PEND-${hash(dt).toString(36)}-${name}`;

export function freshenPendingApprovals(now = Date.now()): number {
  const todo: { dt: string; d: Doc; from: string; to: string; field: string }[] = [];
  // a demo document someone has edited (any Version besides our mark) keeps its own history
  const edited = new Set<string>();
  for (const v of adapter.list("Version")) if (!v["__pending_mark"]) edited.add(`${String(v["ref_doctype"])}|${String(v["docname"])}`);
  for (const m of CONSTRUCTION_DOCTYPES) {
    const dt = m.name; const w = activeWorkflow(dt); if (!w) continue;
    for (const d of adapter.list(dt)) {
      if (!isDemo(d) || Number(d["docstatus"] ?? 0) === 2 || edited.has(`${dt}|${d.name}`)) continue;
      const model = approvalModel(dt, d, "Administrator", now); const cur = model?.current;
      if (!cur || cur.waitingH <= PENDING_MAX_DAYS * 24) continue;
      if (!w.transitions.some((t) => t.state === cur.state && DECISIONS.has(t.action))) continue; // operating / rework states are not approvals
      const mark = adapter.get("Version", markName(dt, d.name));
      const fromStamp = cur.since === String(d["modified"] ?? "") || cur.since === String(d["creation"] ?? "");
      if (!fromStamp && !(mark && String(mark["creation"]) === cur.since)) continue; // a real decision moved it here: keep
      const i = model!.steps.findIndex((x) => x.status === "current");
      todo.push({ dt, d, from: i > 0 ? model!.steps[i - 1]!.state : "", to: cur.state, field: w.workflow_state_field });
    }
  }
  if (!todo.length) return 0;
  const logs = new Map<string, Doc>();
  for (const c of adapter.list("Comment")) if (c["comment_type"] === "Workflow") logs.set(`${String(c["reference_doctype"])}|${String(c["reference_name"])}|${String(c["content"] ?? "").replace(/<[^>]+>/g, "").trim()}`, c);
  adapter.batch(() => {
    for (const { dt, d, from, to, field } of todo) {
      const at = pendingStamp(dt, d.name, now); if (String(d["creation"] ?? "") > at) continue;
      const who = String(d["owner"] || "Administrator");
      adapter.insertDocQuiet("Version", { name: markName(dt, d.name), ref_doctype: dt, docname: d.name, owner: who, creation: at, __synthetic: 1, __pending_mark: 1, data: JSON.stringify({ changed: [[field, from, to]] }) });
      const log = logs.get(`${dt}|${d.name}|${to}`);
      if (!log) adapter.insertDocQuiet("Comment", { name: `CMT-PEND-${hash(dt).toString(36)}-${d.name}`, comment_type: "Workflow", reference_doctype: dt, reference_name: d.name, content: to, comment_email: who, owner: who, creation: at, __synthetic: 1 });
      else if (isDemo(log) || String(log["name"]).startsWith("CMT-PEND-")) adapter.insertDocQuiet("Comment", { ...log, creation: at });
    }
  });
  return todo.length;
}
