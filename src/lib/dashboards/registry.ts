/**
 * Universal Dashboard Designer — widget and dashboard contracts + the shared registry (DIGIT-CORE-PRO-UX-006 §9).
 *
 * The Core owns composition (layout, sizes, view switching, templates, persistence, permission checks). Applications
 * own their domain: each app registers its dashboards and widgets — source, approved meaning, data shape, default
 * view/size, approved options, permission check and data provider — and may supply its ORIGINAL renderer for the
 * default view so an un-customized dashboard looks exactly as before. Values are computed at render from the app's
 * permission-scoped sources; the registry never stores figures.
 */
import type { ReactNode } from "react";
import type { Bi, DataShape, ShapeFacts, ViewKind } from "./views";

export type Width = 3 | 4 | 6 | 8 | 12;
export const WIDTHS: readonly Width[] = [3, 4, 6, 8, 12];
export type Height = 1 | 2 | 3;
export const HEIGHTS: readonly Height[] = [1, 2, 3];

/** An approved filter / dimension / grouping choice the user may change without changing the metric definition. */
export interface WidgetOption { key: string; label: Bi; choices: { value: string; label: Bi }[]; default: string;
  /** passed to the widget's own renderer without switching it to the generic view (block-menu period / compare) */ native?: boolean | undefined;
  /** free values matching this pattern are accepted besides the choices (custom dates) */ pattern?: RegExp | undefined;
  /** set through the block menu only, not offered as a select while editing */ hidden?: boolean | undefined }

/**
 * Block menu (owner 2026-11-13 §2.3): a widget that can re-read its own window declares BLOCK_OPTIONS; the period and the
 * comparison are saved per user on the layout item and passed to the widget's own renderer. "" = the page default.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const BLOCK_PERIOD: WidgetOption = { key: "per", native: true, label: ["Period", "الفترة"], default: "", choices: [
  { value: "", label: ["Page default", "افتراضي الصفحة"] }, { value: "1m", label: ["Last month", "آخر شهر"] }, { value: "2m", label: ["Last 2 months", "آخر شهرين"] },
  { value: "q", label: ["Last quarter", "آخر ربع سنة"] }, { value: "y", label: ["Last 12 months", "آخر 12 شهرًا"] }, { value: "ytd", label: ["Year to date", "منذ بداية السنة"] }, { value: "custom", label: ["Custom range", "فترة مخصصة"] },
  // Round 1 §5 card period dropdown: this month / this quarter / the fiscal year (blockWindow reads them; added, old values stay valid)
  { value: "mtd", label: ["This month", "هذا الشهر"] }, { value: "qtd", label: ["This quarter", "هذا الربع"] }, { value: "fy", label: ["This fiscal year", "هذه السنة المالية"] }] };
/** The card frame's own period dropdown (Round 1 §5): this month · this quarter · the fiscal year · last 12 months · custom. */
export const FRAME_PERIODS: { value: string; label: Bi }[] = [
  { value: "", label: ["Page period", "فترة الصفحة"] }, { value: "mtd", label: ["This month", "هذا الشهر"] }, { value: "qtd", label: ["This quarter", "هذا الربع"] },
  { value: "fy", label: ["This fiscal year", "هذه السنة المالية"] }, { value: "y", label: ["Last 12 months", "آخر 12 شهرًا"] }, { value: "custom", label: ["Custom…", "مخصص…"] }];
export const BLOCK_FROM: WidgetOption = { key: "pfrom", native: true, hidden: true, label: ["From", "من"], default: "", choices: [], pattern: ISO };
export const BLOCK_TO: WidgetOption = { key: "pto", native: true, hidden: true, label: ["To", "إلى"], default: "", choices: [], pattern: ISO };
export const BLOCK_COMPARE: WidgetOption = { key: "pcmp", native: true, label: ["Compare with", "مقارنة مع"], default: "", choices: [
  { value: "", label: ["Page default", "افتراضي الصفحة"] }, { value: "prev", label: ["Previous period", "الفترة السابقة"] }, { value: "year", label: ["Same period last year", "الفترة نفسها من العام الماضي"] }, { value: "none", label: ["No comparison", "بدون مقارنة"] }] };
