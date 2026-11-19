/**
 * Template T2 — department overview (owner 2026-11-12, rich pages 2026-11-13). Pro supplies the department's data (metric
 * contract, insight lines, page-specific cards, extra rows, worklist, reports); the Enterprise kit draws the zones and the
 * shared Dashboard Designer composes them as blocks: context band (with Customize) → indicator block (hero + four cards +
 * every other figure in the scorecard) → charts row → the page's rich rows (each a different visual) → strip → worklist →
 * report links. Users add, remove, reorder and adjust blocks in place; Administration publishes per role / company.
 * No figure is computed here.
 */
import type { ReactNode } from "react";
import { ChartRow, CustomizeScope, KpiRow, LinkGroup, LINK_CHIP, Page, Zone, type KpiItem } from "@/components/enterprise/kit";
import { PageBlocks, pageDashboard, type PageBlockDef, type PageNodes } from "@/components/dashboards/PageBlocks";
import { translateTo } from "@/i18n";
import type { Bi } from "@/lib/dashboards/views";
import type { Width } from "@/lib/dashboards/registry";
import { DrillLink } from "./CommandUi";
import { fmtVal, InsightCard, metricKpi } from "./Dash92Board";
import { compareAsOf } from "./sections";
import { todayIso } from "./finance";
import { deptDashboard, metricCtx, type DeptKey } from "./dash92";
import { useV4Lines } from "./V4InsightBoard";
import { kpiFromV4 } from "./ProKit";
import type { Board } from "./v4Kit";

/** A page row of the department dashboard (its own block: moved, resized, removed and re-added by the user). */
export interface DeptRow { id: string; title: Bi; w?: Width | undefined;
  /** the row's content; a period-aware row (DEPT_ROW_DEFS period) renders from its saved block-menu options */ node: ReactNode | ((opts: Record<string, string | undefined>) => ReactNode); period?: boolean | undefined }
export interface DeptOverviewProps {
  dept: DeptKey; company: string; currency: string; user: string; ar: boolean;
  /** insight-line boards folded into the indicator block (e.g. ["finance", "accounting"]) */
  boards?: Board[];
  /** context strip; receives the department's question */
  context?: (question: ReactNode) => ReactNode;
  /** the page's own indicator cards, after the contract metrics */
  lead?: KpiItem[];
  /** contract insights already drawn by a richer page chart (listed in the moved-blocks table) */
  skipInsights?: string[];
  /** extra chart cards after the contract insights (the charts row holds three) */
  charts?: ReactNode[];
  /** further dashboard rows, each a different visual (owner 2026-11-13 §2.2) */
  rows?: DeptRow[];
  strip?: ReactNode; work?: ReactNode;
  stripTitle?: Bi;
  /** extra link groups after the department's report group */
  links?: ReactNode;
}

