/**
 * Document status path (owner notes round 2026-11-17, A-05): the steps a document goes through, shown in its band.
 * Pure: reads only the document's own fields (docstatus, status, outstanding / grand total, delivered / billed %) and, for
 * workflow documents, the workflow's own states. Nothing is stored; the stored status never changes.
 */
import type { Doc } from "@/lib/adapter";

export type Bi = [string, string];
export interface DocPathStep { key: string; label: Bi; state: "done" | "current" | "next" }
export interface PathMeta { name: string; is_submittable?: number | boolean | undefined; fields: { fieldname?: string | undefined }[] }
export interface PathWorkflow { states: { state: string }[]; current: string }

const has = (m: PathMeta, f: string) => m.fields.some((x) => x.fieldname === f);
const n = (v: unknown) => Number(v ?? 0) || 0;
const mark = (keys: [string, Bi][], cur: number): DocPathStep[] => keys.map(([key, label], i) => ({ key, label, state: i < cur ? "done" : i === cur ? "current" : "next" }));

/** The document's path, or null for documents without a lifecycle (masters, settings). */
export function docPath(meta: PathMeta, doc: Doc, wf?: PathWorkflow): DocPathStep[] | null {
  const ds = n(doc.docstatus);
  if (wf && wf.states.length > 1) {
    const states = [...new Set(wf.states.map((s) => s.state))].slice(0, 7);
    const i = Math.max(0, states.indexOf(wf.current));
    return mark(states.map((s) => [s, [s, s]] as [string, Bi]), i);
  }
  if (!meta.is_submittable) return null;
  const draft: [string, Bi] = ["draft", ["Draft", "مسودة"]];
  const submitted: [string, Bi] = ["submitted", ["Submitted", "معتمد"]];
  if (ds === 2) return mark([draft, submitted, ["cancelled", ["Cancelled", "ملغى"]]], 2);
  if (has(meta, "outstanding_amount") && has(meta, "grand_total")) {
    const total = Math.abs(n(doc["rounded_total"]) || n(doc["grand_total"])), out = Math.abs(n(doc["outstanding_amount"]));
    const steps: [string, Bi][] = [draft, ["unpaid", ["Unpaid", "غير مدفوع"]], ["partly", ["Partly paid", "مدفوع جزئيًا"]], ["paid", ["Paid", "مدفوع"]]];
    const cur = ds === 0 ? 0 : out <= 0.005 ? 3 : total > 0 && out < total - 0.005 ? 2 : 1;
    return mark(steps, cur);
  }
  const fulfil = has(meta, "per_delivered") ? "per_delivered" : has(meta, "per_received") ? "per_received" : null;
  if (fulfil || has(meta, "per_billed")) {
    const a = fulfil ? n(doc[fulfil]) : 100, b = has(meta, "per_billed") ? n(doc["per_billed"]) : 100;
    const status = String(doc["status"] ?? "");
    const done = /^(Completed|Closed)$/.test(status) || (a >= 99.99 && b >= 99.99);
    const steps: [string, Bi][] = [draft, submitted, ["progress", ["In progress", "قيد التنفيذ"]], ["completed", ["Completed", "مكتمل"]]];
    const cur = ds === 0 ? 0 : done ? 3 : a > 0 || b > 0 ? 2 : 1;
    return mark(steps, cur);
  }
  return mark([draft, ["posted", ["Submitted", "معتمد ومُرحّل"]]], ds === 0 ? 0 : 1);
}

/** Days until (positive) or past (negative) the due date, from today; null without a due date. */
export function dueDays(doc: Doc, today = new Date().toISOString().slice(0, 10)): number | null {
  const due = String(doc["due_date"] ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
