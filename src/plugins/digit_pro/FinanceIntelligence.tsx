// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, ChevronRight, Download, Printer, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { useStoreVersion } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { allDimensions } from "@/lib/dimensions";
import { fmtCurrency } from "@/lib/format";
import { runnerDefaults, type F, type RResult } from "@/lib/reportRunner";
import { ProFrame, SourceState } from "./ProFrame";
import { financeContext, sourceStatus, can, toCsv, todayIso } from "./finance";
import { foldRows } from "./StatementsPro";
import { comparisonRows, FINANCIAL_REPORTS, guardedReport, INTELLIGENCE_GROUPS, INTELLIGENCE_SOURCES, invoiceExposure, previousPeriod, type FinancialReport } from "./intelligence";
import { EXCEPTION_SOURCES } from "./financeExceptions";
import { FinanceExceptionReview } from "./FinanceExceptionReview";
import { CashForecastPanel, RiskBoard } from "@/components/enterprise/FinanceDesk";
import { reportColumns } from "./reportColumns";
import { ReportColumnControls } from "./ReportColumnControls";
import { StockExposure } from './StockExposure';
import { STOCK_EXPOSURE_SOURCES } from './stockExposure';
import { hasCashFlowSources } from './cashFlowSources';
import { CashFlowSources } from './CashFlowSources';
import { CostCenterProfit, MonthlyChart, PerformanceStrip, VarianceDrivers } from './FiCharts';
import { DateInput } from "@/components/form/DateInput";
import { amountFigure, ChartCard, Columns, FixedPanel, KpiStrip, monthLabel, money as kmoney, moneyShort, Page, RankedBars, type StripItem } from "@/components/enterprise/kit";
import { cleanLabel } from "@/components/enterprise/kit/labels";
import { PageBlocks, pageDashboard, type PageBlockDef } from "@/components/dashboards/PageBlocks";

/** Finance Intelligence blocks per analysis (shared Dashboard Designer: block menu, Customise in the band, saved per user, published per role / company). */
const FI_BLOCKS: Record<"cash" | "pl" | "report" | "budget", PageBlockDef[]> = {
  cash: [{ id: "exposure", title: ["Cash exposure", "التعرض النقدي"], w: 12 }, { id: "forecast", title: ["Cash forecast", "توقع النقد"], w: 6 }, { id: "risks", title: ["Finance risks", "المخاطر المالية"], w: 6 },
    { id: "exceptions", title: ["Finance exceptions", "الاستثناءات المالية"], w: 12 }, { id: "stock", title: ["Stock exposure", "التعرض المخزني"], w: 12 }],
  // owner 2026-11-13 §2d: no two tables in consecutive rows — cost centres sit between the summary and the monthly chart
  pl: [{ id: "summary", title: ["Performance", "الأداء"], w: 12, required: true }, { id: "costcenters", title: ["Profit by cost center", "الربح حسب مركز التكلفة"], w: 12 }, { id: "monthly", title: ["Income and expense by month", "الإيرادات والمصروفات شهريًا"], w: 8 }, { id: "drivers", title: ["Variance drivers", "محركات الانحراف"], w: 4 },
    { id: "statement", title: ["Statement", "القائمة"], w: 12, required: true }, { id: "checks", title: ["Reconciliation checks", "فحوص المطابقة"], w: 12 }],
  report: [{ id: "summary", title: ["Summary", "الملخص"], w: 12 }, { id: "trend", title: ["Trend", "الاتجاه"], w: 12 }, { id: "statement", title: ["Statement", "القائمة"], w: 12, required: true }, { id: "checks", title: ["Reconciliation checks", "فحوص المطابقة"], w: 12 }],
  budget: [{ id: "summary", title: ["Summary", "الملخص"], w: 12 }, { id: "statement", title: ["Budget variance", "انحراف الميزانية"], w: 12, required: true }, { id: "checks", title: ["Reconciliation checks", "فحوص المطابقة"], w: 12 }],
};
const fiDash = (k: keyof typeof FI_BLOCKS) => pageDashboard("digit_pro", `fi:${k}`, ["Finance Intelligence", "التحليل المالي للإدارة"], FI_BLOCKS[k], ["Accounts Manager"]);

