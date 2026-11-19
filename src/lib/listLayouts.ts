/**
 * List Layouts (spec §3): a layout stores filters, sort, visible columns, column order, column widths and page
 * length; personal or shared. Default layouts are derived generically from DocType meta + list indicator rules
 * (list_behaviors.json), never hand-written per DocType.
 */
import type { DocTypeMeta } from "./catalog";
import type { Filter } from "./desk";
import type { ListBehavior } from "./engines";
import { parseFilterString } from "./engines";

export interface ListLayout {
  id: string; name: string; filters: Filter[]; sort: { f: string; dir: "asc" | "desc" };
  columns: string[] | null; widths: Record<string, number>; pageLen: number; shared: boolean; builtin?: boolean;
}

const KEY = (dt: string) => `digit-virtual-core:list-layouts:${dt}`;
const month = () => new Date().toISOString().slice(0, 7);

export function defaultLayouts(meta: DocTypeMeta, lb: ListBehavior | undefined): ListLayout[] {
  const base = { sort: { f: "modified", dir: "desc" as const }, columns: null, widths: {}, pageLen: 20, shared: true, builtin: true };
  const out: ListLayout[] = [{ ...base, id: "default", name: "Default Layout", filters: [] }];
  const has = (f: string) => meta.fields.some((x) => x.fieldname === f);
  if (meta.is_submittable) out.push({ ...base, id: "drafts", name: "Drafts", filters: [["docstatus", "=", "0"]] });
  for (const r of lb?.indicators ?? []) {
    const fs = parseFilterString(r.filter);
    if (fs.length === 1 && fs[0]![0] === "status" && ["Unpaid", "Overdue", "To Deliver and Bill", "Open", "Pending"].includes(r.label) && !out.some((o) => o.name === r.label))
      out.push({ ...base, id: `st-${r.label}`, name: r.label, filters: fs });
  }
  if (has("is_return")) out.push({ ...base, id: "returns", name: meta.name.includes("Invoice") ? "Credit Notes" : "Returns", filters: [["is_return", "=", "1"]] });
  const dateF = ["posting_date", "transaction_date", "exp_start_date", "creation"].find((f) => f === "creation" || has(f))!;
  out.push({ ...base, id: "this-month", name: "This Month", filters: [[dateF, "like", month()]] });
  return out;
}

export function savedLayouts(dt: string): ListLayout[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY(dt)) ?? "[]"); } catch { return []; }
}
export function saveLayouts(dt: string, ls: ListLayout[]) { localStorage.setItem(KEY(dt), JSON.stringify(ls.filter((l) => !l.builtin))); }
