// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * EC-R1 Phase 3b — Finance Intelligence (FI-CFO) visual layer over native Core report results. Presentation only:
 * values come from the guarded native P&L runner (intelligence.ts) and the posted ledger; nothing is recomputed as a
 * substitute statement. Every chart element opens or scopes its source: month → scoped P&L, account → General Ledger,
 * cost center → P&L filtered by that center.
 */
import { Link } from "@tanstack/react-router";
import { fmtCurrency } from "@/lib/format";
import type { F, RResult, Row } from "@/lib/reportRunner";
import { SourceState } from "./ProFrame";
import { amountFigure, ChartCard, DeltaChip, FixedPanel, GroupedColumns, KpiStrip, money as kmoney, moneyShort, Spark, type StripItem, type Wrap, Meter } from "@/components/enterprise/kit";
import { cleanLabel } from "@/components/enterprise/kit/labels";
import { KpiCard } from "@/components/enterprise/kit/KpiCard";
import { SplitBars } from "@/components/enterprise/kit/SplitCard";
import { scopedList } from "@/lib/scope";
import type { ReactNode } from "react";
import { variance } from "./intelligence";
import { profitabilityAttribution } from "./profitabilityAttribution";
import { cashPosition, monthEnd } from "./command";

type T = (en: string, ar: string) => string;
const n = (v: unknown) => Number(v) || 0;
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const root = (rows: Row[], rt: string) => rows.find((r) => r["root_type"] === rt && n(r["indent"]) === 0);