export type IntelligenceSearch = { area?: string | undefined; report?: string | undefined; company?: string | undefined; from_date?: string | undefined; to_date?: string | undefined; finance_book?: string | undefined; cost_center?: string | undefined; project?: string | undefined; fiscal_year?: string | undefined; budget_against?: string | undefined; dimensions?: string | undefined; q?: string | undefined; columns?: string | undefined };
const REPORT_AR: Record<string,string> = { "Profit and Loss Statement": "قائمة الأرباح والخسائر", "Balance Sheet": "الميزانية العمومية", "Cash Flow": "التدفقات النقدية", "Trial Balance": "ميزان المراجعة", "Budget Variance Report": "تقرير انحراف الميزانية" };
const GROUP_AR = ["الأداء المالي", "النقد والسيولة", "الذمم المدينة والتحصيل", "الذمم الدائنة ومتطلبات السداد", "الميزانيات والانحراف", "الربحية والأبعاد", "رأس المال العامل", "التسوية المالية", "إقفال الفترة والاستثناءات", "حزمة تقارير الإدارة"];
function parsedDimensions(value?: string): F { try { const v: unknown = JSON.parse(value ?? "{}"); return v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter((entry): entry is [string,string] => typeof entry[1] === "string")) : {}; } catch { return {}; } }

