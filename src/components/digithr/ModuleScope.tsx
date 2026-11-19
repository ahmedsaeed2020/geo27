/** Shared module-home scope (company + optional period) kept in the URL, plus KPI values that drill to the same metric population. */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { MetricContext } from "@/lib/metrics";
import { hrMetric, metricId } from "@/plugins/digit_hr/hrMetrics";
import { MetricLink, commandScope } from "./MetricLink";
import { NotEvaluated, SourceMark, arLabel, type Sources } from "./workspaces/shared";
import { DateInput } from "@/components/form/DateInput";

type Tx = (ar: string, en: string) => string;
const str = (v: unknown) => (v == null ? "" : String(v));

export type ModuleScope = {
  company: string; from: string; to: string; companies: string[];
  /** false when the URL names a company outside the reader's permitted employees — nothing is shown, never all companies */
  companyKnown: boolean;
  /** metric context for point-in-time counts (company only) and for period flows (company + from/to) */
  coCtx: MetricContext; periodCtx: MetricContext;
  set(patch: Partial<{ company: string; from: string; to: string }>, opts?: { replace?: boolean }): void;
  /** rows of a source restricted to the scoped company (employee-linked rows fall back to the employee's company) */
  filter<T>(rows: T[]): T[];
};

export function useModuleScope(src: Sources): ModuleScope {
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const navigate = useNavigate();
  const v = commandScope(search);
  const emps = src.rows("Employee");
  const companies = [...new Set(emps.map((e) => str(e.company)).filter(Boolean))].sort();
  const company = v.company ?? "", from = v.from ?? "", to = v.to ?? "";
  const companyKnown = !company || !src.ready("Employee") || companies.includes(company);
  const companyOf = new Map(emps.map((e) => [str(e.name), str(e.company)]));
  const set = (patch: Partial<{ company: string; from: string; to: string }>, opts: { replace?: boolean } = {}) => void navigate({
    to: ".", replace: !!opts.replace,
    search: (prev) => {
      const next = { ...prev, ...patch };
      for (const k of ["company", "from", "to"] as const) if (!next[k]) delete next[k];
      return next;
    },
  });
  return {
    company, from, to, companies, companyKnown,
    coCtx: company ? { company } : {},
    periodCtx: { ...(company ? { company } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) },
    set,
    filter: <T,>(rows: T[]): T[] => (!companyKnown ? [] : !company ? rows : rows.filter((r) => { const o = r as Record<string, unknown>; return (str(o["company"]) || companyOf.get(str(o["employee"])) || "") === company; })),
  };
}

/** Company (and optional period) selector. A company outside the permitted set shows an explicit denial, never a widened population. */
export function ScopeBar({ scope, tx, period, children }: { scope: ModuleScope; tx: Tx; period?: boolean; children?: ReactNode }) {
  const opts = scope.company && !scope.companies.includes(scope.company) ? [...scope.companies, scope.company] : scope.companies;
  return (
    <section className="dhr-card flex flex-wrap items-end gap-3 rounded-[14px] p-3" data-module-scope={[scope.company, scope.from, scope.to].join("|")}>
      <label className="text-sm">{tx("الشركة", "Company")}
        <select aria-label={tx("شركة مساحة العمل", "Workspace company")} className="field-input mt-1 block w-64 max-w-full" value={scope.company} onChange={(e) => scope.set({ company: e.target.value })}>
          <option value="">{tx("كل الشركات المتاحة لك", "All companies you may see")}</option>
          {opts.map((c) => <option key={c} value={c} data-no-i18n>{tx(arLabel(c), c)}</option>)}
        </select>
      </label>
      {period && (["from", "to"] as const).map((k) => (
        <label key={k} className="text-sm">{k === "from" ? tx("من", "From") : tx("إلى", "To")}
          <DateInput aria-label={k === "from" ? tx("بداية الفترة", "Period start") : tx("نهاية الفترة", "Period end")} className="field-input mt-1 block" value={scope[k]} onChange={(e) => scope.set({ [k]: e.target.value })} data-no-i18n />
        </label>
      ))}
      {children}
      {(scope.company || (period && (scope.from || scope.to))) && <Button type="button" variant="outline" className="min-h-10" onClick={() => scope.set({ company: "", ...(period ? { from: "", to: "" } : {}) })}>{tx("مسح النطاق", "Clear scope")}</Button>}
      {!scope.companyKnown && <p role="alert" data-scope-denied className="dhr-alert w-full text-sm">{tx("الشركة المحددة خارج نطاق صلاحياتك؛ لا تُعرض أي سجلات بدلًا من عرض كل الشركات.", "The selected company is outside your permitted scope; no records are shown instead of widening to all companies.")}</p>}
    </section>
  );
}

/**
 * KPI number from the HR metric engine, linked to the metric drill with the same company (and period when `period`).
 * Loading/denied/unavailable sources render a state mark; a population the reader cannot infer renders NOT_EVALUATED.
 */
export function MetricValue({ label, scope, src, tx, back, period = false, deps = [] }: { label: string; scope?: ModuleScope | undefined; src: Sources; tx: Tx; back: string; period?: boolean; deps?: string[] }) {
  if (scope && !scope.companyKnown) return <SourceMark read={{ state: "DENIED" }} tx={tx} />;
  const w = deps.length ? src.worst(...deps) : undefined;
  if (w) return <SourceMark read={w} tx={tx} />;
  const m = hrMetric(label, !scope ? {} : period ? scope.periodCtx : scope.coCtx);
  const body = m.value !== null ? m.value
    : m.notEvaluated ? <NotEvaluated tx={tx} why={["غير مُقيّم: يتطلب سجلات خارج نطاقك.", "Not evaluated: needs records outside your scope."]} />
    : <SourceMark read={{ state: m.sources.some((x) => x.result.scope.denied) ? "DENIED" : "SOURCE_UNAVAILABLE" }} tx={tx} />;
  return <MetricLink label={label} back={back} period={period} className="hover:underline"><span data-kpi-value={metricId(label)}>{body}</span></MetricLink>;
}