/** I2 — performance strip: income, expense, net result vs the equal-length previous period, plus posted cash at the end date (kit KPI tiles). */
export function PerformanceStrip({ rows, hasPrior, filters, company, currency, user, to, ar, t, trend }: { rows: Row[]; hasPrior: boolean; filters: F; company: string; currency: string; user: string; to: string; ar: boolean; t: T; trend?: RResult | undefined }) {
  const inc = root(rows, "Income"), exp = root(rows, "Expense"), net = rows.find((r) => r.is_total);
  const cash = cashPosition(company, user, to);
  const months = trend ? trend.columns.filter((c) => c.fieldname.startsWith("p_")).map((c) => c.fieldname) : [];
  const tInc = trend ? root(trend.rows, "Income") : undefined, tExp = trend ? root(trend.rows, "Expense") : undefined;
  const spark = { income: months.map((f) => n(tInc?.[f])), expense: months.map((f) => n(tExp?.[f])), net: months.map((f) => n(tInc?.[f]) - n(tExp?.[f])) };
  const card = (id: "income" | "expense" | "net", label: string, row: Row | undefined, good: "up" | "down"): StripItem => {
    const cur = n(row?.["current"]), prev = row?.["previous"] === null || row?.["previous"] === undefined ? null : n(row["previous"]);
    const v = prev === null ? null : variance(cur, prev);
    const tone = id === "net" && cur < 0 ? "risk" : undefined;
    // the one Enterprise KPI card (Round 1 §4): net result is a signed figure (negative = «−» in the negative colour)
    return { key: `fi:${id}`, figures: [amountFigure(cur)], node: <KpiCard key={id} ar={ar} label={label} value={fmtCurrency(cur, currency)} signed={id === "net"} tone={tone}
      delta={hasPrior && v && v.percent !== null ? { pct: v.percent, better: good } : undefined} spark={spark[id].length > 1 ? spark[id] : undefined}
      meta={hasPrior && v ? <>{t("vs previous period", "مقارنة بالفترة السابقة")} <bdi data-no-i18n>{fmtCurrency(prev ?? 0, currency)}</bdi></> : t("No comparable previous period", "لا توجد فترة سابقة قابلة للمقارنة")}
      attrs={{ "data-dp-fi-card": id, "data-value": cur }}
      Root={(rp) => <Link to="/report/$name" params={{ name: "Profit and Loss Statement" }} search={filters as never} {...(rp as Record<string, unknown>)} title={t("Opens the native Profit and Loss report with the same filters", "يفتح تقرير الأرباح والخسائر الأصلي بنفس عوامل التصفية")}>{rp.children}</Link>} /> };
  };
  const items: StripItem[] = [card("income", t("Income", "الإيرادات"), inc, "up"), card("expense", t("Expense", "المصروفات"), exp, "down"), card("net", t("Net result", "صافي النتيجة"), net, "up"),
    { key: "fi:cash", figures: [cash.status === "ok" ? amountFigure(cash.value ?? 0) : undefined], node: <KpiCard ar={ar} label={t("Cash & bank at end date", "النقد والبنوك في تاريخ النهاية")}
      value={fmtCurrency(cash.value ?? 0, currency)} icon="bank" attrs={{ "data-dp-fi-card": "cash", "data-value": cash.value ?? 0 }}
      meta={<>{t("Posted ledger balance", "رصيد الأستاذ المرحّل")} · <bdi data-no-i18n>{to}</bdi> · <bdi data-no-i18n>{cash.accounts}</bdi> {t("accounts", "حسابات")}</>}
      state={cash.status === "ok" ? undefined : <SourceState status={cash.status} doctype="GL Entry" />}
      Root={cash.status === "ok" ? (rp) => <Link to="/pro/finance-intelligence" search={{ company, area: "cash", to_date: to } as never} {...(rp as Record<string, unknown>)}>{rp.children}</Link> : undefined} /> }];
  // split card (Round 1 §8): posted income / expense solid, draft invoices of the same period hatched, «N للمراجعة»
  const from = String((filters as Record<string, unknown>)["from_date"] ?? ""), upto = String((filters as Record<string, unknown>)["to_date"] ?? to);
  const drafts = (dt: "Sales Invoice" | "Purchase Invoice") => scopedList(dt, user).filter((d) => Number(d.docstatus ?? 0) === 0 && d["company"] === company && (!from || String(d["posting_date"] ?? "") >= from) && String(d["posting_date"] ?? "") <= upto);
  const dSi = drafts("Sales Invoice"), dPi = drafts("Purchase Invoice");
  const sum = (a: { [k: string]: unknown }[]) => a.reduce((x, d) => x + n(d["base_net_total"] ?? d["net_total"] ?? d["grand_total"]), 0);
  const incV = n(inc?.["current"]), expV = n(exp?.["current"]), netV = n(net?.["current"]);
  const incPrev = inc?.["previous"] === null || inc?.["previous"] === undefined ? null : n(inc["previous"]);
  const incVar = hasPrior && incPrev !== null ? variance(incV, incPrev) : null;
  const draftList = (dt: string) => ({ to: "/app/$app/$doctype", params: { app: "erpnext", doctype: dt.toLowerCase().replace(/ /g, "_") }, filters: [["docstatus", "=", 0], ["company", "=", company], ...(from ? [["posting_date", ">=", from]] : []), ["posting_date", "<=", upto]] });
  const wrap = (drill: unknown, node: ReactNode, attrs?: Record<string, string>) => { const d = drill as ReturnType<typeof draftList>; return <Link to={d.to as never} params={d.params as never} search={{ filters: JSON.stringify(d.filters) } as never} {...attrs}>{node}</Link>; };
  const split = <ChartCard title={t("Income and expense", "الإيراد والمصروف")} sub={t("Posted in the period (solid) and draft invoices of the same period (hatched)", "المرحّل في الفترة (مصمت) ومسودات فواتير الفترة نفسها (مخطط)")} id="fi-split">
    <SplitBars ar={ar} wrap={wrap} value={fmtCurrency(incV, currency)}
      pct={incV ? { value: (netV / incV) * 100, label: t("net margin", "هامش صافٍ") } : undefined}
      delta={incVar && incVar.percent !== null ? { pct: incVar.percent, vs: t("the previous period", "الفترة السابقة"), better: "up" } : undefined}
      bars={[{ key: "income", label: t("Income", "الإيراد"), solid: incV, pending: sum(dSi), display: fmtCurrency(incV, currency), pendingDisplay: fmtCurrency(sum(dSi), currency), tone: "emerald", drill: dSi.length ? draftList("Sales Invoice") : undefined, review: dSi.length ? { count: dSi.length, drill: draftList("Sales Invoice") } : undefined },
        { key: "expense", label: t("Expense", "المصروف"), solid: expV, pending: sum(dPi), display: fmtCurrency(expV, currency), pendingDisplay: fmtCurrency(sum(dPi), currency), tone: "coral", drill: dPi.length ? draftList("Purchase Invoice") : undefined, review: dPi.length ? { count: dPi.length, drill: draftList("Purchase Invoice") } : undefined }]}
      // «N للمراجعة» opens exactly N drafts: one card link only when one list holds them all, else each bar carries its own
      review={dSi.length && dPi.length ? undefined : dSi.length ? { count: dSi.length, drill: draftList("Sales Invoice") } : dPi.length ? { count: dPi.length, drill: draftList("Purchase Invoice") } : undefined} />
  </ChartCard>;
  return <div className="mt-4 grid gap-4" data-dp-fi-strip aria-label={t("Performance summary", "ملخص الأداء")}><KpiStrip items={items} ar={ar} id="fi-kpis" />{split}</div>;
}

