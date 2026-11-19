/**
 * DIGIT Pro workspace dashboards on the shared Universal Dashboard Designer (DIGIT-CORE-PRO-UX-006 §9).
 *
 * Each of the 20 section workspaces registers ONE dashboard contract (app digit_pro, id ws:<SECTION-ID>) whose widgets
 * are the existing Overview panels — section KPIs, charts, work queues and the section extras — with their sources and
 * meaning taken from sections.ts SPECS. Values are the SAME evaluations the original panels use (evalKpi / evalChart /
 * evalQueue over permission-scoped records); the original components are the default renderers and the original
 * Overview is the fallback, so an un-customized workspace renders exactly as before. Pro owns these definitions; the
 * Core owns composition, persistence and permission (src/lib/dashboards).
 */
import type { ReactNode } from "react";
import { fmtCurrency } from "@/lib/format";
import { BLOCK_OPTIONS, blockWindow, registerDashboard, type DashboardDef, type WidgetData, type WidgetDef, type WidgetOption } from "@/lib/dashboards/registry";
import type { Bi } from "@/lib/dashboards/views";
import type { SectionPage } from "./nav";
import { evalChart, evalKpi, evalQueue, figureText, isLinkField, sectionCtx, withinWindow, type ChartResult, type KpiResult, type QueueResult, type SectionCtx, type SectionSpec } from "./sections";
import { sourceStatus } from "./finance";
import type { SectionSearch } from "./SectionLink";
import { savedQuerySignature, savedQueryWidgets } from "./savedQueryKpi";
import { ACC_BOARD, BOARDS } from "./dash92";
import { Dash92Board } from "./Dash92Board";
import { WS_CONTRACT, pageChartTypes, type ContractChart } from "./wsContract";

export interface ProPane { page: SectionPage; spec: SectionSpec; ctx: SectionCtx; user: string; ar: boolean; search: SectionSearch; set: (p: Partial<SectionSearch>) => void;
  /** a block's own period (block menu): figures count documents dated inside it */ win?: { from: string; to: string; days: number } | undefined;
  /** a block's own comparison: prev = the window before, year = the same window last year, none = no comparison */ blockCmp?: "prev" | "year" | "none" | undefined }
/** The pane a block sees: its own period re-anchors the section windows at the period end and limits figures to documents dated inside it. */
export function blockPane(p: ProPane, o: Record<string, string | undefined>): ProPane {
  const win = blockWindow(o, p.ctx.asOf); const pc = o["pcmp"];
  const blockCmp = pc === "prev" || pc === "year" || pc === "none" ? pc : undefined;
  if (!win && !blockCmp) return p;
  const ctx = win ? { ...sectionCtx(p.ctx.company, p.ctx.currency, win.to), from30: win.from, from90: win.from, from12: win.from, monthFrom: win.from } : p.ctx;
  return { ...p, ctx, ...(win ? { win } : {}), ...(blockCmp ? { blockCmp } : {}) };
}
const kpiIn = (p: ProPane, id: string) => { const d = p.spec.kpis(p.ctx).find((k) => k.id === id); return d && p.win ? withinWindow(d, p.win.from, p.win.to) : d; };
const chartIn = (p: ProPane, id: string) => { const d = p.spec.charts(p.ctx).find((k) => k.id === id); return d && p.win ? withinWindow(d, p.win.from, p.win.to) : d; };
const monthsOf = (p: ProPane, base: number) => Math.max(p.blockCmp === "year" ? 13 : 1, p.win ? Math.min(24, Math.max(1, Math.ceil(p.win.days / 30.4))) : base);
export interface ProDashCtx { pane: ProPane; golden: boolean }
/** Original Overview renderers, injected by SectionWorkspace (no import cycle). */
export interface ProDashParts {
  kpi: (k: KpiResult, p: ProPane, placement?: string) => ReactNode;
  chart: (c: ChartResult, p: ProPane, placement?: string, force?: ContractChart, extra?: { stats?: boolean }) => ReactNode;
  queueAuto: (p: ProPane, golden: boolean) => ReactNode;
  queue: (q: QueueResult, p: ProPane, placement?: string) => ReactNode;
  extra: (p: ProPane, part: "lead" | "rest", golden: boolean) => ReactNode;
  pending: (p: ProPane) => ReactNode;
  hasExtra: (spec: SectionSpec, part: "lead" | "rest") => boolean;
  hasPending: (pageId: string) => boolean;
  placement: (pageId: string, key: string) => string | undefined;
}

