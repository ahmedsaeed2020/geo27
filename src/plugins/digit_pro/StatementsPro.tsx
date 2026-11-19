// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/** SC-F-12 Financial Statements — Core P&L / Balance Sheet / Cash Flow runners with one filter set, period comparison, checks, CSV and GL drill-down. */
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useStoreVersion } from "@/lib/adapter";
import { useLang } from "@/i18n";
import { fmtCurrency } from "@/lib/format";
import { runnerDefaults, type Row } from "@/lib/reportRunner";
import { scopedList } from "@/lib/scope";
import { financeContext, sourceStatus } from "./finance";
import { ViewToolbar } from "./ViewToolbar";
import { STATEMENTS_SPEC } from "./viewSpecs";
import type { Search, ViewSearchKeys } from "./savedViews";
import { ProFrame, SourceState } from "./ProFrame";
import { guardedReport } from "./intelligence";
import { DateInput } from "@/components/form/DateInput";

export const STATEMENTS = ["Profit and Loss Statement", "Balance Sheet", "Cash Flow"] as const;
export type Statement = (typeof STATEMENTS)[number];
export interface StSearch extends ViewSearchKeys { report?: string | undefined; company?: string | undefined; from_date?: string | undefined; to_date?: string | undefined; periodicity?: string | undefined; finance_book?: string | undefined; cost_center?: string | undefined; project?: string | undefined }
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MON_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
/** Runner period labels ("Oct 2026") localized for Arabic; other labels pass through the i18n layer. */
const periodLabel = (l: string, ar: boolean) => { const m = /^([A-Z][a-z]{2}) (\d{4})$/.exec(l); const i = m ? MON.indexOf(m[1]!) : -1; return ar && i >= 0 ? `${MON_AR[i]} ${m![2]}` : l; };
const PERIODS = ["Monthly", "Quarterly", "Half-Yearly", "Yearly"];

/** Hide rows below collapsed groups (indent order, same as the runner). */
export function foldRows(rows: Row[], key: string, collapsed: Set<string>): Row[] {
  const out: Row[] = []; let below = Infinity;
  for (const r of rows) { const ind = Number(r.indent ?? 0); if (!r.is_total && ind > below) continue; below = Infinity; out.push(r); if (collapsed.has(String(r[key]))) below = ind; }
  return out;
}

export function StatementsPro({ search }: { search: StSearch }) {
  return <ProFrame title="Financial Statements" subtitle="Core Profit and Loss, Balance Sheet and Cash Flow reports — same source, filters and totals." doctypes={["Finance Book", "Cost Center", "Project"]}>
    {({ user }) => <Body search={search} user={user} />}
  </ProFrame>;
}