/** I3 — monthly income vs expense (native runner period columns) with the net line. Clicking a month scopes the analysis to it. */
export function MonthlyChart({ result, from, to, onMonth, onFull, fullFrom, ar, t, currency }: { result: RResult; from: string; to: string; onMonth: (from: string, to: string) => void; onFull: () => void; fullFrom: string; ar: boolean; t: T; currency: string }) {
  const cols = result.columns.filter((c) => c.fieldname.startsWith("p_"));
  const inc = root(result.rows, "Income"), exp = root(result.rows, "Expense");
  const data = cols.map((c) => { const d = `${c.fieldname.slice(2, 6)}-${c.fieldname.slice(6, 8)}-${c.fieldname.slice(8, 10)}`; const ym = d.slice(0, 7); const mi = Number(ym.slice(5, 7)) - 1; return { key: c.fieldname, ym, label: `${(ar ? MON_AR : MON_EN)[mi] ?? ym} ${ym.slice(0, 4)}`, short: (ar ? MON_AR : MON_EN)[mi] ?? ym, income: n(inc?.[c.fieldname]), expense: n(exp?.[c.fieldname]), start: d, end: monthEnd(ym) }; });
  const scoped = from !== fullFrom;
  const title = t("Income and expense by month", "الإيرادات والمصروفات شهريًا");
  const note = t("Native Profit and Loss monthly columns for the fiscal year. Click a month to compare it with the preceding period of equal length.", "أعمدة تقرير الأرباح والخسائر الأصلي الشهرية للسنة المالية. انقر شهرًا لمقارنته بالفترة السابقة المساوية له في المدة.");
  if (!data.some((x) => x.income || x.expense)) return <ChartCard title={title} size="lg" id="fi-monthly"><SourceState status="empty" /></ChartCard>;
  const sel = data.find((x) => scoped && from === x.start && to <= x.end)?.ym;
  const wrap: Wrap = (drill, node, attrs) => { const x = data[Number(drill)]!; return <button type="button" className="ek-col-hit" onClick={() => onMonth(x.start, to < x.end ? to : x.end)} data-dp-fi-month={x.ym} {...(sel === x.ym ? { "data-selected": "" } : {})} {...attrs}>{node}</button>; };
  return <ChartCard title={title} sub={note} size="lg" id="fi-monthly" attrs={{ "data-dp-fi-monthly": "" }} action={scoped ? <button type="button" className="dp-chip dp-chip-on" onClick={onFull} data-dp-fi-full>{t("Scoped", "محدد")} <bdi data-no-i18n>{from} … {to}</bdi> ✕</button> : undefined}>
    <GroupedColumns groups={data.map((x) => ({ key: x.ym, label: x.short }))} ar={ar} wrap={wrap} height={250} fmt={kmoney(currency)} axisFmt={moneyShort(currency)}
      series={[{ label: t("Income", "الإيرادات"), values: data.map((x) => x.income), drills: data.map((_, i) => i), tone: "good" }, { label: t("Expense", "المصروفات"), values: data.map((x) => x.expense), drills: data.map((_, i) => i), tone: "neutral" }]}
      line={{ label: t("Net (positive months)", "الصافي (الأشهر الموجبة)"), values: data.map((x) => x.income - x.expense), tone: "attention" }} />
  </ChartCard>;
}

