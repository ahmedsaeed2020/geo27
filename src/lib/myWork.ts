/**
 * S3 "My Work": one counter for approvals, tasks and alerts waiting for the session user. Core contributes open ToDos
 * allocated to the user and unread Notification Log rows; enabled apps register their own sources (e.g. the DIGIT Pro
 * approval inbox), so the header badge counts exactly the rows the matching inbox shows.
 */
import { adapter } from "./adapter";

export type Bi = readonly [string, string];
export type WorkKind = "approval" | "task" | "alert";
export interface WorkItem { kind: WorkKind; doctype: string; name: string; title: string; hint?: Bi; onBehalfOf?: string }
export interface WorkSource { id: string; label: Bi; kind: WorkKind; items: (user: string) => WorkItem[]; active?: () => boolean; inbox?: { to: string; label: Bi } }
export interface WorkGroup { id: string; label: Bi; kind: WorkKind; items: WorkItem[]; inbox?: { to: string; label: Bi } }

const sources = new Map<string, WorkSource>();
/** One source per id (re-registering replaces it). */
export function registerWorkSource(s: WorkSource): void { sources.set(s.id, s); }

const s = (v: unknown) => String(v ?? "");
const CORE: WorkSource[] = [
  { id: "core:todo", kind: "task", label: ["Tasks assigned to you", "مهام مسندة إليك"], items: (user) => adapter.list("ToDo")
      .filter((t) => s(t["allocated_to"]) === user && (s(t["status"]) || "Open") === "Open")
      .map((t) => ({ kind: "task", doctype: s(t["reference_type"]) || "ToDo", name: s(t["reference_name"]) || t.name, title: s(t["description"]).replace(/<[^>]+>/g, "").slice(0, 120) || t.name })) },
  { id: "core:alerts", kind: "alert", label: ["Unread alerts", "تنبيهات غير مقروءة"], items: (user) => adapter.list("Notification Log")
      .filter((n) => s(n["for_user"]) === user && !Number(n["read"] ?? 0))
      .map((n) => ({ kind: "alert", doctype: s(n["document_type"]) || "Notification Log", name: s(n["document_name"]) || n.name, title: s(n["subject"]).replace(/<[^>]+>/g, "").slice(0, 120) || n.name })) },
];
const ORDER: Record<WorkKind, number> = { approval: 0, task: 1, alert: 2 };

export function myWork(user: string): { groups: WorkGroup[]; total: number; byKind: Record<WorkKind, number> } {
  const groups: WorkGroup[] = [];
  for (const src of [...sources.values(), ...CORE]) {
    if (src.active && !src.active()) continue;
    const items = src.items(user);
    groups.push({ id: src.id, label: src.label, kind: src.kind, items, ...(src.inbox ? { inbox: src.inbox } : {}) });
  }
  groups.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const byKind: Record<WorkKind, number> = { approval: 0, task: 0, alert: 0 };
  for (const g of groups) byKind[g.kind] += g.items.length;
  return { groups, total: byKind.approval + byKind.task + byKind.alert, byKind };
}
