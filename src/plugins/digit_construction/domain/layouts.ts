/**
 * FIN-05 dashboard layouts and saved report views — read models and validation (no writes here; see
 * domain/layoutActions.ts).
 *
 * Layout precedence: personal (Digit Dashboard Layout level User, for the current user) → role default (level Role,
 * for one of the user's roles; newest wins) → company default (level Company, for the scope company) → system default
 * (the dashboard definition / its Insights Dashboard v3 record). A stored layout keeps its order and hidden flags for
 * the items it names; items the system adds later are appended visible, and unknown ids are ignored, so a stale layout
 * never hides new cards and never shows a metric that no longer exists. Layout records are configuration, read like a
 * server-side settings lookup (all levels), while writes go through the document API with owner-only permission.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { parseJSON } from "@/lib/insights";
import { currentUser, userRoles } from "@/lib/session";
import { DASHBOARDS, dashboardByKey, type DashboardDef } from "../analytics/catalog";
import { CONSTRUCTION_REPORTS } from "../reports";
import { num } from "./calc";
import { rows } from "./data";

export type LayoutLevel = "User" | "Role" | "Company" | "System";
export interface LayoutItem { type: "Metric" | "Chart"; id: string; hidden: boolean }
export interface ResolvedLayout { level: LayoutLevel; record?: string | undefined; target?: string | undefined; items: LayoutItem[]; metrics: string[]; charts: string[] }

/** Charts of a dashboard: its Insights Dashboard v3 items when the record exists (user-edited in Insights), else the definition. Number-card charts (DCON-C-M-*) are cards, not charts. */
export function dashboardCharts(dd: DashboardDef): string[] {
  const rec = adapter.get("Insights Dashboard v3", dd.id);
  const items = rec ? parseJSON<{ type?: string; chart?: string }[]>(rec["items"], []).filter((i) => i.type === "chart" && i.chart).map((i) => i.chart!) : dd.charts;
  return items.filter((c) => !c.startsWith("DCON-C-M-"));
}
/** System default: definition metrics then dashboard charts, all visible. */
export function systemItems(dd: DashboardDef): LayoutItem[] {
  return [...dd.metrics.map((id) => ({ type: "Metric" as const, id, hidden: false })), ...dashboardCharts(dd).map((id) => ({ type: "Chart" as const, id, hidden: false }))];
}
const keyOf = (i: { type: string; id: string }) => `${i.type}|${i.id}`;
/** Stored items applied to the current pool (order + hidden kept; unknown dropped; new pool items appended visible). */
export function applyItems(pool: LayoutItem[], stored: LayoutItem[]): LayoutItem[] {
  const known = new Map(pool.map((p) => [keyOf(p), p]));
  const seen = new Set<string>(); const out: LayoutItem[] = [];
  for (const s of stored) { const k = keyOf(s); if (known.has(k) && !seen.has(k)) { seen.add(k); out.push({ ...known.get(k)!, hidden: !!s.hidden }); } }
  for (const p of pool) if (!seen.has(keyOf(p))) out.push({ ...p });
  return out;
}
export const recordItems = (d: Doc): LayoutItem[] => rows(d, "items").map((r) => ({ type: r["item_type"] === "Chart" ? "Chart" : "Metric", id: String(r["item_id"] ?? ""), hidden: num(r["hidden"]) === 1 }));
/** Every layout record of a dashboard (configuration lookup, all levels). */
export const layoutRecords = (dash: string): Doc[] => adapter.list("Digit Dashboard Layout").filter((d) => d["dashboard"] === dash && !d["__islocal"]);
const newest = (ds: Doc[]) => [...ds].sort((a, b) => String(b["modified"] ?? "").localeCompare(String(a["modified"] ?? "")) || b.name.localeCompare(a.name))[0];
/** The record that holds the layout of one level and target (one per dashboard + level + target). */
export function layoutRecordFor(dash: string, level: Exclude<LayoutLevel, "System">, target: string): Doc | undefined {
  const f = level === "User" ? "for_user" : level === "Role" ? "for_role" : "for_company";
  return newest(layoutRecords(dash).filter((d) => d["level"] === level && d[f] === target && (level !== "User" || String(d["owner"] ?? "") === target)));
}
export interface LayoutContext { user?: string | undefined; roles?: string[] | undefined; company?: string | undefined }
/** Effective layout for the user (personal → role → company → system). */
export function resolveLayout(dd: DashboardDef, ctx: LayoutContext = {}): ResolvedLayout {
  const user = ctx.user ?? currentUser(), roles = ctx.roles ?? userRoles(user);
  const pool = systemItems(dd);
  const recs = layoutRecords(dd.key);
  const mine = newest(recs.filter((d) => d["level"] === "User" && d["for_user"] === user && String(d["owner"] ?? "") === user));
  const role = mine ? undefined : newest(recs.filter((d) => d["level"] === "Role" && roles.includes(String(d["for_role"] ?? ""))));
  const comp = mine || role || !ctx.company ? undefined : newest(recs.filter((d) => d["level"] === "Company" && d["for_company"] === ctx.company));
  const rec = mine ?? role ?? comp;
  const level: LayoutLevel = mine ? "User" : role ? "Role" : comp ? "Company" : "System";
  const items = rec ? applyItems(pool, recordItems(rec)) : pool;
  return { level, record: rec?.name, target: mine ? user : role ? String(role["for_role"]) : comp ? String(comp["for_company"]) : undefined, items,
    metrics: items.filter((i) => i.type === "Metric" && !i.hidden).map((i) => i.id), charts: items.filter((i) => i.type === "Chart" && !i.hidden).map((i) => i.id) };
}
/** The layout one level below `level` (what Reset falls back to), for the same user context. */
export function fallbackLayout(dd: DashboardDef, level: Exclude<LayoutLevel, "System">, ctx: LayoutContext = {}): ResolvedLayout {
  const roles = ctx.roles ?? userRoles(ctx.user ?? currentUser());
  // a user that matches no personal record ("\u0000") skips the personal level; empty roles skip the role level
  return resolveLayout(dd, { user: "\u0000", roles: level === "User" ? roles : [], company: level === "Company" ? undefined : ctx.company });
}

