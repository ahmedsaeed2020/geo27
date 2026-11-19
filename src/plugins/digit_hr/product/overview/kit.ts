/**
 * Overview kit for the 30 HR sections and 7 department homes (owner brief 2026-11-15 §2, Overview = 4 layers): headline
 * figures with change and a trend → the chart that answers the section's question → computed insights with a drill →
 * a decision list with a button per item. Every figure is computed at render from permission-scoped records
 * (compat/scope scopedList); a card's value is the count / sum of exactly the rows its drill opens, and history is
 * rebuilt only from the records' own dates (an undated record is counted, never estimated).
 */
import type { Doc } from "@/lib/adapter";
import { matchFilter, type Filter } from "@/lib/desk";
import type { DataShape, ViewKind } from "@/lib/dashboards/views";
import type { WidgetData, Width } from "@/lib/dashboards/registry";
import { scopedList } from "../../compat/scope";

export type Bi = [en: string, ar: string];
export type Unit = "count" | "money" | "pct" | "days" | "hours";
export interface Ctx { on: string; company?: string | undefined; ar: boolean; user: string }
export type Drill =
  | { kind: "list"; doctype: string; filters?: Filter[] | undefined }
  | { kind: "doc"; doctype: string; name: string }
  | { kind: "page"; to: string; search?: Record<string, string> | undefined }
  | { kind: "report"; report: string; filters?: Record<string, string> | undefined };
export interface Fig { value: number | null; drill?: Drill | undefined; sub?: Bi | undefined; status?: "ok" | "unconfigured" | "unavailable" | "denied" | undefined; reason?: Bi | undefined }
export interface KpiSpec {
  id: string; title: Bi; meaning: Bi; sources: string[]; unit: Unit; better: "up" | "down" | "none";
  value: (c: Ctx) => Fig;
  /** the same figure as of an earlier date, from the records' own dates (null = not reconstructable) */
  at?: ((c: Ctx, on: string) => number | null) | undefined;
  /** short label of the figure as a band chip (visual round R3; default: the title before " — ") */
  chip?: Bi | undefined;
}
export interface ChartSpec { id: string; title: Bi; meaning: Bi; sources: string[]; shape: DataShape; view: ViewKind; size: { w: Width }; data: (c: Ctx) => WidgetData }
export interface Insight { key: string; tone: "good" | "risk" | "info"; text: Bi; drill?: Drill | undefined }
export interface DecisionItem { key: string; doctype: string; name: string; title: string; sub: Bi; age: number; kind: "approve" | "fix" | "follow"; drill?: Drill | undefined }
export interface SectionSpec { id: string; kpis: KpiSpec[]; /** the three headline figures shown as band chips (ids of `kpis`; default: the first three with a value) */ hero?: string[] | undefined; primary: ChartSpec; secondary?: ChartSpec | undefined; extra?: ChartSpec[] | undefined; insights: (c: Ctx) => Insight[]; decisions: (c: Ctx) => DecisionItem[] }
/** Filters of a figure: fixed, or computed from the as-of date (rolling windows), so the card and its drill list share one date range. */
export type Filters = Filter[] | ((c: Ctx) => Filter[]);
export const fl = (f: Filters, c: Ctx): Filter[] => (typeof f === "function" ? f(c) : f);
/** Rolling window ending on the as-of date: [field, between, [on − days + 1, on]]. */
export const lastDays = (field: string, days: number) => (c: Ctx): Filter => [field, "between", [addDays(c.on, -(days - 1)), c.on]];
/** Forward window from the as-of date: [field, between, [on + from, on + to]]. */
export const nextDays = (field: string, from: number, to: number) => (c: Ctx): Filter => [field, "between", [addDays(c.on, from), addDays(c.on, to)]];

