/**
 * P1 editable dashboards — layouts are adapter records of the DIGIT Pro app's own DocType "Digit Pro Dashboard Layout"
 * (fields dashboard / scope / user / layout_json, same as frappe_apps/digit_pro). Personal beats Team beats built-in default.
 * Layouts only order/hide sections; they never store business values.
 */
import { adapter, type Doc } from "@/lib/adapter";

export const LAYOUT_DT = "Digit Pro Dashboard Layout";
/** period = trend chart months (6 or 12), an eligible chart setting; never business values. */
export interface DashLayout { order: string[]; hidden: string[]; period?: 6 | 12 }
export type LayoutSource = "personal" | "team" | "default";

const key = (dash: string, scope: "Personal" | "Team", user: string) => scope === "Team" ? `team::${dash}` : `${user}::${dash}`;

export function parseLayout(raw: unknown, sections: readonly string[]): DashLayout {
  let v: Partial<DashLayout> = {};
  try { v = typeof raw === "string" ? JSON.parse(raw) : {}; } catch { v = {}; }
  const known = new Set(sections);
  const order = (Array.isArray(v.order) ? v.order : []).filter((s): s is string => typeof s === "string" && known.has(s));
  for (const s of sections) if (!order.includes(s)) order.push(s); // sections added later appear at the end
  const period = v.period === 12 ? 12 : v.period === 6 ? 6 : undefined;
  return { ...(period ? { period } : {}), order: [...new Set(order)], hidden: (Array.isArray(v.hidden) ? v.hidden : []).filter((s): s is string => typeof s === "string" && known.has(s)) };
}

export function resolveLayout(dash: string, user: string, sections: readonly string[], get: (n: string) => Doc | undefined = (n) => adapter.get(LAYOUT_DT, n)): { layout: DashLayout; source: LayoutSource } {
  const p = get(key(dash, "Personal", user)); if (p) return { layout: parseLayout(p["layout_json"], sections), source: "personal" };
  const t = get(key(dash, "Team", user)); if (t) return { layout: parseLayout(t["layout_json"], sections), source: "team" };
  return { layout: { order: [...sections], hidden: [] }, source: "default" };
}

export function saveLayout(dash: string, scope: "Personal" | "Team", user: string, layout: DashLayout) {
  const name = key(dash, scope, user); const layout_json = JSON.stringify(layout);
  if (adapter.get(LAYOUT_DT, name)) adapter.update(LAYOUT_DT, name, { layout_json });
  else adapter.insertDoc(LAYOUT_DT, { name, dashboard: dash, scope, user: scope === "Personal" ? user : "", layout_json });
}
export function resetPersonal(dash: string, user: string) { adapter.remove(LAYOUT_DT, key(dash, "Personal", user)); }

export function move(l: DashLayout, id: string, dir: -1 | 1): DashLayout {
  const o = [...l.order]; const i = o.indexOf(id); const j = i + dir;
  if (i < 0 || j < 0 || j >= o.length) return l;
  [o[i], o[j]] = [o[j]!, o[i]!]; return { ...l, order: o };
}
export const toggle = (l: DashLayout, id: string): DashLayout => ({ ...l, hidden: l.hidden.includes(id) ? l.hidden.filter((x) => x !== id) : [...l.hidden, id] });
