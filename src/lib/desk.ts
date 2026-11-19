/**
 * Frappe Desk reconstruction data: Desktop Icons (launcher), Workspace Sidebars,
 * Workspaces (content blocks), Number Cards and Dashboard Charts — all read from
 * source JSON in public/catalog. Values are computed from VirtualERPAdapter records.
 */
import { queryOptions } from "@tanstack/react-query";
import { adapter, type Doc } from "./adapter";
import { canReadType, scopedList } from "./scope";

const isBrowser = typeof window !== "undefined";
const q = <T,>(key: string, file: string) =>
  queryOptions({ queryKey: [key], queryFn: () => fetch(`/catalog/${file}`).then((r) => r.json() as Promise<T>), staleTime: Infinity, enabled: isBrowser });

export interface DesktopIcon { name: string; label: string; icon: string; icon_type: string; link_to?: string; link_type: string; parent_icon?: string; hidden: number; idx: number; app: string; source: string }
export interface SidebarItem { label: string; type: string; link_type?: string; link_to?: string; icon?: string; indent?: number; child?: number; collapsible?: number; keep_closed?: number; url?: string }
export interface Sidebar { name: string; title: string; module: string; app: string; items: SidebarItem[]; source: string }
export interface WsBlock { id: string; type: string; data: Record<string, unknown> }
export interface WorkspaceFull {
  name: string; title: string; module: string; app: string; icon?: string; parent_page?: string; source: string;
  content: WsBlock[]; charts: { chart_name: string; label: string }[]; number_cards: { number_card_name: string; label: string }[];
  shortcuts: { label: string; link_to?: string; type?: string; url?: string; doc_view?: string; stats_filter?: string; color?: string }[];
  links: { type: string; label: string; link_to?: string; link_type?: string; hidden?: number; is_query_report?: number }[];
  quick_lists: { label?: string; document_type?: string; quick_list_filter?: string }[];
}
export interface NumberCard { name: string; label: string; type: string; module?: string; document_type?: string; function?: string; aggregate_function_based_on?: string; filters_json?: string; dynamic_filters_json?: string; report_name?: string; method?: string; source: string; app: string }
export interface Chart { name: string; chart_name: string; chart_type: string; type?: string; module?: string; document_type?: string; based_on?: string; value_based_on?: string; group_by_type?: string; group_by_based_on?: string; aggregate_function_based_on?: string; timeseries?: number; time_interval?: string; timespan?: string; filters_json?: string; dynamic_filters_json?: string; report_name?: string; empty_state_message?: string; source: string; app: string; number_of_groups?: number }

export const iconsQuery = q<DesktopIcon[]>("desk-icons", "desktop_icons.json");
export const sidebarsQuery = q<Sidebar[]>("desk-sidebars", "sidebars.json");
export const workspacesFullQuery = q<WorkspaceFull[]>("desk-ws", "workspaces.json");
export const numberCardsQuery = q<Record<string, NumberCard>>("desk-cards", "number_cards.json");
export const chartsQuery = q<Record<string, Chart>>("desk-charts", "charts.json");

/** Frappe list filter tuple [doctype, field, op, value] or [field, op, value]. */
export type Filter = [string, string, unknown] ;
export function parseFilters(json?: string): { filters: Filter[]; unsupported: string[] } {
  const out: Filter[] = []; const unsupported: string[] = [];
  if (!json) return { filters: out, unsupported };
  try {
    const raw = JSON.parse(json);
    const arr: unknown[][] = Array.isArray(raw) ? raw : Object.entries(raw).map(([k, v]) => [k, "=", v]);
    for (const f of arr) {
      const t = f.length === 4 ? f.slice(1) : f;
      out.push([String(t[0]), String(t[1]), t[2]]);
    }
  } catch { unsupported.push("unparseable filters_json"); }
  return { filters: out, unsupported };
}

