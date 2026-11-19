/**
 * DIGIT Pro → Enterprise kit adapters. Pro supplies its own figures (signals, insight lines, metric contracts) and drills;
 * the Enterprise kit draws them (KPI tiles, rows, charts). No figure is computed here — values pass through unchanged.
 */
import { useState, type ReactNode } from "react";
import { WorkPanel, type WorkTab } from "@/components/enterprise/kit";
import { translateTo } from "@/i18n";
import { amountFigure, type KpiItem, type Tone, type Wrap } from "@/components/enterprise/kit";
import { fmtCurrency } from "@/lib/format";
import { SourceState } from "./ProFrame";
import { bi, DrillLink, sevLabel, SevDot } from "./CommandUi";
import type { Bi, Drill, Signal } from "./command";
import type { V4Line } from "./v4Insights";

/** Every kit mark that opens records uses the one Pro drill renderer (same predicate as the rest of Pro). */
export const proWrap: Wrap = (d, children, attrs) => <DrillLink drill={d as Drill} {...(attrs ?? {})}>{children}</DrillLink>;
export const drillWrap = (d: Drill, attrs?: Record<`data-${string}`, string | undefined>) => (node: ReactNode) => <DrillLink drill={d} {...(attrs ?? {})}>{node}</DrillLink>;