const KPIS: Bi = ["Key figures", "المؤشرات الرئيسية"];
const CHARTS: Bi = ["Charts", "الرسوم البيانية"];
const WORK: Bi = ["Work queues", "قوائم العمل"];
const PANELS: Bi = ["Section panels", "لوحات القسم"];
const monthLabel = (m: string, ar: boolean) => { const d = new Date(`${m}-01T00:00:00Z`); return Number.isFinite(d.getTime()) ? d.toLocaleDateString(ar ? "ar-u-ca-gregory-nu-latn" : "en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) : m; };
const statusOf = (s: string): WidgetData["status"] => (s === "denied" ? "denied" : s === "unavailable" ? "unavailable" : s === "empty" ? "empty" : "ok");
const filterLine = (fs: [string, string, unknown][]) => fs.map(([f, op, v]) => `${f} ${op} ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ");

function kpiData(r: KpiResult): WidgetData {
  const st = statusOf(r.status);
  if (st === "denied" || st === "unavailable") return { kind: "number", status: st, value: 0 };
  // a true zero (readable source, no matching record) is shown as 0 — not as "denied"
  if (r.figure) return { kind: "number", status: "ok", value: r.figure.value, display: figureText(r.figure, false), sub: [`${r.count}${r.base !== undefined ? ` / ${r.base}` : ""}`], drill: r.drill };
  return { kind: "number", status: "ok", value: r.count, display: String(r.count), sub: r.totals.map((t) => fmtCurrency(t.amount, t.currency)), drill: r.drill };
}
function chartData(r: ChartResult, ar: boolean, ctx: SectionCtx): WidgetData {
  const st = statusOf(r.status);
  if (st !== "ok") return { kind: "series", status: st, points: [] };
  const valued = r.bars.some((b) => b.value !== null);
  const link = r.kind === "field" && isLinkField(r.doctype, r.field);
  return {
    kind: "series", status: r.bars.length ? "ok" : "empty", drill: undefined,
    valueLabel: valued ? [`Amount (${r.currencies[0] ?? ctx.currency})`, `المبلغ (${r.currencies[0] ?? ctx.currency})`] : ["Documents", "المستندات"],
    points: r.bars.map((b) => ({ key: b.key, label: r.kind === "month" ? monthLabel(b.key, ar) : b.label || "—", value: valued ? b.value ?? 0 : b.count, count: b.count, drill: b.drill, data: link || r.kind === "month", ...(r.tones?.[b.key] ? { tone: r.tones[b.key] } : {}) })),
  };
}
function queueData(q: QueueResult, ar: boolean): WidgetData {
  const st = statusOf(q.status);
  if (st !== "ok") return { kind: "rows", status: st, columns: [], rows: [] };
  return {
    kind: "rows", status: q.rows.length ? "ok" : "empty", total: q.count, drill: q.drill,
    reason: ["Nothing waiting — no document matches this check for the current company and date.", "لا يوجد ما ينتظر — لا يوجد مستند يطابق هذا الفحص للشركة والتاريخ الحاليين."],
    columns: [{ key: "name", label: ["Document", "المستند"], data: true }, { key: "party", label: ["Party / reference", "الطرف / المرجع"], data: true }, { key: "date", label: ["Date", "التاريخ"], data: true }, { key: "amount", label: ["Amount", "المبلغ"], numeric: true, data: true }],
    rows: q.rows.map((r) => ({ id: r.name, date: r.date || undefined, drill: { kind: "doc", doctype: r.doctype, name: r.name }, tone: r.days !== null && r.days > 0 ? "bad" as const : undefined,
      cells: { name: r.name, party: r.party || null, date: r.date || null, amount: r.amount === null ? null : q.amount === "projected_qty" ? r.amount.toLocaleString(ar ? "ar-u-nu-latn" : "en-US") : fmtCurrency(r.amount, r.currency) } })),
  };
}

const CACHE = new Map<string, DashboardDef<ProDashCtx>>();
/** The registered dashboard contract of a section workspace (built once per workspace and contract). */
export function overviewDashboard(page: SectionPage, spec: SectionSpec, golden: boolean, parts: ProDashParts): DashboardDef<ProDashCtx> {
  const id = `ws:${page.id}`;
  const cacheKey = `${id}\u0000${savedQuerySignature()}`; // E5-b: saved-query KPI cards follow the saved queries
  const hit = CACHE.get(cacheKey); if (hit) return hit;
  const sample = sectionCtx("", "", "2000-01-01");
  const widgets: WidgetDef<ProDashCtx>[] = [];
  const kpiOf = (c: ProDashCtx, kid: string) => c.pane.spec.kpis(c.pane.ctx).find((k) => k.id === kid);
  void kpiOf;
  // OWN-67 + owner 2026-11-13 §2.2: every chart of the page gets its own visual (contract charts keep the contract type)
  const forced = pageChartTypes(page.id, spec.charts(sample).map((c) => ({ id: c.id, month: c.kind === "month", bucket: !!(c.bucket || c.fn || c.order) })));
  const leadChart = WS_CONTRACT[page.id]?.charts[0]?.[0];
  const queueOf = (c: ProDashCtx, qid: string) => c.pane.spec.queues(c.pane.ctx).find((k) => k.id === qid);

  const board = ACC_BOARD[page.id];
  // V9.2 accounting board (digit_pro.dash92 acc-*): the source block composition of this workspace, owner P0 2026-11-11.
  if (board) widgets.push({ id: `dash92:${board}`, version: 1, title: BOARDS[board]!.title, meaning: ["The source V9.2 board of this workspace: each block keeps its width, data source and drill to the records behind it.", "لوحة V9.2 الأصلية لهذه المساحة: كل كتلة بعرضها ومصدر بياناتها والانتقال إلى السجلات التي كوّنتها."], sources: spec.docs.map((d) => d.doctype), shape: "panel", defaultView: "panel", size: { w: 12 }, group: PANELS, render: (c) => { const drawn = new Set([...c.pane.spec.charts(c.pane.ctx).map((x) => norm(x.label[0])), ...c.pane.spec.queues(c.pane.ctx).map((x) => norm(x.label[0]))]);
    return <Dash92Board boardKey={board} company={c.pane.ctx.company} user={c.pane.user} ar={c.pane.ar} tiles={!c.golden} skip={(b) => drawn.has(norm(b.title[0]))} />; } });
  if (parts.hasExtra(spec, "lead")) widgets.push({ id: "extra:lead", version: 1, title: ["Section summary", "ملخص القسم"], meaning: ["The section's lead panel (balances, ageing or lifecycle) computed from the same native records as its drill-downs.", "اللوحة الرئيسية للقسم (الأرصدة أو الأعمار أو دورة الحياة) محسوبة من نفس السجلات الأصلية."], sources: spec.docs.map((d) => d.doctype), shape: "panel", defaultView: "panel", size: { w: 12 }, group: PANELS, render: (c) => parts.extra(c.pane, "lead", c.golden) });

  for (const k of spec.kpis(sample)) widgets.push({
    id: `kpi:${k.id}`, version: 1, title: k.label, meaning: [`${k.hint[0]} — ${k.doctype}`, `${k.hint[1]} — ${k.doctype}`], sources: [k.doctype], shape: "number", defaultView: "kpi", size: { w: 3 }, group: KPIS, options: BLOCK_OPTIONS,
    renderDefault: (c, o) => { const pane = blockPane(c.pane, o); const def = kpiIn(pane, k.id); return def ? parts.kpi(evalKpi(def, pane.ctx, pane.user), pane, c.golden ? parts.placement(c.pane.page.id, `kpi:${k.id}`) : undefined) : null; },
    data: (c, o) => { const pane = blockPane(c.pane, o); const def = kpiIn(pane, k.id); return def ? kpiData(evalKpi(def, pane.ctx, pane.user)) : { kind: "number", status: "unavailable", value: 0 }; },
  });

  for (const ch of spec.charts(sample)) {
    const month = ch.kind === "month";
    widgets.push({
      id: `chart:${ch.id}`, version: 1, title: ch.label, meaning: [`${ch.doctype}: ${month ? `monthly by ${ch.field}` : `grouped by ${ch.field}`}${ch.measure ? `, sum of ${ch.measure} (single currency) else document count` : ", document count"}.`, `${ch.doctype}: ${month ? `شهريًا حسب ${ch.field}` : `مجمّع حسب ${ch.field}`}${ch.measure ? `، مجموع ${ch.measure} (عملة واحدة) وإلا عدد المستندات` : "، عدد المستندات"}.`],
      sources: [ch.doctype], shape: month ? "time-series" : "category", defaultView: "bar", size: { w: 6 }, group: CHARTS,
      options: [...(month
        ? [{ key: "months", label: ["Period", "الفترة"], default: "6", choices: [{ value: "6", label: ["Last 6 months", "آخر 6 أشهر"] }, { value: "12", label: ["Last 12 months", "آخر 12 شهرًا"] }] }]
        : [{ key: "top", label: ["Categories shown", "الفئات المعروضة"], default: "8", choices: [{ value: "5", label: ["Top 5", "أعلى 5"] }, { value: "8", label: ["Top 8", "أعلى 8"] }, { value: "12", label: ["Top 12", "أعلى 12"] }] }]) as WidgetOption[], ...BLOCK_OPTIONS],
      renderDefault: (c, o) => { const pane = blockPane(c.pane, o); const def = chartIn(pane, ch.id); const opt = month && (pane.win || pane.blockCmp === "year") ? { months: monthsOf(pane, 6) } : {};
        return def ? parts.chart(evalChart(def, pane.ctx, pane.user, opt), pane, c.golden ? parts.placement(c.pane.page.id, `chart:${ch.id}`) : undefined, c.golden ? forced[ch.id] : undefined, { stats: c.golden && ch.id === leadChart }) : null; },
      data: (c, o) => { const pane = blockPane(c.pane, o); const def = chartIn(pane, ch.id); return def ? chartData(evalChart(def, pane.ctx, pane.user, month ? { months: pane.win ? monthsOf(pane, 6) : Number(o["months"]) || 6 } : { top: Number(o["top"]) || 8 }), pane.ar, pane.ctx) : { kind: "series", status: "unavailable", points: [] }; },
    });
  }

  if (parts.hasExtra(spec, "rest")) widgets.push({ id: "extra:rest", version: 1, title: ["Section analysis", "تحليل القسم"], meaning: ["The section's analysis panels, from the same native records as their drill-downs.", "لوحات التحليل في القسم من نفس السجلات الأصلية."], sources: spec.docs.map((d) => d.doctype), shape: "panel", defaultView: "panel", size: { w: 12 }, group: PANELS, render: (c) => parts.extra(c.pane, "rest", c.golden) });
  if (golden && parts.hasPending(page.id)) widgets.push({ id: "run11:pending", version: 1, title: ["Figures awaiting definition or connection", "أرقام بانتظار التعريف أو الربط"], meaning: ["Run11.1 target figures whose formula, owner decision or server connection is pending — never shown with a value.", "أرقام مستهدفة بانتظار المعادلة أو قرار المالك أو الربط بالخادم — لا تُعرض بقيمة."], sources: ["PLACEMENTS_448"], shape: "panel", defaultView: "panel", size: { w: 12 }, required: true, group: PANELS, render: (c) => parts.pending(c.pane) });

  const qs = spec.queues(sample);
  if (qs.length) {
    widgets.push({ id: "queue:auto", version: 1, title: ["Worklist", "قائمة العمل"], meaning: ["Every work queue of this section as a tab (the most urgent opens first), each row opening its document, with a link to all work.", "كل قوائم العمل في القسم كتبويبات (الأكثر إلحاحًا يفتح أولًا)، وكل سطر يفتح مستنده، مع رابط لكل الأعمال."], sources: [...new Set(qs.map((q) => q.doctype))], shape: "panel", defaultView: "panel", size: { w: 12 }, group: WORK, render: (c) => parts.queueAuto(c.pane, c.golden) });
    for (const q of qs) widgets.push({
      id: `queue:${q.id}`, version: 1, title: q.label, meaning: [`${q.doctype} · ${filterLine(q.filters as [string, string, unknown][])} · next step: ${q.action[0]}`, `${q.doctype} · ${filterLine(q.filters as [string, string, unknown][])} · الخطوة التالية: ${q.action[1]}`],
      sources: [q.doctype], shape: "dated-rows", defaultView: "queue", size: { w: 6 }, inDefault: false, group: WORK,
      readable: (c) => sourceStatus(q.doctype, c.pane.user) !== "denied",
      renderDefault: (c) => { const def = queueOf(c, q.id); return def ? parts.queue(evalQueue(def, c.pane.ctx, c.pane.user, 8), c.pane, c.golden ? parts.placement(c.pane.page.id, `queue:${q.id}`) : undefined) : null; },
      data: (c) => { const def = queueOf(c, q.id); return def ? queueData(evalQueue(def, c.pane.ctx, c.pane.user, 12), c.pane.ar) : { kind: "rows", status: "unavailable", columns: [], rows: [] }; },
    });
  }

  widgets.push(...savedQueryWidgets<ProDashCtx>());
  const def = registerDashboard<ProDashCtx>({ app: "digit_pro", id, title: [page.label, page.label], widgets: golden ? contractOrder(page.id, widgets) : widgets, managerRoles: ["Accounts Manager", "Sales Manager", "Purchase Manager", "Stock Manager"] });
  CACHE.set(cacheKey, def);
  return def;
}

/**
 * OWN-67 + owner 2026-11-13 rich pages: the DEFAULT layout of a workspace Overview opens with its contract — the indicator
 * block (contract r11-kpi-* figures first; every further figure visible in the scorecard), then the floorplan slots in order
 * with their widths — and continues with every other block of the section, each in its own visual: the remaining charts,
 * the section panels and the V9.2 board (its blocks that repeat a chart or queue are left out). Single work queues and
 * saved-query cards stay in the block library (the worklist already holds every queue as a tab). Required widgets keep
 * their place at the end.
 */
function contractOrder(pageId: string, ws: WidgetDef<ProDashCtx>[]): WidgetDef<ProDashCtx>[] {
  const k = WS_CONTRACT[pageId]; if (!k) return ws;
  const byId = new Map(ws.map((w) => [w.id, w]));
  const slotId = (at: string) => (at === "c0" ? `chart:${k.charts[0]?.[0]}` : at === "c1" ? `chart:${k.charts[1]?.[0]}` : at === "queue" ? "queue:auto" : `extra:${at}`);
  const kpis = ws.filter((w) => w.id.startsWith("kpi:")).sort((a, b) => Number(!a.id.startsWith("kpi:r11-kpi-")) - Number(!b.id.startsWith("kpi:r11-kpi-")));
  const slots = k.floor.flatMap((x) => { const w = byId.get(slotId(x.at)); return w ? [{ ...w, inDefault: true, size: { w: x.w, ...(x.tall ? { h: 3 as const } : {}) } }] : []; });
  const used = new Set([...kpis, ...slots].map((w) => w.id));
  const rest = ws.filter((w) => !used.has(w.id) && !w.required);
  const library = (w: WidgetDef<ProDashCtx>) => (w.id.startsWith("queue:") && w.id !== "queue:auto") || w.id.startsWith("query:");
  const charts = rest.filter((w) => w.id.startsWith("chart:") && !library(w));
  const rows = [...charts.map((w, i) => ({ ...w, inDefault: true, size: { w: (charts.length % 2 === 1 && i === charts.length - 1 ? 12 : 6) as 6 | 12 } })),
    ...rest.filter((w) => !w.id.startsWith("chart:") && !library(w)).map((w) => ({ ...w, inDefault: true }))];
  const lib = rest.filter(library).map((w) => ({ ...w, inDefault: false }));
  return [...kpis, ...slots, ...rows, ...lib, ...ws.filter((w) => w.required)];
}
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