export function matchFilter(d: Doc, [field, op, value]: Filter): boolean {
  const raw = field === "docstatus" ? (d.docstatus ?? 0) : d[field];
  // Frappe stores unset Check/Int columns as 0, so a missing value compares as 0 against numeric filters.
  const v = raw == null && (value === 0 || value === "0") ? 0 : raw;
  const o = op.toLowerCase();
  if (o === "timespan") return inTimespan(String(v ?? ""), String(value ?? ""));
  const num = (x: unknown) => (typeof x === "string" && x !== "" && !isNaN(Number(x)) ? Number(x) : x);
  switch (o) {
    case "=": return String(v ?? "") === String(value ?? "") || num(v) === num(value);
    case "!=": return String(v ?? "") !== String(value ?? "");
    case ">": return (num(v) as number) > (num(value) as number);
    case "<": return (num(v) as number) < (num(value) as number);
    case ">=": return (num(v) as number) >= (num(value) as number);
    case "<=": return (num(v) as number) <= (num(value) as number);
    case "in": return (Array.isArray(value) ? value : String(value).split(",")).map(String).includes(String(v));
    case "not in": return !(Array.isArray(value) ? value : String(value).split(",")).map(String).includes(String(v));
    case "like": return String(v ?? "").toLowerCase().includes(String(value).replace(/%/g, "").toLowerCase());
    case "not like": return !String(v ?? "").toLowerCase().includes(String(value).replace(/%/g, "").toLowerCase());
    case "is": return value === "set" ? v != null && v !== "" : v == null || v === "";
    case "between": return Array.isArray(value) ? String(v) >= String(value[0]) && String(v) <= String(value[1]) : true;
    default: return true;
  }
}

/** frappe.utils.get_timespan_date_range: this/last/next week|month|quarter|6 months|year, today, yesterday. */
function inTimespan(d: string, span: string): boolean {
  if (!d) return false;
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const sp = span.toLowerCase(); let a: Date, b: Date;
  const q = Math.floor(m / 3) * 3;
  if (sp === "today") a = b = now;
  else if (sp === "yesterday") a = b = new Date(y, m, now.getDate() - 1);
  else if (sp === "this week") { a = new Date(y, m, now.getDate() - now.getDay()); b = new Date(y, m, a.getDate() + 6); }
  else if (sp === "last week") { a = new Date(y, m, now.getDate() - now.getDay() - 7); b = new Date(y, m, a.getDate() + 6); }
  else if (sp === "this month") { a = new Date(y, m, 1); b = new Date(y, m + 1, 0); }
  else if (sp === "last month") { a = new Date(y, m - 1, 1); b = new Date(y, m, 0); }
  else if (sp === "this quarter") { a = new Date(y, q, 1); b = new Date(y, q + 3, 0); }
  else if (sp === "last quarter") { a = new Date(y, q - 3, 1); b = new Date(y, q, 0); }
  else if (sp === "last 6 months") { a = new Date(y, m - 6, now.getDate()); b = now; }
  else if (sp === "this year") { a = new Date(y, 0, 1); b = new Date(y, 11, 31); }
  else if (sp === "last year") { a = new Date(y - 1, 0, 1); b = new Date(y - 1, 11, 31); }
  else return true;
  const x = d.slice(0, 10); return x >= iso(a) && x <= iso(b);
}

const agg = (fn: string | undefined, rows: Doc[], field?: string) => {
  // base_* company-currency columns fall back to the transaction column when the record has no conversion stored.
  const vals = rows.map((r) => Number(r[field ?? ""] ?? (field?.startsWith("base_") ? r[field.slice(5)] : 0) ?? 0) || 0);
  switch ((fn ?? "Count").toLowerCase()) {
    case "sum": return vals.reduce((a, b) => a + b, 0);
    case "average": return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    case "minimum": return vals.length ? Math.min(...vals) : 0;
    case "maximum": return vals.length ? Math.max(...vals) : 0;
    default: return rows.length;
  }
};

export type CardValue = { status: "computed"; value: number; ignored: string[]; filters: Filter[] } | { status: "server"; reason: string } | { status: "denied"; reason: string };
export function computeCard(c: NumberCard): CardValue {
  if (c.type !== "Document Type" || !c.document_type) return { status: "server", reason: c.type === "Report" ? `Report "${c.report_name}" runs on server` : `Custom method ${c.method ?? ""} runs on server` };
  const { filters } = parseFilters(c.filters_json);
  const ignored = c.dynamic_filters_json && c.dynamic_filters_json !== "[]" ? ["dynamic filters (user defaults / fiscal year) not applied"] : [];
  // number cards count only rows the session user may read (frappe number_card get_result runs frappe.get_list with permissions)
  if (!canReadType(c.document_type)) return { status: "denied", reason: `Not permitted: ${c.document_type}` };
  const rows = scopedList(c.document_type).filter((d) => filters.every((f) => matchFilter(d, f)));
  return { status: "computed", value: agg(c.function, rows, c.aggregate_function_based_on), ignored, filters };
}