/** Validation hook for Digit Dashboard Layout (dashboard known, level target consistent, items known and unique, one record per target). */
export function checkLayout(doc: Doc, user = currentUser()): string[] {
  const e: string[] = [];
  const dd = dashboardByKey(String(doc["dashboard"] ?? ""));
  if (!dd) { e.push(`Unknown dashboard ${String(doc["dashboard"] ?? "")}`); return e; }
  const level = String(doc["level"] ?? "");
  if (level === "User") { if (!doc["for_user"]) e.push("A personal layout needs For User"); else if (doc["for_user"] !== (doc["owner"] ?? user)) e.push("A personal layout belongs to its owner only"); else if (user !== doc["for_user"] && user !== "Administrator" && !userRoles(user).includes("System Manager")) e.push("Only its owner changes a personal layout"); }
  else if (level === "Role") { if (!doc["for_role"]) e.push("A role default needs For Role"); }
  else if (level === "Company") { if (!doc["for_company"]) e.push("A company default needs For Company"); }
  else e.push("Level must be User, Role or Company");
  if (level !== "User") { const r = userRoles(user); if (!r.includes("System Manager") && !r.includes("Digit Director") && user !== "Administrator") e.push("Only a System Manager or Digit Director publishes role or company defaults"); }
  const pool = new Set(systemItems(dd).map(keyOf));
  const items = recordItems(doc); const seen = new Set<string>();
  for (const i of items) { const k = keyOf(i); if (!pool.has(k)) e.push(`${i.type} ${i.id} is not on the ${dd.en} dashboard`); if (seen.has(k)) e.push(`${i.type} ${i.id} is listed twice`); seen.add(k); }
  if (items.length && items.every((i) => i.hidden)) e.push("A layout must show at least one card or chart");
  const f = level === "User" ? "for_user" : level === "Role" ? "for_role" : "for_company";
  const dup = layoutRecords(dd.key).find((d) => d.name !== doc.name && d["level"] === level && d[f] === doc[f] && (level !== "User" || d["owner"] === (doc["owner"] ?? user)));
  if (dup) e.push(`A ${level.toLowerCase()} layout for this dashboard already exists (${dup.name}); edit it instead`);
  return e;
}

// ---------------------------------------------------------------- saved report views
export interface ViewState { [k: string]: string }
/** URL keys a saved view may hold for a report: its filter fieldnames plus row filters (rf). */
export function viewKeys(report: string): string[] { const r = CONSTRUCTION_REPORTS.find((x) => x.name === report); return r ? [...(r.filters ?? []).map((f) => f.fieldname), "rf"] : []; }
/** Search state of a saved view (only allowed keys with string values). */
export function viewState(d: Doc): ViewState {
  const keys = new Set(viewKeys(String(d["report"] ?? "")));
  const raw = parseJSON<Record<string, unknown>>(d["filters_json"], {});
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => keys.has(k) && typeof v === "string" && v !== "")) as ViewState;
}
/** Validation hook for Digit Saved View (known report, allowed filter keys, unique active name per owner and report, version +1 on change). */
export function checkView(doc: Doc, before: Doc | undefined, user = currentUser()): { doc: Doc; errors: string[] } {
  const e: string[] = [];
  const report = String(doc["report"] ?? "");
  if (!CONSTRUCTION_REPORTS.some((r) => r.name === report)) e.push(`Unknown report ${report}`);
  const name = String(doc["view_name"] ?? "").trim();
  if (!name) e.push("View Name is required");
  let raw: unknown = undefined;
  try { raw = JSON.parse(String(doc["filters_json"] ?? "")); } catch { e.push("Filters must be valid JSON"); }
  if (raw !== undefined && (typeof raw !== "object" || raw === null || Array.isArray(raw))) e.push("Filters must be an object");
  else if (raw) {
    const keys = new Set(viewKeys(report));
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) { if (!keys.has(k)) e.push(`Filter ${k} is not a filter of ${report}`); else if (typeof v !== "string") e.push(`Filter ${k} must be text`); }
    const rf = (raw as Record<string, unknown>)["rf"];
    if (typeof rf === "string" && rf) { const p = parseJSON<unknown>(rf, null); if (!Array.isArray(p)) e.push("Row filters must be a list"); }
  }
  const owner = String(doc["owner"] ?? user);
  if (name && doc["status"] !== "Archived" && adapter.list("Digit Saved View").some((v) => v.name !== doc.name && !v["__islocal"] && String(v["owner"] ?? "") === owner && v["report"] === report && v["status"] !== "Archived" && String(v["view_name"] ?? "").trim().toLowerCase() === name.toLowerCase()))
    e.push(`You already have a view named "${name}" for this report`);
  const changed = !before || before["filters_json"] !== doc["filters_json"] || before["view_name"] !== doc["view_name"];
  return { doc: { ...doc, view_name: name, visibility: "Personal", version: changed ? num(before?.["version"]) + 1 : num(doc["version"]) || 1 }, errors: e };
}
export const DASHBOARD_KEYS = DASHBOARDS.map((d) => d.key);