export function FinanceIntelligence({ search }: { search: IntelligenceSearch }) {
  const ar = useLang() === "ar";
  return <ProFrame customize title={ar ? "التحليل المالي للإدارة" : "Finance Intelligence"} tabs={false} doctypes={[...INTELLIGENCE_SOURCES,...EXCEPTION_SOURCES,...STOCK_EXPOSURE_SOURCES]}>
    {({user}) => <IntelligenceBody search={search} user={user} />}
  </ProFrame>;
}
function IntelligenceBody({ search, user }: { search: IntelligenceSearch; user: string }) {
  useStoreVersion();
  const ar = useLang() === "ar", t = (en: string, arabic: string) => ar ? arabic : en;
  const nav = useNavigate(), ctx = financeContext(search.company,user);
  const [collapsed,setCollapsed] = useState<Set<string>>(new Set());
  const [sourceSection,setSourceSection] = useState<string | null>(null);

  const set = (p: Partial<IntelligenceSearch>) => void nav({ to: "/pro/finance-intelligence", search: (prev: IntelligenceSearch) => ({...prev,...p}), replace: true });
  const area = search.area === "cash" ? "cash" : search.area === "budget" ? "budget" : "performance";
  const report: FinancialReport = area === "budget" ? "Budget Variance Report" : FINANCIAL_REPORTS.includes(search.report as FinancialReport) && search.report !== "Budget Variance Report" ? search.report as FinancialReport : "Profit and Loss Statement";
  const defaults = runnerDefaults(report), from = search.from_date || ctx.fiscalYear?.start || defaults["from_date"] || "", to = search.to_date || todayIso();
  const period = previousPeriod(from,to);
  const dims = allDimensions().filter(d => !d.name || scopedList("Accounting Dimension",user).some(x => x.name === d.name));
  const custom = parsedDimensions(search.dimensions);
  const filters: F = { company: ctx.company, from_date: from, to_date: to, periodicity: "Monthly", finance_book: search.finance_book || "", cost_center: search.cost_center || "", project: search.project || "", ...Object.fromEntries(dims.filter(d => d.name).map(d => [d.fieldname,custom[d.fieldname] || ""])) };
  const budgetFilters: F = { company: ctx.company, from_fiscal_year: search.fiscal_year || ctx.fiscalYear?.name || "", budget_against: search.budget_against === "Project" ? "Project" : "Cost Center" };
  const current = period || area === "budget" ? guardedReport(report, area === "budget" ? budgetFilters : filters,user) : {status:"unavailable" as const};
  const prior = period && area !== "budget" ? guardedReport(report,{...filters,from_date:period.from,to_date:period.to},user) : null;
  const yearStart = scopedList("Fiscal Year",user).find(d => String(d["year_start_date"]) <= to && String(d["year_end_date"]) >= to)?.["year_start_date"];
  const ytd = period && yearStart && area !== "budget" && report !== "Balance Sheet" && report !== "Trial Balance" ? guardedReport(report,{...filters,from_date:String(yearStart)},user).result : undefined;
  if (!ctx.companies.length) return <SourceState status={sourceStatus("Company",user) === "ok" ? "empty" : "denied"} />;
  const pl = area === "performance" && report === "Profit and Loss Statement";
  const fyNow = scopedList("Fiscal Year",user).find(d => String(d["year_start_date"]) <= to && String(d["year_end_date"]) >= to);
  const fullFrom = ctx.fiscalYear?.start || defaults["from_date"] || "";
  const trendTo = fyNow && String(fyNow["year_end_date"]) < todayIso() ? String(fyNow["year_end_date"]) : todayIso();
  const trend = pl && fyNow ? guardedReport(report,{...filters,from_date:String(fyNow["year_start_date"]),to_date:trendTo},user) : null;
  const ledgerSearch: Record<string,string|undefined> = { company: ctx.company, from_date: from, to_date: to, finance_book: search.finance_book, cost_center: search.cost_center, project: search.project, dimensions: search.dimensions };
  const money = (v: unknown) => v === null || v === undefined ? "—" : fmtCurrency(Number(v),ctx.currency);
  const toggle = (id: string) => setCollapsed(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  let result = current.result;
  if (area !== "budget" && result) result = { ...result, rows: comparisonRows(result,prior?.result,ytd) };
  const first = result?.columns[0]?.fieldname || "account", q = (search.q || "").toLowerCase();
  const rows = result ? foldRows(result.rows,first,collapsed).filter(r => !q || String(r[first]).toLowerCase().includes(q) || r.is_total) : [];
  const available = area === "budget" ? [{key:"budget",label:t("Budget","الميزانية")},{key:"actual",label:t("Posted actual","الفعلي المرحّل")},{key:"variance",label:t("Variance","الانحراف")},{key:"variance_percent",label:"%"}] : [{key:"current",label:report === "Trial Balance" ? t("Closing net balance","صافي الرصيد الختامي") : report === "Balance Sheet" ? t("Closing balance","الرصيد الختامي") : t("Current period","الفترة الحالية")},{key:"previous",label:t("Previous period","الفترة السابقة")},{key:"variance",label:t("Variance","الانحراف")},{key:"variance_percent",label:"%"},...(ytd?[{key:"ytd",label:t("Year to date","من بداية السنة")}]:[])];
  const selected=reportColumns(search.columns,available.map(c=>c.key));
  const valueOf=(r:Record<string,unknown>,key:string)=>area === "budget" && key === "variance_percent" ? Number(r["budget"])===0?null:Number(r["variance"])/Math.abs(Number(r["budget"]))*100 : r[key];
  const exportRows = () => {
    if (!result || !can("GL Entry","export",undefined,user)) return;
    const columns = [{fieldname:first,label:t("Account","الحساب")},...selected.map(key=>({fieldname:key,label:available.find(c=>c.key===key)?.label||key}))];
    const exported=rows.map(r=>({...r,...Object.fromEntries(selected.map(key=>[key,valueOf(r,key)]))}));
    const url = URL.createObjectURL(new Blob(["\uFEFF"+toCsv(columns,exported)],{type:"text/csv;charset=utf-8"})); const a = document.createElement("a"); a.href=url; a.download=`finance-${report}-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <Page template="T4" id="FI-CFO"><div data-dp-intelligence={area} data-dp-screen="FI-CFO">
    <nav className="flex flex-wrap gap-1 border-b border-border pb-3" aria-label={t("Finance analysis areas","مجالات التحليل المالي")}>
      {INTELLIGENCE_GROUPS.map(([label,path,tab],i) => <Button key={label} variant={path === "/pro/finance-intelligence" && tab === area ? "secondary" : "ghost"} size="sm" asChild>
        <Link to={path} search={{...search,company:ctx.company,from_date:from,to_date:to,...(tab ? {area:tab} : {})} as never}>{ar ? GROUP_AR[i] : label}</Link>
      </Button>)}
    </nav>
    <section className="dp-context mt-4" aria-label={t("Financial scope","نطاق التحليل المالي")}>
      <label className="dp-ctx-item"><span>{t("Company","الشركة")}</span><select className="field-input" value={ctx.company} onChange={e => set({company:e.target.value,cost_center:undefined,project:undefined,dimensions:undefined})} data-no-i18n>{ctx.companies.map(c => <option key={c}>{c}</option>)}</select></label>
      {area !== "budget" && <><label className="dp-ctx-item"><span>{t("From Date","من تاريخ")}</span><DateInput className="field-input" value={from} onChange={e => set({from_date:e.target.value})} data-dp-cfo-from /></label><label className="dp-ctx-item"><span>{t("To Date","إلى تاريخ")}</span><DateInput className="field-input" value={to} onChange={e => set({to_date:e.target.value})} data-dp-cfo-to /></label></>}
      <div className="dp-ctx-item"><span>{t("Currency","العملة")}</span><strong data-no-i18n>{ctx.currency || "—"}</strong></div>
      {area === "performance" && <><label className="dp-ctx-item"><span>{t("Finance Book","الدفتر المالي")}</span><select className="field-input" value={search.finance_book || ""} onChange={e => set({finance_book:e.target.value || undefined})} data-no-i18n><option value="">{t("Company default","افتراضي الشركة")}</option>{scopedList("Finance Book",user).map(d => <option key={d.name}>{d.name}</option>)}</select></label>
      {dims.map(d => <label key={d.fieldname} className="dp-ctx-item"><span>{d.fieldname === "cost_center" ? t("Cost Center","مركز التكلفة") : d.fieldname === "project" ? t("Project","المشروع") : d.label}</span><select className="field-input" value={d.name ? custom[d.fieldname] || "" : search[d.fieldname as "cost_center" | "project"] || ""} onChange={e => d.name ? set({dimensions:JSON.stringify({...custom,[d.fieldname]:e.target.value})}) : set({[d.fieldname]:e.target.value || undefined})} data-no-i18n><option value="">{t("All","الكل")}</option>{scopedList(d.document_type,user).filter(x => !x["company"] || x["company"] === ctx.company).map(x => <option key={x.name}>{x.name}</option>)}</select></label>)}</>}
      {area === "budget" && <><label className="dp-ctx-item"><span>{t("Fiscal Year","السنة المالية")}</span><select className="field-input" value={budgetFilters["from_fiscal_year"]} onChange={e => set({fiscal_year:e.target.value})} data-no-i18n>{scopedList("Fiscal Year",user).map(d => <option key={d.name}>{d.name}</option>)}</select></label><label className="dp-ctx-item"><span>{t("Budget Against","الميزانية مقابل")}</span><select className="field-input" value={budgetFilters["budget_against"]} onChange={e => set({budget_against:e.target.value})}><option value="Cost Center">{t("Cost Center","مركز التكلفة")}</option><option value="Project">{t("Project","المشروع")}</option></select></label></>}
    </section>
    {area === "cash" ? <PageBlocks def={fiDash("cash")} company={ctx.company} nodes={{
      exposure: <CashExposure company={ctx.company} currency={ctx.currency} user={user} asOn={todayIso()} t={t} money={money} ar={ar} />,
      forecast: <CashForecastPanel company={ctx.company} currency={ctx.currency} compact />,
      risks: <RiskBoard company={ctx.company} currency={ctx.currency} />,
      exceptions: period ? <FinanceExceptionReview company={ctx.company} from={from} to={to} user={user} /> : <p className="text-destructive">{t("Choose a valid date range.","اختر نطاق تاريخ صحيحًا.")}</p>,
      stock: period ? <StockExposure company={ctx.company} currency={ctx.currency} user={user} asOn={to}/> : null,
    }} /> : <>
      {area === "performance" && <div className="mt-4 flex flex-wrap gap-1">{FINANCIAL_REPORTS.filter(r => r !== "Budget Variance Report").map(r => <Button key={r} size="sm" variant={r === report ? "default" : "outline"} onClick={() => {setCollapsed(new Set());set({report:r,columns:undefined});}} data-dp-cfo-report={r}>{ar ? REPORT_AR[r] : r}</Button>)}</div>}
      {!period && area !== "budget" ? <p className="mt-4 text-destructive">{t("Choose a valid date range.","اختر نطاق تاريخ صحيحًا.")}</p> : current.status !== "ok" ? <div className="mt-4"><SourceState status={current.status} /></div> : result && <>
        {prior && prior.status !== "ok" && <div className="mt-3"><SourceState status={prior.status} /></div>}
        <div className="mt-4"><PageBlocks def={fiDash(area === "budget" ? "budget" : pl ? "pl" : "report")} company={ctx.company} nodes={{
          summary: pl && current.result ? <PerformanceStrip rows={result.rows} hasPrior={!!prior && prior.status === "ok"} filters={filters} company={ctx.company} currency={ctx.currency} user={user} to={to} ar={ar} t={t} trend={trend?.status === "ok" ? trend.result : undefined} /> : !pl && !!result.summary?.length ? <div><KpiStrip ar={ar} id="fi-summary" items={result.summary.map((s): StripItem => ({ key: `sum:${s.label}`, figures: [amountFigure(Number(s.value))], node: <article className="ek-kpi" data-dp-fi-summary={s.label}><span className="ek-kpi-head"><span className="ek-kpi-label">{s.label === "Total Income This Year" ? t("Income in selected period","إيرادات الفترة المحددة") : s.label === "Total Expense This Year" ? t("Expense in selected period","مصروفات الفترة المحددة") : s.label}</span></span><span className="ek-kpi-main"><bdi className="ek-kpi-value" data-no-i18n>{money(s.value)}</bdi></span></article> }))} /></div> : null,
          monthly: pl ? trend?.status === "ok" && trend.result ? <MonthlyChart result={trend.result} from={from} to={to} fullFrom={fullFrom} onMonth={(f,tt) => set({from_date:f,to_date:tt})} onFull={() => set({from_date:undefined,to_date:undefined})} ar={ar} t={t} currency={ctx.currency} /> : <ChartCard title={t("Income and expense by month","الإيرادات والمصروفات شهريًا")} size="lg"><SourceState status={trend?.status === "denied" ? "denied" : "unavailable"} /></ChartCard> : null,
          drivers: pl ? <VarianceDrivers rows={result.rows} hasPrior={!!prior && prior.status === "ok"} ledgerSearch={{...ledgerSearch,from_date:period?.from ?? from}} currency={ctx.currency} ar={ar} t={t} /> : null,
          trend: area === "performance" && !pl && report !== "Trial Balance" && current.result ? <FinancialTrend current={current.result} report={report} t={t} ar={ar} currency={ctx.currency} /> : null,
          statement: <div data-dp-cfo-statement><FixedPanel id="fi-statement" height={560} title={ar ? REPORT_AR[report] : report} sub={<><span className="block">{area === "budget" ? t("Approved annual budgets against posted GL actuals; purchase commitments excluded.","الميزانيات السنوية المعتمدة مقابل الفعلي المرحّل في الأستاذ؛ التزامات الشراء مستبعدة.") : t("Native Core report results · equal-length previous period · company currency.","نتائج تقرير النواة الأصلي · فترة سابقة مساوية في المدة · عملة الشركة.")}</span><span className="mt-1 block" data-no-i18n>{area === "budget" ? budgetFilters["from_fiscal_year"] : `${from} — ${to} / ${period?.from} — ${period?.to}`}</span></>} actions={<div className="flex gap-1"><Button variant="ghost" size="icon" title={t("Export CSV","تصدير CSV")} aria-label={t("Export CSV","تصدير CSV")} onClick={exportRows} disabled={!can("GL Entry","export",undefined,user)}><Download /></Button><Button variant="ghost" size="icon" title={t("Print","طباعة")} aria-label={t("Print","طباعة")} onClick={() => window.print()}><Printer /></Button><Button variant="outline" size="sm" asChild><Link to="/report/$name" params={{name:report}} search={(area === "budget" ? budgetFilters : filters) as never}>{t("Source report","التقرير المصدر")}<ArrowUpRight /></Link></Button></div>} toolbar={<div className="flex flex-wrap items-center gap-3"><input type="search" className="field-input max-w-xs" placeholder={t("Find account","ابحث عن حساب")} aria-label={t("Find account","ابحث عن حساب")} value={search.q || ""} onChange={e => set({q:e.target.value || undefined})} /><ReportColumnControls available={available} selected={selected} onChange={columns=>set({columns})}/><Button variant="ghost" size="sm" onClick={() => setCollapsed(new Set())}>{t("Expand all","توسيع الكل")}</Button></div>}>{!rows.length ? <p className="py-8 text-center text-muted-foreground">{area === "budget" ? t("No approved budget data in this scope.","لا توجد بيانات ميزانية معتمدة في هذا النطاق.") : t("Nothing to show","لا توجد بيانات للعرض")}</p> : <table className="ek-table min-w-[760px]" data-dp-cfo-grid><thead><tr><th>{area === "budget" ? t("Dimension / Account","البعد / الحساب") : t("Account / Section","الحساب / القسم")}</th>{selected.map(key=><th key={key} className="text-end">{available.find(c=>c.key===key)?.label}</th>)}</tr></thead><tbody>{rows.map((r,i) => {
          const id=String(r[first] || ""), account=String(r["account"] || ""), group=Number(r["is_group"])===1, total=!!r.is_total;
          const leaf=first === "account" && !group && !total;
          const values=selected.map(key=>valueOf(r,key));
          const fy=scopedList("Fiscal Year",user).find(y => y.name===budgetFilters["from_fiscal_year"]);
          return <tr key={`${id}-${i}`} className={`${group || total || r.bold ? "font-semibold" : ""}`} data-total={total || undefined}><td><div className={`flex items-center gap-1 ${Number(r.indent)>0 ? "ps-4" : ""}`}>{group && <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={t("Toggle account","توسيع أو طي الحساب")} onClick={() => toggle(id)}>{collapsed.has(id)? <ChevronRight />:<ChevronDown />}</Button>}{leaf || area === "budget" && account && !total ? <Link to="/pro/general-ledger" search={{...filters,dimensions:search.dimensions,account,...(area === "budget" ? {finance_book:undefined,dimensions:undefined,cost_center:budgetFilters["budget_against"] === "Cost Center" ? id : undefined,project:budgetFilters["budget_against"] === "Project" ? id : undefined,from_date:String(fy?.["year_start_date"] || ""),to_date:String(fy?.["year_end_date"] || "")} : {})} as never} className="text-primary hover:underline" data-no-i18n data-dp-cfo-ledger={account}>{area === "budget" ? `${cleanLabel(id)} / ${cleanLabel(account)}` : cleanLabel(id)}</Link> : <span data-no-i18n={first === "account" && !total && !group ? "" : undefined}>{cleanLabel(id)}</span>}{area === "budget" && !!r["budget_name"] && <Link to="/app/$app/$doctype/$name" params={{app:"erpnext",doctype:"budget",name:String(r["budget_name"])}} className="text-primary" title={t("Approved budget","الميزانية المعتمدة")}><ArrowUpRight className="h-3 w-3" /></Link>}</div>{report === "Cash Flow" && area === "performance" && hasCashFlowSources(id) && <><Button variant="ghost" size="sm" className="mt-1" aria-expanded={sourceSection === id} onClick={() => setSourceSection(sourceSection === id ? null : id)} data-dp-cash-drill={id}>{sourceSection === id ? <ChevronDown /> : <ChevronRight />}{t("Source accounts","الحسابات المصدرية")}</Button>{sourceSection === id && <CashFlowSources section={id} filters={filters} user={user} currency={ctx.currency} expected={Number(r["current"]) || 0} dimensions={search.dimensions} />}</>}</td>{values.map((v,j) => <td className="whitespace-nowrap text-end tabular-nums" key={j} data-no-i18n>{selected[j] === "variance_percent" ? v === null ? "—" : `${Number(v).toFixed(1)}%` : money(v)}</td>)}</tr>;
        })}</tbody></table>}</FixedPanel></div>,
          costcenters: pl ? <div><CostCenterProfit company={ctx.company} from={from} to={to} user={user} currency={ctx.currency} selected={search.cost_center} onPick={cc => set({cost_center:cc})} ledgerSearch={ledgerSearch} ar={ar} t={t} /></div> : null,
          checks: !!result.checks?.length ? <section className="ek-card p-4" data-dp-fi-checks><h3 className="text-sm font-semibold">{t("Reconciliation checks","فحوص المطابقة")}</h3>{result.checks.map(c => <p key={c.label} className={c.ok ? "mt-1 text-xs text-success-text" : "mt-1 text-xs text-destructive"}><span>{c.label}</span> <span data-no-i18n>{c.detail}</span></p>)}</section> : null,
        }} /></div>
        <p className="mt-4 text-xs text-muted-foreground">{t("Variance compares report results, not causes. Zero prior baseline has no percentage. Virtual data; live financial acceptance is pending.","الانحراف مقارنة لنتائج التقرير وليس تفسيرًا للأسباب. لا تُحسب نسبة عند صفر الأساس السابق. بيانات افتراضية؛ التحقق المالي على النظام الفعلي لم يُنجز.")}</p>
      </>}
    </>}
  </div></Page>;
}
function FinancialTrend({current,report,t,ar,currency}:{current:RResult;report:string;t:(en:string,ar:string)=>string;ar:boolean;currency:string}) {
  const row = report === "Cash Flow" ? current.rows.find(r=>r["section"]==="Net Change in Cash") : report === "Balance Sheet" ? current.rows.find(r=>r["root_type"]==="Asset" && Number(r.indent)===0) : current.rows.find(r => r.is_total);
  const columns=current.columns.filter(c => c.fieldname.startsWith("p_"));
  const series=columns.map(c => { const ym=c.fieldname.slice(2,6)+"-"+c.fieldname.slice(6,8); const v=Number(row?.[c.fieldname])||0; return {key:ym,label:`${monthLabel(ym,ar)} ${ym.slice(0,4)}`,value:v,tone:v<0?"risk" as const:"good" as const}; });
  if (!series.some(s=>s.value)) return null;
  return <div className="mt-4" data-dp-fi-trend><ChartCard size="md" id="fi-trend" title={report === "Cash Flow" ? t("Net change in cash","صافي التغير في النقد") : report === "Balance Sheet" ? t("Asset position trend","اتجاه رصيد الأصول") : t("Net profit trend","اتجاه صافي الربح")} sub={t("Native monthly report values; partial months follow the selected dates.","قيم التقرير الأصلي الشهرية؛ الأشهر الجزئية تتبع التواريخ المحددة.")}>
    <Columns data={series} ar={ar} fmt={kmoney(currency)} axisFmt={moneyShort(currency)} height={200} />
  </ChartCard></div>;
}
function CashExposure({company,currency,user,asOn,t,money,ar}:{company:string;currency:string;user:string;asOn:string;t:(en:string,ar:string)=>string;money:(v:unknown)=>string;ar:boolean}) {
  const gl=guardedReport("General Ledger",{company,from_date:"",to_date:asOn,group_by:""},user);
  const accounts=scopedList("Account",user).filter(d=>d["company"]===company && !Number(d["is_group"]) && ["Bank","Cash"].includes(String(d["account_type"])));
  const positions=gl.status === "ok" ? accounts.map(a => {const r=guardedReport("General Ledger",{company,account:a.name,from_date:"",to_date:asOn,group_by:""},user).result; return {name:a.name,value:Number(r?.rows.at(-1)?.["balance"])||0};}) : [];
  const si=invoiceExposure(scopedList("Sales Invoice",user),company,currency,asOn), pi=invoiceExposure(scopedList("Purchase Invoice",user),company,currency,asOn);
  const sr=sourceStatus("Sales Invoice",user), pr=sourceStatus("Purchase Invoice",user);
  return <section className="mt-5" data-dp-cfo-cash><h2 className="font-semibold">{t("Cash position and current exposure","الموقف النقدي والانكشاف الحالي")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("Cash is posted GL as of today. Invoice outstanding is current, not historical and not a forecast.","النقد من الأستاذ المرحّل بعملة الشركة حتى اليوم. مستحقات الفواتير حالية وليست تاريخية أو توقعًا نقديًا.")} <span data-no-i18n>{asOn}</span></p><div className="mt-4"><KpiStrip ar={ar} id="fi-cash" items={[{id:"ar",label:t("Current receivables","الذمم المدينة الحالية"),value:si.outstanding,status:sr},{id:"ap",label:t("Current payables","الذمم الدائنة الحالية"),value:pi.outstanding,status:pr}].map((c): StripItem => ({ key: `cash:${c.id}`, figures: [c.status === "ok" ? amountFigure(c.value) : undefined], node: <article className="ek-kpi" data-dp-fi-cash={c.id}><span className="ek-kpi-head"><span className="ek-kpi-label">{c.label}</span></span>{c.status === "ok" ? <span className="ek-kpi-main"><bdi className="ek-kpi-value" data-no-i18n>{money(c.value)}</bdi></span> : <SourceState status={c.status} />}</article> }))} /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><ChartCard size="md" id="fi-cash-accounts" title={t("Cash by account","النقد حسب الحساب")} attrs={{"data-dp-surface":"cash-by-account"}}>{gl.status !== "ok" ? <SourceState status={gl.status} /> : !positions.length ? <SourceState status="empty" /> : <RankedBars ar={ar} fmt={kmoney(currency)} data={positions.map(p => ({key:p.name,label:cleanLabel(p.name),value:p.value,data:true,drill:p.name,tone:p.value<0?"risk" as const:undefined}))} wrap={(d,node,attrs) => <Link to="/pro/general-ledger" search={{company,account:String(d),from_date:"",to_date:asOn} as never} {...attrs}>{node}</Link>} />}</ChartCard><section className="dp-card" data-dp-surface="source-worklists"><h3 className="text-sm font-semibold">{t("Source worklists","قوائم العمل المصدرية")}</h3><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/pro/receivables" search={{company,overdue:"1"}}>{t("Overdue collections","التحصيل المتأخر")}</Link></Button><Button variant="outline" asChild><Link to="/pro/payables" search={{company,overdue:"1"}}>{t("Overdue bills","فواتير متأخرة")}</Link></Button><Button variant="outline" asChild><Link to="/pro/open-purchase-orders" search={{company}}>{t("Purchase commitments","التزامات الشراء")}</Link></Button></div><p className="mt-4 text-xs text-muted-foreground">{t("Purchase orders are commitments, not posted payables. Invoice due dates are obligations, not certain bank movements. No 13-week forecast or turnover ratios without verified assumptions and bases.","أوامر الشراء التزامات وليست ذممًا دائنة مرحّلة. تواريخ استحقاق الفواتير التزامات وليست حركات بنكية مؤكدة. لا توقع لـ13 أسبوعًا أو نسب دوران دون أسس وافتراضات موثقة.")}</p>{(si.excluded+pi.excluded)>0 && <p className="mt-2 text-xs text-warning">{t("Foreign-currency invoices excluded:","الفواتير بعملات أخرى المستبعدة:")} <span data-no-i18n>{si.excluded+pi.excluded}</span></p>}</section></div>
  </section>;
}