/* ------------------------------------------------------------------ records ------------------------------------------------------------------ */
const EMP_CO = new Map<string, string>();
/** Scoped rows of a DocType (null = the user may not read it), narrowed to the selected company. */
export function rows(dt: string, c?: { company?: string | undefined }): Doc[] | null {
  let r: Doc[];
  try { r = scopedList(dt); } catch { return null; }
  if (!c?.company) return r;
  if (dt === "Employee") return r.filter((d) => d["company"] === c.company);
  return r.filter((d) => {
    if (typeof d["company"] === "string" && d["company"]) return d["company"] === c.company;
    const e = typeof d["employee"] === "string" ? d["employee"] : "";
    if (!e) return true;
    if (!EMP_CO.size) { try { for (const x of scopedList("Employee")) EMP_CO.set(x.name, String(x["company"] ?? "")); } catch { /* not readable */ } }
    return (EMP_CO.get(e) ?? c.company) === c.company;
  });
}
export const resetCompanyIndex = () => EMP_CO.clear();
/** The company condition a drill list adds (only for DocTypes that carry a company column), so the list shows the card's rows. */
const NO_COMPANY = new Set(["Designation", "Employee Grade", "DIGIT Job Profile", "DIGIT Job Family", "DIGIT Succession Plan", "DIGIT Contract Amendment", "DIGIT HR Integration Log", "DIGIT Learning Path", "Interview", "Job Applicant", "Employee Checkin", "Leave Type", "Shift Type", "Salary Component", "Version", "Notification Log", "Email Template", "Print Format", "Scheduled Job Type", "Error Log", "Role", "User", "Identification Document Type"]);
export const companyFilter = (dt: string, c: { company?: string | undefined }): Filter[] => (c.company && !NO_COMPANY.has(dt) ? [["company", "=", c.company]] : []);
export const where = (r: Doc[] | null, filters: Filter[]) => (r ? r.filter((d) => filters.every((f) => matchFilter(d, f))) : null);
export const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
export const n = (v: unknown) => Number(v) || 0;
export const d10 = (v: unknown) => s(v).slice(0, 10);
export const sum = (r: Doc[], f: string) => Math.round(r.reduce((a, d) => a + n(d[f]), 0) * 100) / 100;
export const addDays = (iso: string, k: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const monthKey = (iso: string) => iso.slice(0, 7);
export function monthsBack(on: string, k: number): string[] { const out: string[] = []; const y = Number(on.slice(0, 4)), m = Number(on.slice(5, 7)); for (let i = k - 1; i >= 0; i--) { const t = new Date(Date.UTC(y, m - 1 - i, 1)); out.push(t.toISOString().slice(0, 7)); } return out; }
export const monthEnd = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
export const open = (d: Doc) => Number(d.docstatus ?? 0) !== 2;
export const submitted = (d: Doc) => Number(d.docstatus ?? 0) === 1;
export const draft = (d: Doc) => Number(d.docstatus ?? 0) === 0;
export const empOf = (d: Doc) => s(d["employee_name"]) || s(d["employee"]) || d.name;

/* ------------------------------------------------------------------ figures ------------------------------------------------------------------ */
/** A count card: the value is the number of rows the drill list opens (same filters, same scope). */
export function countKpi(id: string, title: Bi, meaning: Bi, dt: string, filters: Filters, o: { better?: "up" | "down" | "none"; at?: KpiSpec["at"]; sub?: (c: Ctx, r: Doc[]) => Bi | undefined; sources?: string[] } = {}): KpiSpec {
  return { id, title, meaning, sources: o.sources ?? [dt], unit: "count", better: o.better ?? "none", at: o.at,
    value: (c) => { const f = fl(filters, c); const r = where(rows(dt, c), f); if (!r) return { value: null, status: "denied" }; return { value: r.length, drill: { kind: "list", doctype: dt, filters: [...f, ...companyFilter(dt, c)] }, sub: o.sub?.(c, r) }; } };
}
/** A sum card: the value is the sum of `field` over exactly the rows its drill lists. */
export function sumKpi(id: string, title: Bi, meaning: Bi, dt: string, field: string, filters: Filters, o: { better?: "up" | "down" | "none"; at?: KpiSpec["at"]; unit?: Unit } = {}): KpiSpec {
  return { id, title, meaning, sources: [dt], unit: o.unit ?? "money", better: o.better ?? "none", at: o.at,
    value: (c) => { const f = fl(filters, c); const r = where(rows(dt, c), f); if (!r) return { value: null, status: "denied" }; return { value: sum(r, field), drill: { kind: "list", doctype: dt, filters: [...f, ...companyFilter(dt, c)] }, sub: [`${r.length} records`, `${r.length} سجل`] }; } };
}
/** History of a population with a start date and an optional end date: rows alive on `on`. */
export const aliveAt = (dt: string, start: string, end: string | undefined, pred: (d: Doc) => boolean = () => true) => (c: Ctx, on: string) => {
  const r = rows(dt, c); if (!r) return null;
  return r.filter((d) => pred(d) && d10(d[start]) && d10(d[start]) <= on && (!end || !d10(d[end]) || d10(d[end]) > on)).length;
};
/** History of a flow: rows dated within the 30 days ending `on`. */
export const flowAt = (dt: string, field: string, pred: (d: Doc) => boolean = () => true, days = 30) => (c: Ctx, on: string) => {
  const r = rows(dt, c); if (!r) return null; const from = addDays(on, -(days - 1));
  return r.filter((d) => pred(d) && d10(d[field]) >= from && d10(d[field]) <= on).length;
};
/** History of an open queue: created (dateField) on/before `on` and still open then (closed records count until their close date when known). */
export const openAt = (dt: string, field: string, isOpenNow: (d: Doc) => boolean, closedOn?: (d: Doc) => string) => (c: Ctx, on: string) => {
  const r = rows(dt, c); if (!r) return null;
  return r.filter((d) => { const f = d10(d[field]) || d10(d["creation"]); if (!f || f > on) return false; if (isOpenNow(d)) return true; const cl = closedOn?.(d) || d10(d["modified"]); return !!cl && cl > on; }).length;
};

/* ------------------------------------------------------------------ charts ------------------------------------------------------------------ */
export const denied = (kind: WidgetData["kind"] = "series"): WidgetData => ({ kind, status: "denied", value: 0, points: [], columns: [], rows: [], rowKeys: [], colKeys: [], values: [], axes: { x: ["", ""], y: ["", ""], size: ["", ""] } } as unknown as WidgetData);
export const L = (c: Ctx, b: Bi) => (c.ar ? b[1] : b[0]);
export function seriesBy(c: Ctx, r: Doc[], dt: string, field: string, groups: [value: string, en: string, ar: string, tone?: "ok" | "warn" | "bad" | "info"][], base: Filter[] = [], valueLabel: Bi = ["Records", "السجلات"]): WidgetData {
  return { kind: "series", status: r.length ? "ok" : "empty", valueLabel, points: groups.map(([v, en, ar, tone]) => ({ key: v, label: c.ar ? ar : en, value: r.filter((d) => s(d[field]) === v).length, ...(tone ? { tone } : {}),
    drill: { kind: "list", doctype: dt, filters: [...base, [field, "=", v]] } })) };
}
export function groupCount(r: Doc[], key: (d: Doc) => string): Map<string, Doc[]> { const m = new Map<string, Doc[]>(); for (const d of r) { const k = key(d) || "—"; const a = m.get(k); if (a) a.push(d); else m.set(k, [d]); } return m; }
/** A label for a department / branch value without the company abbreviation suffix ("Sales - DDT" → "Sales"). */
export const unitLabel = (v: string) => v.replace(/\s+-\s+[A-Z0-9]{2,6}$/, "");

/* ------------------------------------------------------------------ shared builders ------------------------------------------------------------------ */
/** Records dated in each of the last `k` months (by `field`), one bar per month, each drilling to its own rows. */
export function monthly(c: Ctx, dt: string, r: Doc[] | null, field: string, k = 12, o: { value?: (rs: Doc[]) => number; valueLabel?: Bi; base?: Filter[] } = {}): WidgetData {
  if (!r) return denied();
  const ms = monthsBack(c.on, k);
  return { kind: "series", status: r.length ? "ok" : "empty", valueLabel: o.valueLabel ?? ["Records", "السجلات"], points: ms.map((m) => { const sel = r.filter((d) => d10(d[field]).slice(0, 7) === m);
    return { key: m, label: m, value: o.value ? o.value(sel) : sel.length, drill: { kind: "list", doctype: dt, filters: [...(o.base ?? []), [field, "between", [`${m}-01`, monthEnd(m)]]] } }; }) };
}
/** A drill to exactly these rows (by name). */
export const names = (dt: string, r: Doc[]): Drill => ({ kind: "list", doctype: dt, filters: [["name", "in", r.map((d) => d.name).join(",") || "__none__"]] });
/** Bars of rows grouped by a key (largest first), each drilling to its rows by name. */
export function bars(c: Ctx, dt: string, r: Doc[] | null, key: (d: Doc) => string, o: { top?: number; label?: (k: string) => string; value?: (rs: Doc[]) => number; valueLabel?: Bi; tone?: (k: string) => "ok" | "warn" | "bad" | "info" | undefined; data?: boolean } = {}): WidgetData {
  if (!r) return denied();
  const g = [...groupCount(r, key)].map(([k, v]) => [k, v, o.value ? o.value(v) : v.length] as const).sort((a, b) => b[2] - a[2]).slice(0, o.top ?? 12);
  return { kind: "series", status: r.length ? "ok" : "empty", valueLabel: o.valueLabel ?? ["Records", "السجلات"], points: g.map(([k, v, val]) => { const tone = o.tone?.(k); return { key: k, label: k === "—" ? L(c, ["Not set", "غير محدد"]) : o.label ? o.label(k) : unitLabel(k), value: val, data: o.data ?? true, ...(tone ? { tone } : {}), drill: names(dt, v) }; }) };
}
/** Rows table for a list chart (dated rows feed calendar / timeline views). */
export function rowsData(columns: { key: string; label: Bi; data?: boolean; numeric?: boolean }[], list: { id: string; cells: Record<string, string | number | null>; date?: string | undefined; end?: string | undefined; drill?: Drill | undefined; tone?: "ok" | "warn" | "bad" | "info" | undefined; lane?: string | undefined }[], o: { total?: number; lanes?: string[] } = {}): WidgetData {
  return { kind: "rows", status: list.length ? "ok" : "empty", columns, rows: list, total: o.total ?? list.length, ...(o.lanes ? { lanes: o.lanes } : {}) } as unknown as WidgetData;
}
/** Today's open state of an approval document: draft and not decided. */
export const pending = (d: Doc) => Number(d.docstatus ?? 0) === 0;
export const age = (c: Ctx, iso: string) => (iso ? Math.max(0, daysBetween(iso, c.on)) : 0);
/** Swap a series × period matrix to the chart layout (rows = bars / periods, columns = series). */
export const flip = (rowKeys: string[], colKeys: string[], values: number[][]) => ({ rowKeys: colKeys, colKeys: rowKeys, values: colKeys.map((_, j) => rowKeys.map((_, i) => values[i]?.[j] ?? 0)) });
