/**
 * Enterprise Visual Round 1 §3 — the colour registry of the Enterprise theme (values live in enterprise/tokens.css):
 * eight extended hues with soft twins, five tints, five chart palettes of eight colours (Emerald is the default; the
 * chooser comes in Round 2) and the module colour of every app area. Components refer to these token names only.
 */
export type Hue = "teal" | "blue" | "violet" | "amber" | "coral" | "rose" | "gold" | "lime";
export const HUES: Hue[] = ["teal", "blue", "violet", "amber", "coral", "rose", "gold", "lime"];
export const TINTS = ["tint-emerald", "tint-deep", "tint-blue", "tint-amber", "tint-rose"] as const;
export type PaletteId = "emerald" | "gulf" | "desert" | "vivid" | "mono";
export const PALETTES: Record<PaletteId, { label: [string, string]; colours: string[] }> = {
  emerald: { label: ["Emerald", "زمردي"], colours: Array.from({ length: 8 }, (_, i) => `var(--pal-emerald-${i + 1})`) },
  gulf: { label: ["Gulf", "خليجي"], colours: Array.from({ length: 8 }, (_, i) => `var(--pal-gulf-${i + 1})`) },
  desert: { label: ["Desert", "صحراوي"], colours: Array.from({ length: 8 }, (_, i) => `var(--pal-desert-${i + 1})`) },
  vivid: { label: ["Vivid", "زاهٍ"], colours: Array.from({ length: 8 }, (_, i) => `var(--pal-vivid-${i + 1})`) },
  mono: { label: ["Mono", "أحادي"], colours: Array.from({ length: 8 }, (_, i) => `var(--pal-mono-${i + 1})`) },
};
export const DEFAULT_PALETTE: PaletteId = "emerald";

/** App areas with their own colour (icon tiles, tab underline, hero chip dot, first chart colour). Sidebar, primary
 *  buttons and focus stay Deep / Emerald. */
export type ModuleId = "finance" | "sales" | "purchasing" | "inventory" | "hr" | "payroll" | "projects" | "manufacturing" | "crm" | "pos";
export const MODULE_HUE: Record<ModuleId, "emerald" | Hue> = {
  finance: "emerald", sales: "blue", purchasing: "teal", inventory: "amber", hr: "violet", payroll: "gold", projects: "coral", manufacturing: "lime", crm: "blue", pos: "teal",
};
const PRO_DEPT: Record<string, ModuleId> = { accounting: "finance", selling: "sales", purchasing: "purchasing", inventory: "inventory", stock: "inventory", buying: "purchasing", assets: "finance", finance: "finance" };
const PAYROLL_DT = /^(Salary Slip|Salary Structure|Salary Structure Assignment|Salary Component|Payroll Entry|Payroll Period|Additional Salary|Employee Incentive|Retention Bonus|Income Tax Slab|Employee Tax Exemption.*|Gratuity.*)$/;
const SALES_DT = /^(Sales Order|Quotation|Delivery Note|Customer|Sales Partner|Sales Person|Opportunity|Lead)$/;
const BUY_DT = /^(Purchase Order|Purchase Receipt|Supplier|Supplier Quotation|Request for Quotation|Material Request)$/;
const STOCK_DT = /^(Stock Entry|Stock Reconciliation|Item|Warehouse|Bin|Batch|Serial No|Pick List|Stock Ledger Entry)$/;
const dtOfSlug = (s: string) => decodeURIComponent(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * The module an address belongs to: the app (Construction coral, CRM blue, POS teal, Manufacturing lime), the HR area
 * (payroll gold, everything else violet) or the Pro department (finance / sales / purchasing / inventory); desk pages
 * opened from an app take the app's module, and Pro / HR desk lists take their document's area.
 */
export function moduleFor(path: string, app?: string | undefined): ModuleId | undefined {
  const p = path.replace(/\/+$/, "") || "/";
  if (/^\/(construction|plugins\/digit_construction)(\/|$)/.test(p) || app === "digit_construction") return "projects";
  if (/^\/crm(\/|$)/.test(p) || app === "digit_crm" || app === "crm") return "crm";
  if (/^\/(pos|point-of-sale)(\/|$)/.test(p) || app === "digit_pos" || app === "pos") return "pos";
  if (/^\/(manufacturing|mfg)(\/|$)/.test(p) || app === "digit_manufacturing" || app === "manufacturing") return "manufacturing";
  const docSlug = p.match(/^\/(?:hr|construction|pro)\/doc\/([^/]+)/)?.[1] ?? p.match(/^\/app\/[^/]+\/([^/]+)/)?.[1];
  const dt = docSlug ? dtOfSlug(docSlug) : undefined;
  if (/^\/(hr|digit-hr)(\/|$)/.test(p) || app === "digit_hr") {
    if (dt && PAYROLL_DT.test(dt)) return "payroll";
    if (/^\/hr\/payroll(\/|$)/.test(p) || /^\/digit-hr\/(payroll|m\/04|s\/04)/.test(p)) return "payroll";
    return "hr";
  }
  if (/^\/pro(\/|$)/.test(p) || app === "digit_pro") {
    if (/^\/pro\/selling-overview/.test(p)) return "sales";
    if (/^\/pro\/purchasing-overview/.test(p)) return "purchasing";
    if (/^\/pro\/inventory-overview/.test(p)) return "inventory";
    if (dt) return SALES_DT.test(dt) ? "sales" : BUY_DT.test(dt) ? "purchasing" : STOCK_DT.test(dt) ? "inventory" : "finance";
    const dept = p.match(/^\/pro\/([^/]+)/)?.[1];
    return (dept && PRO_DEPT[dept]) || "finance";
  }
  return undefined;
}