/** I3 — account variance drivers: leaf Income/Expense accounts with the largest change vs the previous period → General Ledger. */
export function VarianceDrivers({ rows, hasPrior, ledgerSearch, currency, ar, t }: { rows: Row[]; hasPrior: boolean; ledgerSearch: Record<string, string | undefined>; currency: string; ar: boolean; t: T }) {
  const leaves = rows.filter((r) => !r.is_total && !n(r["is_group"]) && ["Income", "Expense"].includes(String(r["root_type"])) && r["variance"] !== null && r["variance"] !== undefined && n(r["variance"]) !== 0)
    .sort((a, b) => Math.abs(n(b["variance"])) - Math.abs(n(a["variance"]))).slice(0, 8);
  const max = Math.max(1, ...leaves.map((r) => Math.abs(n(r["variance"]))));
  return <ChartCard title={t("What changed — top account variances", "ما الذي تغيّر — أكبر انحرافات الحسابات")} size="lg" id="fi-drivers" attrs={{ "data-dp-fi-drivers": leaves.length }}
    sub={t("Current vs previous equal-length period. Green improves the result, red reduces it. Click an account to open its ledger entries across both periods.", "الحالية مقابل فترة سابقة مساوية. الأخضر يحسّن النتيجة والأحمر يخفضها. انقر حسابًا لفتح قيوده في الأستاذ للفترتين.")}>
    {!hasPrior ? <p className="text-sm text-muted-foreground">{t("No comparable previous period.", "لا توجد فترة سابقة قابلة للمقارنة.")}</p> : !leaves.length ? <p className="text-sm text-muted-foreground">{t("No account changed between the two periods.", "لم يتغير أي حساب بين الفترتين.")}</p> :
      <ul className="grid gap-1">{leaves.map((r) => { const v = n(r["variance"]); const income = r["root_type"] === "Income"; const favourable = income ? v > 0 : v < 0; const account = String(r["account"]);
        return <li key={account}><Link to="/pro/general-ledger" search={{ ...ledgerSearch, account, from: "intelligence" } as never} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent" data-dp-fi-driver={account} data-variance={v}>
          <span className="min-w-0"><span className="block truncate" data-no-i18n title={account}>{cleanLabel(account)}</span><span className="block text-[11px] text-muted-foreground">{income ? t("Income", "إيراد") : t("Expense", "مصروف")} · <bdi data-no-i18n>{fmtCurrency(n(r["previous"]), currency)} → {fmtCurrency(n(r["current"]), currency)}</bdi></span></span>
          <Meter signed value={favourable ? Math.abs(v) : -Math.abs(v)} max={max} label={fmtCurrency(v, currency)} />
          <span className={`whitespace-nowrap text-end text-xs font-semibold tabular-nums ${favourable ? "text-success-text" : "text-destructive"}`} data-no-i18n>{v > 0 ? "+" : "−"}{fmtCurrency(Math.abs(v), currency)}{r["variance_percent"] !== null && r["variance_percent"] !== undefined ? ` · ${Math.abs(n(r["variance_percent"])).toFixed(1)}%` : ""}</span>
        </Link></li>; })}</ul>}
  </ChartCard>;
}

