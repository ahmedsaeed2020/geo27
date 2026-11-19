/**
 * CRM dashboard/workspace personalization — three layers, presentation only (order + hidden widget ids):
 *   1. System default  — the composition order defined in code (Boards ORDER / workspaces.ts).
 *   2. Team default    — a non-private native Frappe CRM "CRM Dashboard" record (title `DIGIT CRM · <dash>`, layout JSON),
 *                        written only by roles with write permission on CRM Dashboard (source: Sales Manager, System Manager).
 *   3. My layout       — the Core per-user setting widget_layout (src/lib/userSettings.ts), any CRM user, any time.
 * Layouts never store values and never change what a user may read: widgets are still computed from scoped records.
 * The CRM Dashboard source DocType has no company/role field, so a company-specific default is a documented gap.
 */
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm } from "@/lib/session";
import { getSettings, setWidgetLayout, widgetLayoutOf, type WidgetLayout } from "@/lib/userSettings";

export const CRM_DASH_DT = "CRM Dashboard";
export const APP = "digit_crm";
export type LayoutSource = "personal" | "team" | "default";
export const teamRecordName = (dash: string) => `DIGIT CRM · ${dash}`;

/** Keep only known ids; ids added to the composition later are appended so nothing silently disappears. */
export function normalize(raw: Partial<WidgetLayout> | undefined, ids: readonly string[]): WidgetLayout {
  const known = new Set(ids);
  const order = [...new Set((raw?.order ?? []).filter((x): x is string => typeof x === "string" && known.has(x)))];
  for (const id of ids) if (!order.includes(id)) order.push(id);
  return { order, hidden: [...new Set((raw?.hidden ?? []).filter((x): x is string => typeof x === "string" && known.has(x)))] };
}

/** CRM Dashboard.layout is a JSON array (Frappe CRM default "[]"): one item per widget, array order = display order. */
export function parseTeamLayout(json: unknown): Partial<WidgetLayout> | undefined {
  let v: unknown; try { v = typeof json === "string" ? JSON.parse(json) : json; } catch { return undefined; }
  if (!Array.isArray(v)) return undefined;
  const items = v.filter((x): x is { name: string; hidden?: unknown } => !!x && typeof (x as { name?: unknown }).name === "string");
  return { order: items.map((x) => x.name), hidden: items.filter((x) => Boolean(x.hidden)).map((x) => x.name) };
}
export const teamLayoutJson = (l: WidgetLayout) => JSON.stringify(l.order.map((name) => ({ name, type: "digit_widget", ...(l.hidden.includes(name) ? { hidden: 1 } : {}) })));

function canRead(user: string) { const m = cachedMeta(CRM_DASH_DT); return !!m && hasPerm(m, "read", undefined, user); }
/** Publishing a team default needs write permission on the native CRM Dashboard DocType. */
export function canPublishTeam(user: string) { const m = cachedMeta(CRM_DASH_DT); return !!m && hasPerm(m, "write", undefined, user) && hasPerm(m, "create", undefined, user); }

export function resolveBoardLayout(dash: string, user: string, ids: readonly string[]): { layout: WidgetLayout; source: LayoutSource } {
  const mine = widgetLayoutOf(getSettings(), APP, dash, user);
  if (mine) return { layout: normalize(mine, ids), source: "personal" };
  const team = canRead(user) ? adapter.get(CRM_DASH_DT, teamRecordName(dash)) : undefined;
  const parsed = team && !Number(team["private"]) ? parseTeamLayout(team["layout"]) : undefined;
  if (parsed) return { layout: normalize(parsed, ids), source: "team" };
  return { layout: normalize(undefined, ids), source: "default" };
}

export function savePersonal(dash: string, user: string, l: WidgetLayout) { setWidgetLayout(APP, dash, user, l); }
export function resetPersonal(dash: string, user: string) { setWidgetLayout(APP, dash, user, null); }
export function publishTeam(dash: string, user: string, l: WidgetLayout): { ok: true } | { ok: false; error: string } {
  if (!canPublishTeam(user)) return { ok: false, error: "Not permitted" };
  const name = teamRecordName(dash), layout = teamLayoutJson(l);
  if (adapter.get(CRM_DASH_DT, name)) adapter.update(CRM_DASH_DT, name, { layout, private: 0 });
  else adapter.insertDoc(CRM_DASH_DT, { name, title: name, private: 0, layout });
  return { ok: true };
}

export function moveId(l: WidgetLayout, id: string, dir: -1 | 1): WidgetLayout {
  const o = [...l.order], i = o.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= o.length) return l;
  [o[i], o[j]] = [o[j]!, o[i]!]; return { ...l, order: o };
}
export const toggleId = (l: WidgetLayout, id: string): WidgetLayout => ({ ...l, hidden: l.hidden.includes(id) ? l.hidden.filter((x) => x !== id) : [...l.hidden, id] });