export type ChartValue = { status: "computed"; labels: string[]; values: number[]; note: string; filters: Filter[] } | { status: "server"; reason: string } | { status: "denied"; reason: string };
export const TIMESPANS = ["Last Year", "Last Quarter", "Last Month", "Last Week", "All Time"] as const;
export const INTERVALS = ["Yearly", "Quarterly", "Monthly", "Weekly", "Daily"] as const;
/** Bucket key per frappe dashboard_chart time_interval. */
function bucket(d: string, iv: string): string {
  const dt = new Date(d); if (isNaN(dt.getTime())) return "—";
  const y = dt.getFullYear(), m = dt.getMonth();
  if (iv === "Yearly") return String(y);
  if (iv === "Quarterly") return `${y}-Q${Math.floor(m / 3) + 1}`;
  if (iv === "Weekly") { const s = new Date(dt); s.setDate(dt.getDate() - dt.getDay()); return s.toISOString().slice(0, 10); }
  if (iv === "Daily") return d.slice(0, 10);
  return d.slice(0, 7);
}
function inSpan(d: string, span: string): boolean {
  if (span === "All Time") return true;
  const t = new Date(d).getTime(); if (isNaN(t)) return false;
  const days = span === "Last Week" ? 7 : span === "Last Month" ? 31 : span === "Last Quarter" ? 92 : 366;
  return t >= Date.now() - days * 864e5;
}
export function computeChart(c: Chart, opt?: { timespan?: string; time_interval?: string }): ChartValue {
  if (!c.document_type || c.chart_type === "Report" || c.chart_type === "Custom") return { status: "server", reason: c.chart_type === "Report" ? `Uses report "${c.report_name}" (server execute)` : "Custom chart source method runs on server" };
  const { filters } = parseFilters(c.filters_json);
  if (!canReadType(c.document_type)) return { status: "denied", reason: `Not permitted: ${c.document_type}` };
  const rows = scopedList(c.document_type).filter((d) => filters.every((f) => matchFilter(d, f)));
  const groups = new Map<string, Doc[]>();
  if (c.chart_type === "Group By") {
    rows.forEach((r) => { const k = String(r[c.group_by_based_on ?? ""] ?? "—"); groups.set(k, [...(groups.get(k) ?? []), r]); });
    const entries = [...groups.entries()].map(([k, v]) => [k, c.group_by_type === "Count" || !c.group_by_type ? v.length : agg(c.group_by_type, v, c.aggregate_function_based_on)] as const).sort((a, b) => b[1] - a[1]).slice(0, c.number_of_groups || 10);
    return { status: "computed", labels: entries.map((e) => e[0]), values: entries.map((e) => e[1]), note: `Group by ${c.group_by_based_on}`, filters };
  }
  // Count / Sum / Average over a date field (timeseries bucketed by month in preview)
  const iv = opt?.time_interval || c.time_interval || "Monthly", span = opt?.timespan || c.timespan || "Last Year";
  // Frappe always stamps creation; records stored before this field was added fall back to modified.
  const dv = (r: Doc) => String(r[c.based_on ?? ""] ?? (c.based_on === "creation" ? r.modified : "") ?? "");
  rows.filter((r) => inSpan(dv(r), span)).forEach((r) => { const k = bucket(dv(r), iv); groups.set(k, [...(groups.get(k) ?? []), r]); });
  const keys = [...groups.keys()].sort();
  return { status: "computed", labels: keys, values: keys.map((k) => agg(c.chart_type, groups.get(k)!, c.value_based_on)), note: `${c.chart_type} by ${c.based_on} · ${span} · ${iv}`, filters };
}

export const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(Math.round(n * 100) / 100));

