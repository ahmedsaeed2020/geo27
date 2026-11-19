/** Global Search settings per DocType (spec §2 Data › Global Search): include toggle, searched fields, priority. */
export interface GsConfig { include: boolean; fields: string[] }
const KEY = "digit-virtual-core:global-search";
type All = { doctypes: Record<string, GsConfig>; priority: string[] };
export function gsAll(): All {
  if (typeof window === "undefined") return { doctypes: {}, priority: [] };
  try { return { doctypes: {}, priority: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { doctypes: {}, priority: [] }; }
}
export function gsSave(a: All) { localStorage.setItem(KEY, JSON.stringify(a)); }
export const gsFor = (dt: string): GsConfig | undefined => gsAll().doctypes[dt];
