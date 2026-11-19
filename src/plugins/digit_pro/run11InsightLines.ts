/**
 * DIGIT Pro Run11.1 Part C — the six insights of a section workspace as visible insight lines (owner 2026-11-11):
 * title, value and a drill to exactly its records, first on the workspace Dashboard tab. Each value is the figure of the
 * element that serves the insight (run11Insights.ts INSIGHT_MAP → placement binds / own defined formula), evaluated by
 * the shared section engine — so the insight line and the card below it can never disagree. A role that may not read
 * the records gets no line (hidden), never a zero.
 */
import { cachedMeta } from "@/lib/catalog";
import { recordLabel } from "@/components/enterprise/kit/labels";
import { translateTo } from "@/i18n";
import { fmtCurrency } from "@/lib/format";
import type { Bi, Drill } from "./command";
import { arRegister } from "./aging";
import { INSIGHT_MAP } from "./run11Insights";
import { PLACEMENTS, RUN11_QUEUES } from "./run11";
import { formulaKey, workspaceSpec } from "./run11Formulas";
import { evalChart, evalKpi, evalQueue, figureText, type SectionCtx } from "./sections";

export interface InsightLine { id: string; title: Bi; status: "ok" | "empty"; value: string; detail: string; drill: Drill; via: string }
type Ev = { status: string; value: string; detail: string; drill?: Drill };

const money = (totals: { currency: string; amount: number }[]) => totals.map((t) => fmtCurrency(t.amount, t.currency)).join(" · ");
function evalBind(ws: string, ctx: SectionCtx, user: string, ar: boolean, b: string): Ev | null {
  const [k, ...rest] = b.split(":"); const v = rest.join(":"); const spec = workspaceSpec(ws); if (!spec) return null;
  if (k === "kpi") {
    const def = spec.kpis(ctx).find((x) => x.id === v); if (!def) return null; const r = evalKpi(def, ctx, user);
    const value = r.figure ? figureText(r.figure, ar) : r.totals.length ? money(r.totals) : r.count.toLocaleString("en-US");
    const detail = r.figure || r.totals.length ? (ar ? `${r.count.toLocaleString("en-US")} سجل` : `${r.count.toLocaleString("en-US")} record${r.count === 1 ? "" : "s"}`) : "";
    return { status: r.status, value, detail, drill: r.drill };
  }
  if (k === "chart") {
    const def = spec.charts(ctx).find((x) => x.id === v); if (!def) return null; const r = evalChart(def, ctx, user);
    if (r.status !== "ok") return { status: r.status, value: "", detail: "" };
    const bars = r.bars.filter((x) => (x.value ?? x.count) !== 0); const top = [...bars].sort((a, b) => Math.abs(b.value ?? b.count) - Math.abs(a.value ?? a.count))[0];
    const total = r.bars.reduce((t, x) => t + (x.value ?? x.count), 0); const isMoney = r.bars.some((x) => x.value !== null) && r.currencies.length === 1;
    const fmt = (x: number) => (isMoney ? fmtCurrency(x, r.currencies[0]!) : x.toLocaleString("en-US", { maximumFractionDigits: 2 }));
    if (!top) return { status: "empty", value: "0", detail: "", drill: r.bars[0]?.drill ?? { kind: "list", doctype: def.doctype, filters: def.filters as never } };
    return { status: "ok", value: fmt(total), detail: `${ar ? "الأعلى" : "Top"}: ${ar ? translateTo(cachedMeta(top.label) ? top.label : recordLabel(top.label), "ar") : recordLabel(top.label)} · ${fmt(top.value ?? top.count)}`, drill: { kind: "list", doctype: def.doctype, filters: def.filters as never } };
  }
  if (k === "queue" || k === "run11q") {
    const def = (k === "queue" ? spec.queues(ctx) : RUN11_QUEUES[ws]?.(ctx) ?? []).find((x) => x.id === v); if (!def) return null; const r = evalQueue(def, ctx, user, 3);
    const amt = r.rows.filter((x) => x.amount !== null).reduce((t, x) => t + (x.amount ?? 0), 0);
    return { status: r.status === "ok" && !r.count ? "empty" : r.status, value: r.count.toLocaleString("en-US"), detail: r.rows[0] ? `${ar ? "الأقدم" : "First"}: ${r.rows[0].name}${amt && r.rows[0].currency ? ` · ${fmtCurrency(r.rows[0].amount ?? 0, r.rows[0].currency)}` : ""}` : "", drill: r.drill };
  }
  if (k === "ageing" && (v === "receivable" || v === "payable")) {
    const reg = arRegister(v, ctx.company, ctx.asOf, user, ctx.asOf); if (reg.status !== "ok") return { status: reg.status, value: "", detail: "" };
    const open = reg.rows.filter((x) => x.outstanding > 0); const by = new Map<string, number>(); for (const x of open) by.set(x.currency, (by.get(x.currency) ?? 0) + x.outstanding);
    const late = open.filter((x) => x.days > 90); const lateBy = new Map<string, number>(); for (const x of late) lateBy.set(x.currency, (lateBy.get(x.currency) ?? 0) + x.outstanding);
    return { status: open.length ? "ok" : "empty", value: money([...by].map(([currency, amount]) => ({ currency, amount }))) || "0", detail: late.length ? `${ar ? "أكثر من 90 يومًا" : "Over 90 days"}: ${money([...lateBy].map(([currency, amount]) => ({ currency, amount })))}` : "",
      drill: { kind: "pro", to: v === "receivable" ? "/pro/receivables" : "/pro/payables", search: { company: ctx.company } } };
  }
  return null;
}
const bindsOf = (s0: string) => { const p = PLACEMENTS.find((x) => x.id === s0); return p ? p.binds : /^(kpi|chart|queue|run11q):/.test(s0) ? [s0] : [`kpi:${formulaKey(s0)}`, `chart:${formulaKey(s0)}`, `run11q:${formulaKey(s0)}`]; };
/** Insight ids of one workspace, in register order (…-BI-01..06). */
export const insightIdsOf = (ws: string) => Object.keys(INSIGHT_MAP).filter((id) => id.startsWith(`${ws}-BI-`)).sort();
/** One insight evaluated; null when its records are denied / unavailable for the user (the line is hidden). */
export function insightLine(id: string, ctx: SectionCtx, user: string, ar: boolean): InsightLine | null {
  const ins = INSIGHT_MAP[id]; if (!ins) return null; const ws = id.split("-").slice(0, 2).join("-");
  for (const s0 of ins.served) for (const b of bindsOf(s0)) {
    const r = evalBind(ws, ctx, user, ar, b); if (!r) continue;
    if (r.status !== "ok" && r.status !== "empty") return null;
    if (!r.drill) continue;
    return { id, title: ins.title, status: r.status as "ok" | "empty", value: r.value, detail: r.detail, drill: r.drill, via: b };
  }
  return null;
}
export const insightLines = (ws: string, ctx: SectionCtx, user: string, ar: boolean) => insightIdsOf(ws).map((id) => insightLine(id, ctx, user, ar)).filter((x): x is InsightLine => !!x);