export const BLOCK_OPTIONS: WidgetOption[] = [BLOCK_PERIOD, BLOCK_FROM, BLOCK_TO, BLOCK_COMPARE];
/**
 * Full period set (opt-in per widget; widgets declaring BLOCK_OPTIONS keep their menu): as of a date, last 7 / 30 / 90
 * days, month / quarter / year to date, the fiscal year, custom range; compare also with a chosen baseline date (pbase).
 */
export const BLOCK_PERIOD_FULL: WidgetOption = { ...BLOCK_PERIOD, choices: [
  { value: "", label: ["Page default", "افتراضي الصفحة"] }, { value: "asof", label: ["As of a date", "حتى تاريخ"] }, { value: "7d", label: ["Last 7 days", "آخر 7 أيام"] }, { value: "30d", label: ["Last 30 days", "آخر 30 يومًا"] },
  { value: "90d", label: ["Last 90 days", "آخر 90 يومًا"] }, { value: "mtd", label: ["Month to date", "منذ بداية الشهر"] }, { value: "qtd", label: ["Quarter to date", "منذ بداية الربع"] },
  { value: "ytd", label: ["Year to date", "منذ بداية السنة"] }, { value: "fy", label: ["Fiscal year", "السنة المالية"] }, { value: "y", label: ["Last 12 months", "آخر 12 شهرًا"] }, { value: "custom", label: ["Custom range", "فترة مخصصة"] }] };