/** Module Sidebars (shipped Sidebar docs + computed bases, scripts/extract-sidebars.py port of sidebar.py). */
export interface ModuleSidebar extends Sidebar { header_icon?: string; computed: number }
export const moduleSidebarsQuery = q<ModuleSidebar[]>("desk-module-sidebars", "module_sidebars.json");
export const desktopIconUrlsQuery = q<string[]>("desk-icon-urls", "desktop_icon_urls.json");

/** frappe.scrub */
export const scrub = (s: string) => s.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();

/** frappe.utils.get_desktop_icon: /icons/<app>/desktop_icons/<variant>/<scrub(label)>.svg when shipped. */
export function desktopIconUrl(i: DesktopIcon, urls: string[], variant = "solid"): string | undefined {
  return [variant, "subtle"].map((v) => `/icons/${i.app}/desktop_icons/${v}/${scrub(i.label)}.svg`).find((u) => urls.includes(u));
}

/** A sidebar link resolved to a Desk route (frappe.utils.generate_route for the link's link_type). */
export type SidebarRoute = { kind: "doctype"; name: string } | { kind: "report"; name: string } | { kind: "page"; name: string } | { kind: "dashboard"; name: string } | { kind: "workspace"; name: string };

/**
 * get_route_for_icon for a "Workspace Sidebar" icon: the sidebar's first Link item (inside `section` when an icon opened a
 * section). Items whose target the preview cannot open (unknown DocType/Report/Page, URL) are skipped, so the result is
 * the first link a user could actually follow, or null.
 */
export function firstSidebarRoute(items: SidebarItem[], has: { doctype: (n: string) => boolean; report: (n: string) => boolean; page: (n: string) => boolean }, section?: string): SidebarRoute | null {
  let inSection = !section;
  for (const i of items) {
    if (i.type === "Section Break") { if (section) inSection = i.label === section; continue; }
    if (!inSection || i.type !== "Link" || !i.link_to) continue;
    if (i.link_type === "Workspace") return { kind: "workspace", name: i.link_to };
    if (i.link_type === "DocType" && has.doctype(i.link_to)) return { kind: "doctype", name: i.link_to };
    if (i.link_type === "Report" && has.report(i.link_to)) return { kind: "report", name: i.link_to };
    if (i.link_type === "Page" && has.page(i.link_to)) return { kind: "page", name: i.link_to };
    if (i.link_type === "Dashboard") return { kind: "dashboard", name: i.link_to };
  }
  return null;
}

export type IconTarget = { kind: "sidebar"; sidebar: string; section?: string; ws?: string } | { kind: "doctype"; name: string } | { kind: "none" };

/** frappe.utils.get_route_for_icon + sidebar_for_module(module || label); when no shell is named after the icon,
 * the icon opens the section of a module sidebar carrying its label, else the DocType of that name. */
export function iconTarget(i: DesktopIcon, wsSidebars: Sidebar[], modSidebars: ModuleSidebar[], hasDoctype: (n: string) => boolean, workspaces: WorkspaceFull[]): IconTarget {
  const key = i.link_to || i.label;
  for (const n of [key, i.label]) {
    if (wsSidebars.some((s) => s.name === n) || modSidebars.some((s) => s.name === n || s.module === n)) return { kind: "sidebar", sidebar: modSidebars.find((s) => s.module === n && s.name !== n)?.name ?? n };
  }
  const norm = (s: string) => s.toLowerCase().replace(/ing$|s$/, "");
  const words = i.label.split(" ");
  for (const sb of modSidebars) {
    const sec = sb.items.find((it) => it.type === "Section Break" && it.label && (norm(it.label) === norm(i.label) || (words.length > 1 && norm(it.label) === norm(words[words.length - 1] ?? "") && norm(sb.title).startsWith(norm(words[0] ?? "")))));
    if (sec) return { kind: "sidebar", sidebar: sb.name, section: sec.label };
  }
  if (hasDoctype(i.label)) return { kind: "doctype", name: i.label };
  const ws = workspaces.find((w) => w.links.some((l) => l.type === "Card Break" && l.label === i.label));
  const wsb = ws && modSidebars.find((s) => s.module === ws.module);
  if (ws && wsb) return { kind: "sidebar", sidebar: wsb.name, ws: ws.name };
  return { kind: "none" };
}