const DEPT_TITLE: Record<DeptKey, Bi> = { finance: ["Accounting overview", "نظرة المحاسبة"], selling: ["Selling overview", "نظرة المبيعات"], purchasing: ["Purchasing overview", "نظرة المشتريات"], inventory: ["Inventory overview", "نظرة المخزون"], assets: ["Fixed assets overview", "نظرة الأصول الثابتة"] };
/** The extra rows each department overview offers (ids and titles are the block contract; the page supplies the content). */
export const DEPT_ROW_DEFS: Record<DeptKey, Pick<DeptRow, "id" | "title" | "w" | "period">[]> = {
  finance: [{ id: "cash-in-out", title: ["Cash in vs cash out", "النقد الداخل مقابل الخارج"], w: 8, period: true }, { id: "gauge-collection", title: ["Collected of invoiced", "المحصّل من المفوتر"], w: 4, period: true },
    { id: "heat-receivable", title: ["Customers × ageing", "العملاء × أعمار الديون"], w: 6 }, { id: "heat-payable", title: ["Suppliers × due ageing", "الموردون × أعمار الاستحقاق"], w: 6 }],
  selling: [{ id: "gauge-collection", title: ["Collected of invoiced", "المحصّل من المفوتر"], w: 4, period: true }, { id: "heat-receivable", title: ["Customers × ageing", "العملاء × أعمار الديون"], w: 8 }],
  purchasing: [{ id: "heat-payable", title: ["Suppliers × due ageing", "الموردون × أعمار الاستحقاق"], w: 8 }, { id: "gauge-receipt", title: ["Received of ordered", "المستلم من المطلوب"], w: 4, period: true }],
  inventory: [],
  assets: [{ id: "asset-matrix", title: ["Asset category × location", "فئة الأصل × الموقع"], w: 8 }, { id: "gauge-depreciation", title: ["Depreciated of cost", "المُهلك من التكلفة"], w: 4 }],
};
/** The block contract of a department overview (same ids every visit, so saved layouts stay valid). */
export function deptBlocks(dept: DeptKey, rows: Pick<DeptRow, "id" | "title" | "w" | "period">[], stripTitle?: Bi): PageBlockDef[] {
  return [
    { id: "kpis", title: ["Key figures and scorecard", "المؤشرات الرئيسية وبطاقة المؤشرات"], meaning: ["The department's headline figures, then every other figure with this period, the previous period and the change.", "أرقام القسم الرئيسية ثم كل مؤشر آخر بقيمته الحالية والسابقة ونسبة التغير."] },
    { id: "charts", title: ["Department charts", "رسوم القسم البيانية"] },
    ...rows.map((r) => ({ id: `row:${r.id}`, title: r.title, w: r.w ?? 6, ...(r.period ? { period: true } : {}) })),
    { id: "strip", title: stripTitle ?? ["Process stages", "مراحل العملية"] },
    { id: "work", title: ["Worklist", "قائمة العمل"] },
    { id: "links", title: ["Reports and links", "التقارير والروابط"] },
  ];
}
export const deptDashboardDef = (dept: DeptKey, stripTitle?: Bi) =>
  pageDashboard("digit_pro", `dept:${dept}`, DEPT_TITLE[dept], deptBlocks(dept, DEPT_ROW_DEFS[dept], stripTitle), ["Accounts Manager", "Sales Manager", "Purchase Manager", "Stock Manager"]);

/** The two context facts every overview band carries besides company / as-of / role / last updated (owner 2026-11-13 §3.2):
 *  the comparison basis of its scorecard (previous month, compareAsOf) and the reporting currency. */