export const BLOCK_BASE: WidgetOption = { key: "pbase", native: true, hidden: true, label: ["Baseline date", "تاريخ خط الأساس"], default: "", choices: [], pattern: ISO };
export const BLOCK_COMPARE_FULL: WidgetOption = { ...BLOCK_COMPARE, choices: [...BLOCK_COMPARE.choices.slice(0, 3), { value: "baseline", label: ["Baseline date", "تاريخ خط الأساس"] }, BLOCK_COMPARE.choices[3]!] };
export const BLOCK_OPTIONS_FULL: WidgetOption[] = [BLOCK_PERIOD_FULL, BLOCK_FROM, BLOCK_TO, BLOCK_COMPARE_FULL, BLOCK_BASE];
/** The date a block's comparison reads: end of the previous window, the same date last year, or the baseline date. */
export function blockCompareDate(opts: Record<string, string | undefined>, asOf: string): string | undefined {
  const c = opts["pcmp"]; const win = blockWindow(opts, asOf);
  if (c === "none") return undefined;
  if (c === "baseline") return opts["pbase"] && ISO.test(opts["pbase"]) ? opts["pbase"] : undefined;
  const end = win ? (win.to > asOf ? asOf : win.to) : asOf;
  if (c === "year") return `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`;
  return addDays(win ? win.from : end, win ? -1 : -30);
}
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** The window a block's own period selects, ending at `asOf` (custom: its own from/to); undefined = the page default. */
export function blockWindow(opts: Record<string, string | undefined>, asOf: string): { from: string; to: string; days: number } | undefined {
  const p = opts["per"]; if (!p) return undefined;
  if (p === "custom") { const f = opts["pfrom"], t = opts["pto"] || asOf; if (!f || !ISO.test(f) || !ISO.test(t) || f > t) return undefined; return { from: f, to: t, days: Math.round((Date.parse(t) - Date.parse(f)) / 86400000) + 1 }; }
  if (p === "asof") { const t = opts["pto"] && ISO.test(opts["pto"]) ? opts["pto"] : asOf; return { from: t, to: t, days: 1 }; }
  const span = (f: string, t: string) => ({ from: f, to: t, days: Math.round((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86400000) + 1 });
  if (p === "mtd") return span(`${asOf.slice(0, 7)}-01`, asOf);
  if (p === "qtd") { const m = Number(asOf.slice(5, 7)); return span(`${asOf.slice(0, 4)}-${String(m - ((m - 1) % 3)).padStart(2, "0")}-01`, asOf); }
  // fiscal year: the calendar year (the Saudi default fiscal year), whole year
  if (p === "fy") return span(`${asOf.slice(0, 4)}-01-01`, `${asOf.slice(0, 4)}-12-31`);
  const days = p === "1m" ? 30 : p === "2m" ? 61 : p === "q" ? 91 : p === "y" ? 365 : p === "7d" ? 7 : p === "30d" ? 30 : p === "90d" ? 90 : p === "ytd" ? Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${asOf.slice(0, 4)}-01-01T00:00:00Z`)) / 86400000) + 1 : 0;
  if (!days) return undefined;
  return { from: p === "ytd" ? `${asOf.slice(0, 4)}-01-01` : addDays(asOf, -(days - 1)), to: asOf, days };
}
/** Short label of a block's own period / comparison (shown on the block), or "" when it follows the page. */
export function blockLabel(opts: Record<string, string | undefined>, ar: boolean): string {
  const pick = (o: WidgetOption, v: string | undefined) => { const c = o.choices.find((x) => x.value === v) ?? [...BLOCK_PERIOD.choices, ...BLOCK_COMPARE.choices].find((x) => x.value === v); return c ? c.label[ar ? 1 : 0] : ""; };
  const per = opts["per"] === "custom" ? `${opts["pfrom"] ?? ""} → ${opts["pto"] ?? ""}` : opts["per"] === "asof" ? `${pick(BLOCK_PERIOD_FULL, "asof")} ${opts["pto"] ?? ""}`.trim() : opts["per"] ? pick(BLOCK_PERIOD_FULL, opts["per"]) : "";
  const cmp = opts["pcmp"] === "baseline" ? `${pick(BLOCK_COMPARE_FULL, "baseline")} ${opts["pbase"] ?? ""}`.trim() : opts["pcmp"] ? pick(BLOCK_COMPARE_FULL, opts["pcmp"]) : "";
  return [per, cmp].filter(Boolean).join(" · ");
}

/**
 * Per-widget period (approved option convention): widgets that filter by a date declare PERIOD_OPTION and read it with
 * inPeriod, so every app offers the same choices and the same day arithmetic.
 */
export const PERIOD_OPTION: WidgetOption = { key: "period", label: ["Period", "الفترة"], default: "all", choices: [
  { value: "30", label: ["Last 30 days", "آخر 30 يومًا"] }, { value: "90", label: ["Last 90 days", "آخر 90 يومًا"] }, { value: "365", label: ["Last 12 months", "آخر 12 شهرًا"] }, { value: "all", label: ["All dates", "كل التواريخ"] }] };
/** Whether a date (YYYY-MM-DD…) falls in the chosen period ending `today`; undated records count only for "all". */
export function inPeriod(date: unknown, opts: Record<string, string>, today = new Date().toISOString().slice(0, 10)): boolean {
  const p = opts["period"]; if (!p || p === "all") return true;
  const d = String(date ?? "").slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const days = Number(p); if (!Number.isFinite(days)) return true;
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  return d >= from && d <= today;
}

/** `unconfigured`: the figure needs a setting nobody has entered yet (e.g. a Finance tolerance); shown with the setting it waits for. */
export type WidgetStatus = "ok" | "empty" | "denied" | "unavailable" | "pending" | "unconfigured";
/** A shown figure that covers only part of its scope (`partial`) or rests on a source older than its freshness rule (`stale`). */
export type WidgetQuality = "partial" | "stale";
/** Change against the comparison point (signed percent) and which direction is good for the figure. */
export interface WidgetDelta { pct: number; better?: "up" | "down" | "none" | undefined; label?: string | undefined }
/** `target` (bullet: target; S-curve: planned running total) and `cross` (the dashboard filter this point sets) are optional. */
export interface SeriesPoint { key: string; label: string; value: number; /** drafts / awaiting approval drawn hatched after the solid value (Round 1 §8) */ pending?: number | undefined; pendingDisplay?: string | undefined; display?: string | undefined; /** signed % change against the previous period (drawn beside the bar) */ delta?: number | undefined; count?: number | undefined; drill?: unknown; tone?: "ok" | "warn" | "bad" | "info" | undefined; data?: boolean | undefined; target?: number | undefined; cross?: { key: string; value: string } | undefined }
export interface RowCol { key: string; label: Bi; numeric?: boolean | undefined; data?: boolean | undefined; /** cell drawn as a status pill in the row's `pills` tone */ pill?: boolean | undefined; /** numeric cell drawn with an inline data bar (share of the column maximum) */ bar?: boolean | undefined }
/** `end` (gantt), `lane` (kanban) and `progress` (0–100, gantt) are optional. */
export interface WidgetRow { id: string; cells: Record<string, string | number | null>; date?: string | undefined; drill?: unknown; tone?: "ok" | "warn" | "bad" | "info" | undefined; /** tone per pill column key */ pills?: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> | undefined; /** the row gets an «افتح» action that opens its drill */ open?: boolean | undefined; end?: string | undefined; lane?: string | undefined; progress?: number | undefined }
/** One record of an xy (bubble) widget: x and y measures, size measure (non-negative). */
export interface XyPoint { key: string; label: string; x: number; y: number; size: number; drill?: unknown; tone?: "ok" | "warn" | "bad" | "info" | undefined; data?: boolean | undefined; cross?: { key: string; value: string } | undefined }
interface DataBase { status: WidgetStatus; reason?: Bi | undefined; drill?: unknown; note?: Bi | undefined;
  /** shown figure that is partial / stale, with why (`qualityNote`) */ quality?: WidgetQuality | undefined; qualityNote?: Bi | undefined;
  /** as-of date, scope words and unit words printed under the figure (every card states its as-of, scope and unit) */ asOf?: string | undefined; scopeLabel?: Bi | undefined; unitLabel?: Bi | undefined;
  /** one computed sentence under a chart (visual round R3: every chart states its insight and date range); default derived from the data */ insight?: string | undefined; range?: string | undefined }
export type WidgetData =
  | (DataBase & { kind: "number"; value: number; display?: string | undefined; /** state the card carries (Round 1 §4: amber due soon, rose overdue / negative, blue in process) */ tone?: "ok" | "warn" | "bad" | "info" | undefined; /** per-user key: the card shows a dot when the value moved >5% since the last visit */ seenKey?: string | undefined; sub?: string[] | undefined; /** change vs the comparison point */ delta?: WidgetDelta | undefined; /** trend points, oldest first (sparkline) */ spark?: number[] | undefined; /** progress against a budget / target drawn under the value (no number-only card): share 0–100+, its level and words */ meter?: { pct: number; level?: "ok" | "warn" | "over" | undefined; label: string } | undefined })
  | (DataBase & { kind: "series"; points: SeriesPoint[]; /** split card headline (Round 1 §8): big value, % chip, change sentence, records to review */ split?: { display: string; pct?: { value: number; label: Bi } | undefined; delta?: { pct: number; vs: string; better?: "up" | "down" | undefined } | undefined; review?: { count: number; drill: unknown } | undefined } | undefined; unit?: string | undefined; valueLabel?: Bi | undefined; targetLabel?: Bi | undefined; /** ordered process steps drawn as a chain of boxes (status view) */ steps?: boolean | undefined; /** gauge zones (upper bound, tone, label) drawn behind a bullet value, e.g. Nitaqat bands */ zones?: { to: number; tone: string; label: Bi }[] | undefined; /** per-period view behind a toggle (rows = periods, columns = series) */ trend?: { rowKeys: string[]; colKeys: string[]; values: number[][]; label?: Bi | undefined } | undefined })
  | (DataBase & { kind: "matrix"; rowKeys: string[]; colKeys: string[]; values: number[][]; /** the record each row stands for (index-aligned with rowKeys); the row label opens it */ rowDrill?: (unknown | undefined)[] | undefined; /** line legend: last value (cumulative series, default) or the total over the periods (flows) */ legend?: "last" | "sum" | undefined })
  | (DataBase & { kind: "rows"; columns: RowCol[]; rows: WidgetRow[]; total?: number | undefined; lanes?: string[] | undefined; /** one status line over the table, e.g. «2 مانع · 1 تنبيه — لا يمكن التشغيل» */ headline?: { text: Bi; tone: "ok" | "warn" | "bad" | "info" } | undefined })
  | (DataBase & { kind: "xy"; points: XyPoint[]; axes: { x: Bi; y: Bi; size: Bi }; /** optional horizontal reference line (e.g. a target margin from settings) */ refY?: { value: number; label: Bi } | undefined; /** x axis is a percentage 0–100 */ xPct?: boolean | undefined })
  | (DataBase & { kind: "panel" });

/**
 * A dashboard-level filter (cross-filter). The designer shows it above the widgets and passes its value to every
 * widget's data provider in `opts[key]`; a chart point carrying `cross: { key, value }` sets it. Choices are computed
 * from the app's permission-scoped records. Values live in the host's URL state when the host passes them in.
 */
export interface DashboardFilter<C = unknown> { key: string; label: Bi; choices: (ctx: C) => { value: string; label: string; data?: boolean | undefined }[] }

export interface WidgetDef<C = unknown> {
  id: string;
  /** Bumped by the owner when the widget's meaning or options change; saved per-widget customizations are then reset. */
  version: number;
  title: Bi;
  /** Approved metric meaning + calculation basis (shown in the catalog and the widget's info). */
  meaning: Bi;
  /** Source DocTypes / reports (traceability; also the permission basis). */
  sources: string[];
  shape: DataShape;
  defaultView: ViewKind;
  /** Owner-approved subset of the shape's compatible views (default: all compatible). */
  views?: ViewKind[] | undefined;
  facts?: ShapeFacts | undefined;
  size: { w: Width; h?: Height | undefined };
  minW?: Width | undefined;
  /** Mandatory widget (owner policy): cannot be removed by any layout. */
  required?: boolean | undefined;
  /** false = offered in the catalog only (not part of the default layout). */
  inDefault?: boolean | undefined;
  group?: Bi | undefined;
  options?: WidgetOption[] | undefined;
  /** The host has nothing for this block on this page (not a permission state): the block is left out and not offered. */
  absent?: ((ctx: C) => boolean) | undefined;
  /** Whether the current user may see this widget at all (permission-scoped). Unreadable widgets are not offered. */
  readable?: ((ctx: C) => boolean) | undefined;
  data?: ((ctx: C, opts: Record<string, string>) => WidgetData) | undefined;
  /** The application's original renderer — used for the default view with default options. */
  renderDefault?: ((ctx: C, opts: Record<string, string>) => ReactNode) | undefined;
  /** Panel widgets: the application renders the whole body. */
  render?: ((ctx: C, opts: Record<string, string>) => ReactNode) | undefined;
}

export interface DashboardDef<C = unknown> {
  /** Owning application id (digit_pro, digit_hr, …). */
  app: string;
  /** Dashboard id, unique within the app. */
  id: string;
  title: Bi;
  widgets: WidgetDef<C>[];
  /** Roles (besides System Manager / Administrator) allowed to publish role templates for roles they hold. */
  managerRoles?: string[] | undefined;
  /** Roles (besides System Manager / Administrator) allowed to publish the global default. */
  globalRoles?: string[] | undefined;
  /** Roles (besides System Manager / Administrator) allowed to publish a company preset for the company in context. */
  companyRoles?: string[] | undefined;
  /** Dashboard-level (cross) filters. */
  filters?: DashboardFilter<C>[] | undefined;
}

const REG = new Map<string, DashboardDef<never>>();
const key = (app: string, id: string) => `${app}:${id}`;

/** Register (or replace) a dashboard contract. Widget ids must be unique; an invalid contract throws at registration. */
export function registerDashboard<C>(def: DashboardDef<C>): DashboardDef<C> {
  const ids = new Set<string>();
  for (const w of def.widgets) {
    if (ids.has(w.id)) throw new Error(`Dashboard ${key(def.app, def.id)}: duplicate widget id ${w.id}`);
    ids.add(w.id);
  }
  REG.set(key(def.app, def.id), def as unknown as DashboardDef<never>);
  return def;
}
export function getDashboard<C = unknown>(app: string, id: string): DashboardDef<C> | undefined {
  return REG.get(key(app, id)) as unknown as DashboardDef<C> | undefined;
}
export function registeredDashboards(app?: string): DashboardDef<unknown>[] {
  return [...REG.values()].filter((d) => !app || d.app === app) as unknown as DashboardDef<unknown>[];
}