/** Figure identity of a formatted amount ("⃁ 5,545,399.51" → amt:5545399), so one amount shows once per page. */
export function textFigure(v: string): string | undefined {
  const m = v.replace(/[,\u066C\s]/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Math.abs(n) >= 100 ? amountFigure(n) : undefined;
}

const GOOD: Record<string, "up" | "down" | undefined> = { cash: "up", invoiced: "up", receivable: "down", payable: "down" };
const CURRENT_STATE = (ar: boolean) => <span className="ek-score-flat" data-ek-prev="current">{ar ? "حالة حالية" : "Current state"}</span>;
/** Scorecard comparison for a signal with no built-in change: the same signal computed on the comparison date. */
function signalCompare(s: Signal, p: Signal | undefined, ar: boolean): Pick<KpiItem, "prev" | "delta"> {
  if (s.delta || !p || s.status !== "ok" || p.status !== "ok" || s.value === null || p.value === null) return {};
  if (p.value === s.value) return { prev: CURRENT_STATE(ar) };
  const pct = p.value ? Math.round(((s.value - p.value) / Math.abs(p.value)) * 1000) / 10 : null;
  return { prev: <bdi data-no-i18n data-ek-prev>{s.money ? fmtCurrency(p.value, s.currency) : p.value.toLocaleString("en-US")}</bdi>, ...(pct !== null ? { delta: { pct, better: GOOD[s.id] ?? "up", label: ar ? "مقابل الشهر السابق" : "vs last month" } } : {}) };
}
export function kpiFromSignal(s: Signal, ar: boolean, prevSignal?: Signal): KpiItem {
  const value = s.money ? fmtCurrency(s.value ?? 0, s.currency) : (s.value ?? 0).toLocaleString("en-US");
  const unit = s.id === "cash" ? (ar ? "حسابات" : "accounts") : s.id === "stock" ? (ar ? "صنف بالمخزون" : "items in stock") : ar ? "مستندات" : "documents";
  return {
    id: `signal:${s.id}`, figure: s.status === "ok" && s.value !== null ? amountFigure(s.value) ?? `signal:${s.id}` : `signal:${s.id}`,
    label: bi(ar, s.label), value,
    ...(s.status !== "ok" ? { state: <SourceState status={s.status} doctype={s.source.split(/[.·]/)[0]?.trim()} /> } : {}),
    ...(s.delta && s.delta.percent !== null ? { delta: { pct: s.delta.percent, better: GOOD[s.id], label: bi(ar, s.delta.label) } } : {}),
    // the scorecard's "previous period" is the comparison base the signal's change was computed from
    ...(s.status === "ok" && s.delta ? { prev: <bdi data-no-i18n data-ek-prev>{s.money ? fmtCurrency(s.delta.base, s.currency) : s.delta.base.toLocaleString("en-US")}</bdi> } : {}),
    ...signalCompare(s, prevSignal, ar),
    ...(s.spark ? { spark: s.spark.map((p) => p.value) } : {}),
    sub: <>{s.count !== undefined && <><bdi data-no-i18n>{s.count}</bdi> {unit} · </>}<span title={s.source}>{bi(ar, s.basis)}</span></>,
    ...(s.status === "ok" ? { wrap: drillWrap(s.drill, { "data-dp-signal-value": String(s.value ?? "") }) } : {}),
    attrs: { "data-dp-signal": s.id, "data-status": s.status },
  };
}

const TONE: Record<string, Tone> = { bad: "risk", warn: "attention", good: "good" };
/** The leading number of a formatted line value ("⃁ 8,573,939.40", "96", "36.9%"), or null when the value has none. */
export function leadNumber(v: string): number | null {
  const m = v.replace(/[,\u066C\s]/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
const LOWER_IS_BETTER = /overdue|late|exception|blocker|risk|shortage|aging|ageing|due|unmatched|gap|variance|متأخر|استثناء|مخاطر|عجز|فجوة|تباين|مستحق/i;
/** Scorecard comparison for an insight line: the same line evaluated on the comparison date (the previous period). */
export function v4Compare(l: V4Line, prev: V4Line | undefined, ar: boolean): Pick<KpiItem, "prev" | "delta"> {
  if (!prev || l.status !== "ok" || prev.status !== "ok") return {};
  const a = leadNumber(l.value), b = leadNumber(prev.value);
  const pct = a !== null && b !== null && b !== 0 ? Math.round(((a - b) / Math.abs(b)) * 1000) / 10 : a !== null && b !== null && a === b ? 0 : null;
  const better = LOWER_IS_BETTER.test(`${l.id} ${l.title[0]}`) ? "down" as const : "up" as const;
  // a line that reads the same on both dates is a current state (it does not move with the date): said so, no invented change
  if (prev.value === l.value) return { prev: CURRENT_STATE(ar) };
  return { prev: <bdi data-no-i18n data-ek-prev>{prev.value}</bdi>, ...(pct !== null ? { delta: { pct, better, label: ar ? "مقابل الشهر السابق" : "vs last month" } } : {}) };
}
export function kpiFromV4(l: V4Line, ar: boolean, prev?: V4Line): KpiItem {
  return {
    id: `v4:${l.id}`, figure: textFigure(l.value) ?? `v4:${l.id}`,
    label: bi(ar, l.title), value: l.value,
    ...v4Compare(l, prev, ar),
    ...(l.detail ? { sub: l.detail } : {}),
    ...(l.status === "empty" ? { tone: "neutral" as Tone } : {}),
    wrap: drillWrap(l.drill, { "data-dp-v4-insight": l.id }),
    attrs: { "data-dp-v4-tile": l.id, "data-status": l.status },
  };
}
export const toneOf = (t: string | undefined): Tone | undefined => (t ? TONE[t] : undefined);

/* ------------------------------------------------------------------ department worklists (template T2) ------------------------------------------------------------------ */
export interface QueueRow { key: string; severity: "high" | "medium" | "low"; doctype?: string; name: string; party?: string; state: Bi; next?: Bi; meta?: string; amount: number | null; currency?: string; drill: Drill; attrs?: Record<`data-${string}`, string> }
export interface QueueDef { id: string; label: Bi; status: "ok" | "denied" | "unavailable" | "empty"; rows: QueueRow[]; empty: Bi; register?: Drill | undefined; attrs?: Record<string, string> }

/** One fixed-height worklist panel: queue tabs inside, rows on the left, the selected row's detail beside it (opens the native document). */
export function QueueWork({ id, title, queues, active, onTab, ar, currency, registerAttr, extra = [] }: { id: string; title: string; queues: QueueDef[]; active: string; onTab: (id: string) => void; ar: boolean; currency: string; registerAttr?: string; extra?: WorkTab[] }) {
  const [sel, setSel] = useState<string | undefined>();
  const t = (en: string, a: string) => (ar ? a : en);
  const q = queues.find((x) => x.id === active);
  const row = q?.rows.find((r) => r.key === sel) ?? q?.rows[0];
  const list = (x: QueueDef) => x.status !== "ok" ? <div className="p-4"><SourceState status={x.status} /></div> : !x.rows.length ? <p className="p-5 text-sm text-muted-foreground" data-dp-queue-empty>{bi(ar, x.empty)}</p> : <>
    <ul role="listbox" aria-label={bi(ar, x.label)} className="ek-rowlist">{x.rows.map((r) => <li key={r.key} role="option" aria-selected={row?.key === r.key} tabIndex={0} className="ek-row cursor-pointer" data-on={row?.key === r.key ? "" : undefined} data-severity={r.severity} {...r.attrs}
      onClick={() => setSel(r.key)} onKeyDown={(e) => { if (e.key === "Enter") document.querySelector<HTMLAnchorElement>(`[data-ek-open-row="${CSS.escape(r.key)}"]`)?.click(); }}>
      <SevDot sev={r.severity} />
      <span className="ek-row-main"><span className="ek-row-title" data-no-i18n>{r.name}</span>
        <span className="ek-row-meta">{r.doctype && <>{translateTo(r.doctype, ar ? "ar" : "en")} · </>}{r.party && <bdi data-no-i18n>{r.party} · </bdi>}{bi(ar, r.state)}</span></span>
      <span className="ek-row-amt" data-no-i18n>{r.amount === null ? <span className="ek-row-meta">{r.meta || t("Quantity only", "كمية فقط")}</span> : fmtCurrency(r.amount, r.currency || currency)}</span>
    </li>)}</ul>
    {x.register && <div className="px-4 py-2"><DrillLink drill={x.register} className="ek-card-link" {...(registerAttr ? { [registerAttr]: x.id } : {})}>{t("Open full list", "فتح القائمة كاملة")} {ar ? "←" : "→"}</DrillLink></div>}
  </>;
  const tabs: WorkTab[] = [...queues.map((x) => ({ id: x.id, label: bi(ar, x.label), count: x.status === "ok" ? x.rows.length : undefined, tone: x.rows.some((r) => r.severity === "high") ? "risk" as const : x.rows.length ? "attention" as const : undefined, ...(x.attrs ? { attrs: x.attrs } : {}), content: x.id === active ? list(x) : null })), ...extra];
  const detail = q && row ? <div className="space-y-2" data-dp-queue-detail={row.key}>
    <div className="flex flex-wrap items-center gap-2"><span className="ek-dot" data-severity={row.severity} aria-hidden /><span className="ek-row-meta">{sevLabel(row.severity, ar)}</span>{row.doctype && <span className="ek-link-chip">{translateTo(row.doctype, ar ? "ar" : "en")}</span>}</div>
    <p className="ek-h3" data-no-i18n>{row.name}</p>
    <dl className="dp-dl">
      <dt>{t("Status", "الحالة")}</dt><dd>{bi(ar, row.state)}</dd>
      {row.party && <><dt>{t("Party", "الطرف")}</dt><dd data-no-i18n>{row.party}</dd></>}
      {row.meta && <><dt>{t("Detail", "التفصيل")}</dt><dd data-no-i18n>{row.meta}</dd></>}
      {row.amount !== null && <><dt>{t("Amount", "المبلغ")}</dt><dd className="tabular-nums" data-no-i18n>{fmtCurrency(row.amount, row.currency || currency)}</dd></>}
      {row.next && <><dt>{t("Next step", "الخطوة التالية")}</dt><dd>{bi(ar, row.next)}</dd></>}
    </dl>
    <DrillLink drill={row.drill} className="btn-primary inline-flex" data-ek-open-row={row.key}>{t("Open", "فتح")} {ar ? "←" : "→"}</DrillLink>
  </div> : undefined;
  return <WorkPanel id={id} title={title} tabs={tabs} active={active} onTab={(x) => { setSel(undefined); onTab(x); }} height={440} {...(queues.some((x) => x.id === active) && detail ? { detail } : {})} />;
}