function Body({ search, user }: { search: StSearch; user: string }) {
  const nav = useNavigate(); const ver = useStoreVersion(); const ar = useLang() === "ar";
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const apply = useCallback((next: Search) => void nav({ to: "/pro/statements", search: ((prev: StSearch) => ({ ...prev, ...next })) as never, replace: true }), [nav]);
  const report: Statement = (STATEMENTS as readonly string[]).includes(search.report ?? "") ? (search.report as Statement) : "Profit and Loss Statement";
  const ctx = financeContext(search.company, user);
  const source = sourceStatus("GL Entry", user);
  const f = useMemo(() => {
    const d = runnerDefaults(report); d["company"] = ctx.company || d["company"] || "";
    if (search.from_date) d["from_date"] = search.from_date; if (search.to_date) d["to_date"] = search.to_date;
    if (search.periodicity) d["periodicity"] = search.periodicity;
    // RXP-02 dimension scope: the native statement runners apply finance-book and dimension filters (with tree descendants)
    for (const k of ["finance_book", "cost_center", "project"] as const) if (search[k]) d[k] = search[k]!;
    return d;
  }, [search, ctx.company, report]);
  const guarded = useMemo(() => guardedReport(report, f, user), [f, user, report, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = source !== "ok" ? source : guarded.status;
  const res = guarded.result;
  if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
  if (!res) return <SourceState status={st === "ok" ? "empty" : st} doctype="GL Entry" />;
  const set = (p: Partial<StSearch>) => void nav({ to: "/pro/statements", search: (prev: StSearch) => ({ ...prev, ...p }) as never, replace: true });
  const key = res.columns[0]!.fieldname; const nums = res.columns.slice(1);
  const rows = foldRows(res.rows, key, collapsed);
  const money = (v: unknown) => (v === undefined || v === null || v === "" ? "" : fmtCurrency(Number(v), ctx.currency));
  const toggle = (a: string) => setCollapsed((s) => { const x = new Set(s); x.has(a) ? x.delete(a) : x.add(a); return x; });
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const books = scopedList("Finance Book", user).map((b) => b.name).sort();
  const centers = scopedList("Cost Center", user).filter((c) => c["company"] === ctx.company).map((c) => ({ v: c.name, group: !!Number(c["is_group"]) })).sort((a, b) => a.v.localeCompare(b.v));
  const projects = scopedList("Project", user).filter((p) => !p["company"] || p["company"] === ctx.company).map((p) => ({ v: p.name, label: String(p["project_name"] || p.name) })).sort((a, b) => a.label.localeCompare(b.label));
  const scoped = !!(f["finance_book"] || f["cost_center"] || f["project"]);
  const exporter = { doctype: "GL Entry", filename: `${report}-${f["company"]}`, build: () => ({ columns: res.columns, rows: res.rows as Record<string, unknown>[] }) };
  return <>
    <nav className="flex flex-wrap gap-2" data-dp-statement={report}>
      {STATEMENTS.map((s) => <button key={s} onClick={() => { setCollapsed(new Set()); set({ report: s }); }} className={s === report ? "btn-primary py-1 text-sm" : "btn-ghost py-1 text-sm"} aria-pressed={s === report} data-dp-st-tab={s}>{s}</button>)}
    </nav>
    <section className="dp-context mt-3" data-dp-context>
      <label className="dp-ctx-item"><span>Company</span>
        <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="dp-ctx-item"><span>From Date</span><DateInput className="field-input" value={f["from_date"] ?? ""} onChange={(e) => set({ from_date: e.target.value || undefined })} /></label>
      <label className="dp-ctx-item"><span>To Date</span><DateInput className="field-input" value={f["to_date"] ?? ""} onChange={(e) => set({ to_date: e.target.value || undefined })} /></label>
      <label className="dp-ctx-item"><span>Periodicity</span>
        <select className="field-input" value={f["periodicity"] ?? "Yearly"} onChange={(e) => set({ periodicity: e.target.value })}>{PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
      {books.length > 0 && <label className="dp-ctx-item"><span>{t("Finance Book", "الدفتر المالي")}</span><select className="field-input" value={f["finance_book"] ?? ""} onChange={(e) => set({ finance_book: e.target.value || undefined })} data-dp-st-book><option value="">{t("Default book", "الدفتر الافتراضي")}</option>{books.map((b) => <option key={b} value={b} data-no-i18n>{b}</option>)}</select></label>}
      <label className="dp-ctx-item"><span>{t("Cost Center", "مركز التكلفة")}</span><select className="field-input max-w-[14rem]" value={f["cost_center"] ?? ""} onChange={(e) => set({ cost_center: e.target.value || undefined })} data-dp-st-cost-center><option value="">{t("All", "الكل")}</option>{centers.map((c) => <option key={c.v} value={c.v} data-no-i18n>{c.group ? `${c.v} ▸` : c.v}</option>)}</select></label>
      {projects.length > 0 && <label className="dp-ctx-item"><span>{t("Project", "المشروع")}</span><select className="field-input max-w-[14rem]" value={f["project"] ?? ""} onChange={(e) => set({ project: e.target.value || undefined })} data-dp-st-project><option value="">{t("All", "الكل")}</option>{projects.map((p) => <option key={p.v} value={p.v} data-no-i18n>{p.label}</option>)}</select></label>}
    </section>
    {scoped && <p className="mt-2 text-xs text-muted-foreground" data-dp-st-scoped>{t("Scoped statement: only ledger rows carrying the selected book or dimension (including child cost centers) are included, so balance checks may not apply to a partial scope.", "قائمة محددة النطاق: تُحتسب فقط قيود الأستاذ التي تحمل الدفتر أو البعد المحدد (مع مراكز التكلفة الفرعية)، لذا قد لا تنطبق فحوص التوازن على نطاق جزئي.")}</p>}
    <ViewToolbar spec={STATEMENTS_SPEC} search={search as Search} companies={ctx.companies} onApply={apply} exporter={exporter} />

    {!!res.summary?.length && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {res.summary.map((s) => <div key={s.label} className="ek-kpi-tile py-2"><div className="text-xs text-muted-foreground">{s.label}</div><div className="text-lg font-semibold tabular-nums" data-no-i18n>{money(s.value)}</div></div>)}
    </div>}

    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      {(res.checks ?? []).map((c) => <span key={c.label} className={`chip ${c.ok ? "bg-success/15 text-success-text" : "bg-destructive/15"}`} data-dp-st-check={c.ok ? "ok" : "fail"}>{c.label}</span>)}
      <div className="ms-auto flex gap-2">
        {key === "account" && <button className="btn-ghost py-0.5 text-xs" onClick={() => setCollapsed(new Set())}>Expand all</button>}
        <Link to="/report/$name" params={{ name: report }} className="btn-ghost py-0.5 text-xs">Standard report</Link>
      </div>
    </div>

    <div className="dp-card mt-3 overflow-x-auto p-0">
      <table className="w-full text-sm" style={{ minWidth: `${320 + nums.length * 130}px` }} data-dp-st-rows={rows.length}>
        <thead><tr className="border-b border-border text-xs text-muted-foreground">
          <th className="p-2 text-start">{res.columns[0]!.label}</th>{nums.map((c) => <th key={c.fieldname} className="whitespace-nowrap p-2 text-end">{periodLabel(c.label, ar)}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => { const a = String(r[key] ?? ""); const g = r["is_group"] === 1; const leafAcc = key === "account" && !g && !r.is_total; return (
            <tr key={`${a}-${i}`} className={`border-b border-border/60 ${r.bold || g ? "font-semibold" : ""} ${r.is_total ? "bg-muted/40" : ""}`} data-dp-st-row={a}>
              <td className="p-2" style={{ paddingInlineStart: `${0.5 + Number(r.indent ?? 0) * 1.1}rem` }}>
                {g && <button className="me-1 w-4 text-muted-foreground" onClick={() => toggle(a)} aria-label="Toggle">{collapsed.has(a) ? "▸" : "▾"}</button>}
                {leafAcc ? <Link to="/pro/general-ledger" search={{ company: ctx.company, account: a, from_date: f["from_date"], to_date: f["to_date"], finance_book: f["finance_book"] || undefined, cost_center: f["cost_center"] || undefined, project: f["project"] || undefined, from: "statements" } as never} className="hover:underline" data-no-i18n>{a}</Link>
                  : key === "account" && !r.is_total ? <span data-no-i18n>{a}</span> : <span>{a}</span>}
              </td>
              {nums.map((c) => <td key={c.fieldname} className="whitespace-nowrap p-2 text-end tabular-nums" data-no-i18n>{money(r[c.fieldname])}</td>)}
            </tr>); })}
        </tbody>
      </table>
    </div>
  </>;
}
