// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/** SC-F-11 Trial Balance — Core Trial Balance runner with collapsible hierarchy, URL filters, balance checks and General Ledger drill-down. */
import { Link, useNavigate } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { useCallback, useMemo, useState } from "react";
import { useStoreVersion } from "@/lib/adapter";
import { fmtCurrency } from "@/lib/format";
import { runnerDefaults } from "@/lib/reportRunner";
import { financeContext, sourceStatus } from "./finance";
import { ViewToolbar } from "./ViewToolbar";
import { TB_SPEC } from "./viewSpecs";
import type { Search, ViewSearchKeys } from "./savedViews";
import { ProFrame, SourceState } from "./ProFrame";
import { guardedReport } from "./intelligence";
import { TB_KEYS, tbTotals, visibleRows } from "./trialBalance";
import { DateInput } from "@/components/form/DateInput";

export interface TbSearch extends ViewSearchKeys { company?: string | undefined; from_date?: string | undefined; to_date?: string | undefined; zero?: string | undefined; q?: string | undefined }
const LABELS: Record<(typeof TB_KEYS)[number], string> = { opening_debit: "Opening (Dr)", opening_credit: "Opening (Cr)", debit: "Debit", credit: "Credit", closing_debit: "Closing (Dr)", closing_credit: "Closing (Cr)" };

export function TrialBalancePro({ search }: { search: TbSearch }) {
  return <ProFrame title="Trial Balance" subtitle="Core Trial Balance report — same source, filters and totals, with readable hierarchy.">
    {({ user }) => <Body search={search} user={user} />}
  </ProFrame>;
}

function Body({ search, user }: { search: TbSearch; user: string }) {
  const nav = useNavigate();
  const ver = useStoreVersion();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const apply = useCallback((next: Search) => void nav({ to: "/pro/trial-balance", search: ((prev: TbSearch) => ({ ...prev, ...next })) as never, replace: true }), [nav]);
  const ctx = financeContext(search.company, user);
  const source = sourceStatus("GL Entry", user);
  const f = useMemo(() => {
    const d = runnerDefaults("Trial Balance");
    d["company"] = ctx.company || d["company"] || "";
    if (search.from_date) d["from_date"] = search.from_date;
    if (search.to_date) d["to_date"] = search.to_date;
    d["show_zero_values"] = search.zero === "1" ? "1" : "";
    return d;
  }, [search, ctx.company]);
  const guarded = useMemo(() => guardedReport("Trial Balance", f, user), [f, user, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = source !== "ok" ? source : guarded.status;
  const res = guarded.result;
  if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
  if (!res) return <SourceState status={st === "ok" ? "empty" : st} doctype="GL Entry" />;
  const set = (p: Partial<TbSearch>) => void nav({ to: "/pro/trial-balance", search: (prev: TbSearch) => ({ ...prev, ...p }) as never, replace: true });
  const rows = visibleRows(res.rows, collapsed, search.q ?? "");
  const t = tbTotals(res.rows);
  const money = (v: unknown) => (Number(v) ? fmtCurrency(Number(v), ctx.currency) : "");
  const toggle = (a: string) => setCollapsed((s) => { const x = new Set(s); x.has(a) ? x.delete(a) : x.add(a); return x; });
  const groups = res.rows.filter((r) => r["is_group"] === 1).map((r) => String(r["account"]));
  const exporter = { doctype: "GL Entry", filename: `trial-balance-${f["company"]}`, build: () => ({ columns: [{ fieldname: "account", label: "Account" }, ...TB_KEYS.map((k) => ({ fieldname: k, label: LABELS[k] }))], rows: res.rows as Record<string, unknown>[] }) };
  return <>
    <section className="dp-context" data-dp-context>
      <label className="dp-ctx-item"><span>Company</span>
        <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="dp-ctx-item"><span>From Date</span><DateInput className="field-input" value={f["from_date"] ?? ""} onChange={(e) => set({ from_date: e.target.value || undefined })} /></label>
      <label className="dp-ctx-item"><span>To Date</span><DateInput className="field-input" value={f["to_date"] ?? ""} onChange={(e) => set({ to_date: e.target.value || undefined })} /></label>
      <label className="dp-ctx-item"><span>Search</span><input className="field-input" value={search.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} data-dp-tb-search /></label>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={search.zero === "1"} onChange={(e) => set({ zero: e.target.checked ? "1" : undefined })} /> <span>Show zero values</span></label>
    </section>
    <ViewToolbar spec={TB_SPEC} search={search as Search} companies={ctx.companies} onApply={apply} exporter={exporter} />

    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className={`chip ${t.periodOk ? "bg-success/15 text-success-text" : "bg-destructive/15"}`} data-dp-tb-period={t.periodOk ? "ok" : "fail"}>{t.periodOk ? "Period debit equals credit" : "Period debit does not equal credit"}</span>
      <span className={`chip ${t.closingOk ? "bg-success/15 text-success-text" : "bg-destructive/15"}`} data-dp-tb-closing={t.closingOk ? "ok" : "fail"}>{t.closingOk ? "Closing balances agree" : "Closing balances do not agree"}</span>
      <div className="ms-auto flex gap-2">
        <button className="btn-ghost py-0.5 text-xs" onClick={() => setCollapsed(new Set())}>Expand all</button>
        <button className="btn-ghost py-0.5 text-xs" onClick={() => setCollapsed(new Set(groups.filter((g) => res.rows.find((r) => r["account"] === g)?.indent === 0)))}>Collapse all</button>
        <Link to="/report/$name" params={{ name: "Trial Balance" }} className="btn-ghost py-0.5 text-xs">Standard report</Link>
      </div>
    </div>

    <div className="dp-card mt-3 overflow-x-auto p-0">
      <EntTable id="pro-trial-balance" wrap><table className="w-full min-w-[820px] text-sm" data-dp-tb-rows={rows.length}>
        <thead><tr className="border-b border-border text-xs text-muted-foreground">
          <th className="p-2 text-start">Account</th>{TB_KEYS.map((k) => <th key={k} className="p-2 text-end">{LABELS[k]}</th>)}
        </tr></thead>
        <tbody>
          {!rows.length && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Nothing to show</td></tr>}
          {rows.map((r) => { const a = String(r["account"]); const g = r["is_group"] === 1; return (
            <tr key={a} className={`border-b border-border/60 ${g ? "font-semibold" : ""}`} data-dp-tb-account={a}>
              <td className="p-2" style={{ paddingInlineStart: `${0.5 + Number(r.indent ?? 0) * 1.1}rem` }}>
                {g && <button className="me-1 w-4 text-muted-foreground" onClick={() => toggle(a)} aria-label="Toggle">{collapsed.has(a) ? "▸" : "▾"}</button>}
                {g ? <span data-no-i18n>{a}</span>
                  : <Link to="/pro/general-ledger" search={{ company: ctx.company, account: a, from_date: f["from_date"], to_date: f["to_date"] } as never} className="hover:underline" data-no-i18n>{a}</Link>}
              </td>
              {TB_KEYS.map((k) => <td key={k} className="p-2 text-end tabular-nums whitespace-nowrap" data-no-i18n>{money(r[k])}</td>)}
            </tr>); })}
          <tr className="bg-muted/40 font-semibold" data-dp-tb-total><td className="p-2">Total</td>{TB_KEYS.map((k) => <td key={k} className="p-2 text-end tabular-nums whitespace-nowrap" data-no-i18n>{money(t[k])}</td>)}</tr>
        </tbody>
      </table></EntTable>
    </div>
  </>;
}