/** I5 — profitability by cost center from posted P&L ledger rows; click scopes the P&L to that center, the ledger link opens its entries. */
export function CostCenterProfit({ company, from, to, user, currency, selected, onPick, ledgerSearch, ar, t }: { company: string; from: string; to: string; user: string; currency: string; selected?: string | undefined; onPick: (cc: string | undefined) => void; ledgerSearch: Record<string, string | undefined>; ar: boolean; t: T }) {
  const p = profitabilityAttribution(company, from, to, user);
  const title = t("Profitability by cost center", "الربحية حسب مركز التكلفة");
  if (p.status !== "ok") return <FixedPanel title={title} height="auto" id="fi-cc"><SourceState status={p.status} doctype="GL Entry" /></FixedPanel>;
  const rows = [...p.rows].sort((a, b) => b.net - a.net);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.income, r.expense)));
  return <FixedPanel title={title} height={360} id="fi-cc" attrs={{ "data-dp-fi-cc": rows.length }}
    actions={selected ? <button type="button" className="dp-chip dp-chip-on" onClick={() => onPick(undefined)} data-dp-fi-cc-clear><bdi data-no-i18n>{cleanLabel(selected)}</bdi> ✕</button> : undefined}
    sub={t("Posted income and expense attributed to each cost center in the selected period. Click a center to filter the statement; entries without a center are shown separately, never allocated.", "الإيرادات والمصروفات المرحّلة المنسوبة لكل مركز تكلفة في الفترة المحددة. انقر مركزًا لتصفية القائمة؛ القيود بلا مركز تظهر منفصلة ولا تُوزَّع.")}>
    {!rows.length ? <SourceState status="empty" /> : <table className="ek-table dp-cc-table"><thead><tr><th>{t("Cost center", "مركز التكلفة")}</th><th>{t("Income vs expense", "الإيراد مقابل المصروف")}</th><th className="text-end">{t("Net", "الصافي")}</th><th className="text-end">{t("Entries", "القيود")}</th><th /></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.costCenter} {...(selected === r.costCenter ? { "data-selected": "" } : {})} data-dp-fi-cc-row={r.costCenter}>
        <td><button type="button" className="text-start font-medium text-primary hover:underline" onClick={() => onPick(r.costCenter)} data-dp-fi-cc-pick={r.costCenter} data-no-i18n>{cleanLabel(r.costCenter)}</button></td>
        <td className="min-w-40"><span className="grid gap-0.5"><Meter size="sm" value={r.income} max={max} label={t("Income", "إيراد")} /><Meter size="sm" value={r.expense} max={max} tone="secondary" label={t("Expense", "مصروف")} /></span></td>
        <td className={`whitespace-nowrap text-end font-semibold tabular-nums ${r.net < 0 ? "text-destructive" : ""}`} data-no-i18n>{fmtCurrency(r.net, currency)}</td>
        <td className="text-end tabular-nums" data-no-i18n>{r.entries}</td>
        <td className="whitespace-nowrap"><Link to="/pro/general-ledger" search={{ ...ledgerSearch, cost_center: r.costCenter, from: "intelligence" } as never} className="text-xs text-primary hover:underline" data-dp-fi-cc-gl={r.costCenter}>{t("Ledger", "الأستاذ")}</Link></td>
      </tr>)}
      {p.unattributed.entries > 0 && <tr data-dp-fi-cc-row="__none"><td className="text-muted-foreground">{t("No cost center", "بلا مركز تكلفة")}</td><td /><td className="text-end tabular-nums text-muted-foreground" data-no-i18n>{fmtCurrency(p.unattributed.net, currency)}</td><td className="text-end tabular-nums text-muted-foreground" data-no-i18n>{p.unattributed.entries}</td><td /></tr>}
      </tbody></table>}
  </FixedPanel>;
}
