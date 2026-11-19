/**
 * DIGIT Construction schedule engine: pure read model in ./scheduleCore (re-exported) plus the downstream reschedule
 * preview/apply. The only write is applyReschedule: native Task dates through documentApi.updateDocument (session
 * permissions + adapter hooks), all-or-nothing.
 */
import { adapter, type Doc } from "@/lib/adapter";
import type { DocTypeMeta } from "@/lib/catalog";
import { updateDocument } from "@/lib/documentApi";
import { currentUser, hasPerm } from "@/lib/session";
import { daysBetween, shiftDownstream, validateDates, type Move, type ProjectSchedule } from "./scheduleCore";
export * from "./scheduleCore";

// ---------------------------------------------------------------- reschedule preview + apply
export interface Preview {
  task: string; old_start: string; old_end: string; new_start: string; new_end: string;
  moves: Move[]; blocked: string[]; warnings: { task: string; kind: "beyond_project_end" | "behind_baseline"; days: number }[];
  finish: { current: string; proposed: string; projectEnd: string };
}
export function previewReschedule(s: ProjectSchedule, task: string, start: string, end: string): { preview?: Preview; errors: string[] } {
  const bad = validateDates(start, end); if (bad) return { errors: [bad] };
  const root = s.tasks.find((t) => t.name === task); if (!root) return { errors: [`Task ${task} is not on this project's dated schedule`] };
  if (root.start === start && root.end === end) return { errors: ["The proposed dates are the same as the current dates"] };
  const moves = shiftDownstream(s.tasks, s.edges, task, start, end);
  const by = new Map(s.tasks.map((t) => [t.name, t]));
  const blocked: string[] = [];
  if (root.done) blocked.push(`Task ${task} is completed; its dates are history and cannot be rescheduled`);
  for (const m of moves) if (by.get(m.task)?.done) blocked.push(`Successor ${m.task} is completed and cannot be moved (${m.reason})`);
  const next = new Map(s.tasks.map((t) => [t.name, { start: t.start, end: t.end }]));
  next.set(task, { start, end }); for (const m of moves) next.set(m.task, { start: m.new_start, end: m.new_end });
  const warnings: Preview["warnings"] = [];
  for (const name of [task, ...moves.map((m) => m.task)]) {
    const n = next.get(name)!;
    if (s.projectEnd && n.end > s.projectEnd) warnings.push({ task: name, kind: "beyond_project_end", days: daysBetween(s.projectEnd, n.end) });
    const b = s.baseline.get(name); if (b && n.end > b.end) warnings.push({ task: name, kind: "behind_baseline", days: daysBetween(b.end, n.end) });
  }
  const fin = (m: Map<string, { end: string }>) => [...m.values()].reduce((x, v) => (v.end > x ? v.end : x), "");
  return { errors: [], preview: { task, old_start: root.start, old_end: root.end, new_start: start, new_end: end, moves, blocked, warnings,
    finish: { current: fin(new Map(s.tasks.map((t) => [t.name, t]))), proposed: fin(next), projectEnd: s.projectEnd } } };
}

/** Writes the previewed dates to native Tasks (root + moves) as the session user; any failure restores every task already written. */
export function applyReschedule(meta: DocTypeMeta, p: Preview, user = currentUser()): { ok: boolean; changed: string[]; errors: string[] } {
  if (p.blocked.length) return { ok: false, changed: [], errors: p.blocked };
  const plan = [{ task: p.task, old_start: p.old_start, old_end: p.old_end, new_start: p.new_start, new_end: p.new_end }, ...p.moves];
  for (const m of plan) {
    const d = adapter.get("Task", m.task);
    if (!d) return { ok: false, changed: [], errors: [`Task ${m.task} not found`] };
    if (String(d["exp_start_date"] ?? "").slice(0, 10) !== m.old_start || String(d["exp_end_date"] ?? "").slice(0, 10) !== m.old_end)
      return { ok: false, changed: [], errors: [`Task ${m.task} changed since the preview — preview again`] };
    if (!hasPerm(meta, "write", d as Doc, user)) return { ok: false, changed: [], errors: [`No permission to write Task ${m.task}`] };
  }
  const done: typeof plan = [];
  for (const m of plan) {
    const e = updateDocument(meta, m.task, { exp_start_date: m.new_start, exp_end_date: m.new_end }, user);
    if (e.length) {
      for (const r of done.reverse()) updateDocument(meta, r.task, { exp_start_date: r.old_start, exp_end_date: r.old_end }, user);
      return { ok: false, changed: [], errors: e.map((x) => `${m.task}: ${x}`) };
    }
    done.push(m);
  }
  return { ok: true, changed: plan.map((m) => m.task), errors: [] };
}