export const bandFacts = (ar: boolean, currency: string) => [
  { label: ar ? "المقارنة" : "Compare", value: <span data-dp-band-compare>{ar ? "الشهر السابق" : "Previous month"}</span> },
  { label: ar ? "العملة" : "Currency", value: <bdi data-no-i18n data-dp-band-currency>{currency || "—"}</bdi> },
];
export function DeptOverview({ dept, company, currency, user, ar, boards = [], context, lead = [], skipInsights = [], charts = [], rows = [], strip, stripTitle, work, links }: DeptOverviewProps) {
  const d = deptDashboard(dept, metricCtx(company, user));
  const lines = useV4Lines(boards, company, currency, user, ar);
  const prevLines = useV4Lines(boards, company, currency, user, ar, compareAsOf(todayIso(), "month"));
  // an insight that resolves to one number (no series, groups or ageing) is an indicator, so it joins the row instead of a chart card
  const scalar = (v: (typeof d.insights)[number]["v"]) => v.state === "OK" && !v.series && !v.groups && !v.buckets;
  // (it leads the row: conversion rate / open commitment are the department's headline figures)
  const headline = d.insights.filter(({ v }) => scalar(v)).map(({ def, v }) => { const k = metricKpi(def, v, ar, d.currency); return { ...k, attrs: { ...k.attrs, "data-dp-insight": def.metric_id } }; });
  // scorecard comparison: the same contract evaluated on the same day last month; a figure that does not move with the date
  // (a current state) says so instead of showing an invented change
  const prevD = deptDashboard(dept, metricCtx(company, user, compareAsOf(d.asOf, "month")));
  const withPrev = (k: KpiItem, def: (typeof d.metrics)[number]["def"], v: (typeof d.metrics)[number]["v"]): KpiItem => {
    const pv = prevD.metrics.find((x) => x.def.metric_id === def.metric_id)?.v;
    if (v.state !== "OK" || !pv || pv.state !== "OK" || pv.value === null || v.value === null) return k;
    if (pv.value === v.value) return { ...k, prev: <span className="ek-score-flat" data-ek-prev="current">{ar ? "حالة حالية" : "Current state"}</span> };
    const pct = pv.value ? Math.round(((v.value - pv.value) / Math.abs(pv.value)) * 1000) / 10 : null;
    const bad = /OVERDUE|LATE|BLOCKERS|EXCEPTIONS|EXC|SHORTAGE|DUE|DRAFT|PENDING|AWAITING|TO_BILL|UNMATCHED/.test(def.metric_id);
    return { ...k, prev: <bdi data-no-i18n>{fmtVal(pv.value, def.unit, d.currency)}</bdi>, ...(pct !== null && !k.delta ? { delta: { pct, better: bad ? "down" as const : "up" as const, label: ar ? "مقابل الشهر السابق" : "vs last month" } } : {}) };
  };
  const items = [...headline, ...d.metrics.map(({ def, v }) => withPrev(metricKpi(def, v, ar, d.currency), def, v)), ...lead, ...lines.map((l) => kpiFromV4(l, ar, prevLines.find((x) => x.id === l.id)))];
  const question = <span data-dp-dept-question>{ar ? d.question[1] : d.question[0]}</span>;
  const cards = [...d.insights.filter(({ def, v }) => !skipInsights.includes(def.metric_id) && !scalar(v)).map(({ def, v }) => <InsightCard key={def.metric_id} def={def} v={v} ar={ar} currency={d.currency} />), ...charts];
  const def = deptDashboardDef(dept, stripTitle);
  const nodes: PageNodes = {
    kpis: <Zone zone="kpis"><div data-dp-dept-metrics><KpiRow id={`dept-${dept}`} ar={ar} items={items} /></div></Zone>,
    charts: cards.length > 0 ? <Zone zone="charts"><div data-dp-dept-insights><ChartRow cols={cards.length >= 3 ? 3 : cards.length === 2 ? 2 : 1}>{cards}</ChartRow></div></Zone> : null,
    ...Object.fromEntries(rows.map((r) => { const box = (n: ReactNode) => <Zone key={r.id} zone="rows"><div className="h-full [&>*]:h-full" data-dp-dept-row={r.id}>{n}</div></Zone>;
      const node = r.node; return [`row:${r.id}`, typeof node === "function" ? (o: Record<string, string | undefined>) => box(node(o)) : box(node)]; })),
    strip: strip ? <Zone zone="strip">{strip}</Zone> : null,
    work: work ? <Zone zone="work">{work}</Zone> : null,
    links: <Zone zone="links"><div className="ek-links-row">
      <LinkGroup id={`dept-${dept}-reports`} title={ar ? "تقارير القسم" : "Department reports"}>{d.reports.map((r) => <DrillLink key={r.report} drill={r.drill} className={LINK_CHIP} data-dp-dept-report={r.report}>{translateTo(r.report, ar ? "ar" : "en")}</DrillLink>)}</LinkGroup>
      {links}
    </div></Zone>,
  };
  return <Page template="T2" id={`dept-${dept}`}><div className="ek-stack" data-dp-dept-contract={dept} aria-label={ar ? "لوحة القسم" : "Department dashboard"}>
    <CustomizeScope>{context ? <Zone zone="context">{context(question)}</Zone> : <p className="ek-sub">{question}</p>}</CustomizeScope>
    <PageBlocks def={def} nodes={nodes} company={company} />
  </div></Page>;
}

/** The department contract on its own (question, indicator tiles with definitions, insight charts, report buttons). */
export function DeptContractPanel({ dept, company, user, ar }: { dept: DeptKey; company: string; user: string; ar: boolean }) {
  const d = deptDashboard(dept, metricCtx(company, user));
  return <DeptOverview dept={dept} company={company} currency={d.currency} user={user} ar={ar} />;
}
