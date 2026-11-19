/** Native report engine shared by /report/$name and pages that embed a native report (e.g. Pro General Ledger), so one runner, filter set and table serve both. */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { indexQuery, loadMeta, reportsQuery, type DocTypeMeta } from "@/lib/catalog";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { matchFilter } from "@/lib/desk";
import { SplitReport } from "@/components/report/SplitReport";
import { useLang } from "@/i18n";
import { ReportWorkbench, type WorkbenchReport, type WorkbenchResult } from "@/components/report/ReportWorkbench";
import { RUNNERS, runnerDefaults, type F } from "@/lib/reportRunner";
import { filterDefaultFromExpr, useSessionDefaultsVersion } from "@/lib/sessionDefaults";
import { currentUser, filterReadable, filterReportRows, hasPerm, useSessionUser } from "@/lib/session";
import { reportSpecsQuery, specDefault, multiValues, workbenchFilters } from "@/lib/reportSpecs";
import { customReportJson, type WbColumn } from "@/lib/reportWorkbench";
import { useHydrated } from "@/components/hrms/HrShell";
import { DevOnly } from "@/components/DevOnly";
import { formatValue } from "@/lib/format";
import { glPartyFilters } from "@/lib/generalLedger";

export type NativeSeed = { key: string; values: F };

/** Filters the user changed are kept per tab, user and report (return context) and never replaced by re-resolved defaults. */
const touchedKey = (name: string) => `digit-virtual-core:report-filters:${currentUser()}:${name}`;
function readTouched(name: string): F {
  if (typeof window === "undefined") return {};
  try { const v = JSON.parse(sessionStorage.getItem(touchedKey(name)) ?? "{}"); return v && typeof v === "object" ? (v as F) : {}; } catch { return {}; }
}
const routeOptions = (s?: string): F => { if (!s) return {}; try { const v = JSON.parse(s) as unknown; return v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, Array.isArray(x) ? JSON.stringify(x) : String(x ?? "")])) : {}; } catch { return {}; } };

export function useNativeReport(name: string, routeFilters?: string, seed?: NativeSeed) {
  const hydrated = useHydrated();
  const reps = useQuery(reportsQuery);
  const idx = useQuery(indexQuery);
  const specs = useQuery(reportSpecsQuery);
  const ver = useStoreVersion(); const user = useSessionUser(); const sdv = useSessionDefaultsVersion();
  const [touched, setTouched] = useState<F>({});
  const [ref, setRef] = useState<DocTypeMeta | null>(null);
  const [nonce, setNonce] = useState(0);
  // Custom Report (save_report): its own Report record over the reference report
  const custom = hydrated ? adapter.get("Report", name) : undefined;
  const cj = customReportJson(custom);
  const baseName = cj && custom?.["reference_report"] ? String(custom["reference_report"]) : name;
  const entry = reps.data?.find((x) => x.name === baseName);
  const spec = specs.data?.reports[baseName];
  const runner = RUNNERS[baseName];
  useEffect(() => {
    let t: F = { ...routeOptions(routeFilters), ...readTouched(name) };
    // an embedding page's deep link (seed) applies once per history entry, so Back keeps the filters the user changed afterwards
    if (seed && Object.keys(seed.values).length) {
      const k = `${touchedKey(name)}:seed`; let last = "";
      try { last = sessionStorage.getItem(k) ?? ""; } catch { /* storage disabled */ }
      if (last !== seed.key) { t = { ...t, ...seed.values }; try { sessionStorage.setItem(k, seed.key); sessionStorage.setItem(touchedKey(name), JSON.stringify(t)); } catch { /* storage disabled */ } }
    }
    setTouched(t);
  }, [name, user, routeFilters, seed?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const refDt = spec?.ref_doctype ?? entry?.ref_doctype ?? (custom?.["ref_doctype"] as string | undefined) ?? null;
  useEffect(() => { setRef(null); if (idx.data && refDt) loadMeta(idx.data, refDt).then((m) => { if (m) { adapter.ensureSeed(m); setRef(m); } }); }, [idx.data, refDt]);
  const filters = useMemo(() => workbenchFilters(spec, entry, runner?.filters), [spec, entry, runner, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const defaults = useMemo(() => {
    if (!hydrated) return {} as F;
    const rd = runner ? runnerDefaults(baseName) : {};
    const out: F = {};
    for (const f of filters) {
      if (!f.fieldname || f.fieldtype === "Break") continue;
      const sd = spec ? specDefault(f) : filterDefaultFromExpr((entry?.filters.find((x) => x.fieldname === f.fieldname) as { default_expr?: string } | undefined)?.default_expr) ?? "";
      const v = sd || rd[f.fieldname] || "";
      out[f.fieldname] = f.single && v.startsWith("[") ? JSON.stringify(multiValues(v).slice(0, 1)) : v;
    }
    return out;
  }, [hydrated, filters, spec, entry, runner, baseName, user, sdv]); // eslint-disable-line react-hooks/exhaustive-deps
  const values: F = { ...defaults, ...(cj?.filters ?? {}), ...touched };
  const set = (k: string, v: string) => {
    const next = { ...touched, [k]: v };
    // source on_change: Party Type clears Party; Voucher No sets Categorize by Voucher (Consolidated)
    if (baseName === "General Ledger" && k === "party_type") next["party"] = "";
    if (baseName === "General Ledger" && k === "voucher_no" && v) next["categorize_by"] = "Categorize by Voucher (Consolidated)";
    if (baseName === "General Ledger" && (k === "party" || k === "party_type")) Object.assign(next, glPartyFilters(next["party_type"] ?? values["party_type"], next["party"] ?? values["party"]));
    setTouched(next);
    try { sessionStorage.setItem(touchedKey(name), JSON.stringify(next)); } catch { /* storage disabled */ }
  };
  /** Several filters at once (quick periods, tabs, saved views of an embedding page). */
  const setMany = (patch: F) => {
    const next = { ...touched, ...patch };
    setTouched(next);
    try { sessionStorage.setItem(touchedKey(name), JSON.stringify(next)); } catch { /* storage disabled */ }
  };

  // ----- result -----
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const runnerOut = useMemo(() => {
    if (!hydrated || !runner) return null;
    const rv: F = Object.fromEntries(Object.entries(values).map(([k, v]) => { const f = filters.find((x) => x.fieldname === k); return [k, f?.single ? multiValues(v)[0] ?? "" : v]; }));
    return runner.run(rv);
  }, [hydrated, runner, JSON.stringify(values), filters, ver, user, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const result: WorkbenchResult | null = useMemo(() => {
    if (!hydrated) return null;
    if (runner && runnerOut) {
      const r = runnerOut;
      const all = r.rows as Record<string, unknown>[]; const kept = filterReportRows(all);
      // restricted user: the totals are recomputed from permitted rows (frappe report permission match conditions)
      const rows = kept.length === all.length ? all : kept.map((x) => (x["is_total"] ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === "number" ? Math.round(kept.filter((b) => !b["is_total"]).reduce((a, b) => a + (typeof b[k] === "number" ? (b[k] as number) : 0), 0) * 100) / 100 : v])) : x));
      return { columns: r.columns as WbColumn[], rows, error: r.error };
    }
    if ((entry?.report_type === "Report Builder" || custom?.["report_type"] === "Report Builder") && ref) {
      const json = (() => { try { return JSON.parse(String(entry?.json ?? custom?.["json"] ?? "{}")) as { columns?: [string, string][]; filters?: [string, string, string, unknown][] }; } catch { return {}; } })();
      const colNames = json.columns?.map((c) => c[0]).filter(Boolean) ?? ref.fields.filter((f) => f.in_list_view).map((f) => f.fieldname!);
      const columns: WbColumn[] = [{ fieldname: "name", label: "ID", fieldtype: "Link", options: ref.name }, ...colNames.flatMap((c) => { const f = ref.fields.find((x) => x.fieldname === c); return f ? [{ fieldname: c, label: f.label ?? c, fieldtype: f.fieldtype === "Link" || f.fieldtype === "Dynamic Link" ? f.fieldtype : f.fieldtype, options: f.options }] : []; })];
      const saved = (json.filters ?? []).map((x) => [x[1], x[2], x[3]] as [string, string, unknown]);
      const rows = filterReadable(ref, adapter.list(ref.name)).filter((d) => saved.every((sf) => matchFilter(d, sf)) && Object.entries(values).every(([k, v]) => !v || !(k in d) || matchFilter(d, [k, "like", v])));
      return { columns, rows };
    }
    return null;
  }, [hydrated, runner, runnerOut, JSON.stringify(values), entry, custom, ref, ver, user, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const execMs = (typeof performance !== "undefined" ? performance.now() : 0) - t0;

  const state: "loading" | "missing" | "denied" | "ok" = !reps.data || !hydrated ? "loading" : !entry && !custom ? "missing" : ref && !hasPerm(ref, "read") ? "denied" : "ok";
  const module = spec?.module ?? entry?.module ?? String(custom?.["module"] ?? "");
  const report: WorkbenchReport = {
    name, title: String(custom?.["report_name"] ?? name), base: baseName, module, app: entry?.app ?? "frappe", refDoctype: refDt,
    reportType: custom ? String(custom["report_type"]) : entry?.report_type ?? "Script Report", isCustom: !!cj, isStandard: !custom || custom["is_standard"] === "Yes",
    source: entry?.source, calculation: runner ? `local port of ${runner.src}` : undefined, savedColumns: cj?.columns,
  };
  const refEntry = idx.data?.find((d) => d.name === refDt);
  const refRows = ref && !runner && entry?.report_type !== "Report Builder" ? filterReadable(ref, adapter.list(ref.name)) : [];
  const boundary = (
    <div className="space-y-3" data-report-boundary>
      <div className="rounded-lg border border-dashed border-border p-6 text-sm" data-server-required>
        <p className="font-medium">Results need the DIGIT server</p>
        <p className="mt-1 text-muted-foreground">{entry?.report_type === "Query Report" ? "This report runs a stored SQL query on the DIGIT server." : "Columns and rows are produced by the report's Python execute() on the DIGIT server."} <span>No rows, balances or totals are invented here.</span></p>
      </div>
      {ref && refRows.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground"><span>Records of</span> <span>{ref.name}</span> <span>(not the report result)</span>{refEntry && <> · <Link to="/app/$app/$doctype" params={{ app: refEntry.app, doctype: refEntry.slug }} className="text-primary hover:underline">{ref.name}</Link></>}</p>
          <SplitReport ref_={ref} rows={refRows} />
        </div>
      )}
    </div>
  );
  const extras = runnerOut ? <RunnerExtras r={runnerOut} /> : null;
  const detail = runner && runnerOut ? (runnerOut.rows as Record<string, unknown>[]).filter((x) => !x["is_total"]) : [];
  const hiddenRows = detail.length - (detail.length ? filterReportRows(detail).length : 0);
  return { state, name, refDt, report, spec, filters, values, set, setMany, result, runnerOut, boundary, extras, execMs, hiddenRows, detailCount: detail.length, runner: !!runner, baseName, user, refresh: () => setNonce((n) => n + 1) };
}
export type NativeReport = ReturnType<typeof useNativeReport>;

/** The native report screen body (filters, result table, actions); `embedded` swaps the page band for a card header inside another page. */
export function NativeReportBody({ r, embedded }: { r: NativeReport; embedded?: boolean | undefined }) {
  return (
      <div data-report-runner={r.runner ? r.baseName : undefined}>
        {r.hiddenRows > 0 && <RestrictedNote hidden={r.hiddenRows} total={r.detailCount} />}
        <ReportWorkbench key={`${r.name}:${r.user}`} report={r.report} spec={r.spec} filters={r.filters} values={r.values} onChange={r.set} result={r.result} boundary={r.boundary} execMs={r.execMs} extras={r.extras} onRefresh={r.refresh} addTotalRow={!!r.spec?.add_total_row} embedded={embedded} />
      </div>
  );
}

/** Preview diagnostics of a local runner (summary cards, reconciliation checks) — Developer Mode only, as Frappe shows none. */
function RunnerExtras({ r }: { r: { summary?: { label: string; value: number }[] | undefined; checks?: { label: string; ok: boolean; detail: string }[] | undefined } }) {
  if (!r.summary && !r.checks) return null;
  return (
    <DevOnly>
      {r.summary && <div className="mt-3 grid gap-3 sm:grid-cols-4">{r.summary.map((s) => <div key={s.label} className="panel p-3" data-summary={s.label}><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-lg font-semibold" data-no-i18n>{formatValue("Currency", s.value)}</p></div>)}</div>}
      {r.checks && <ul className="mt-2 space-y-1 text-xs">{r.checks.map((c) => <li key={c.label} data-check={c.ok ? "pass" : "fail"} className={c.ok ? "text-success" : "text-destructive"}>{c.ok ? "✓" : "✗"} <span>{c.label}</span> <span data-no-i18n>({c.detail})</span></li>)}</ul>}
    </DevOnly>
  );
}

/** Run11.1 B6-R2: a restricted user is told the report covers only permitted rows, so totals are never mistaken for the company figure. */
function RestrictedNote({ hidden, total }: { hidden: number; total: number }) {
  const ar = useLang() === "ar";
  return <p className="ent-frame mb-2 px-3 py-2 text-sm" role="status" data-report-restricted={hidden} data-report-total={total}>
    {ar ? <>عرض مقيّد: <bdi data-no-i18n>{hidden}</bdi> من <bdi data-no-i18n>{total}</bdi> صفاً مخفية بحسب صلاحياتك، لذا تشمل الإجماليات الصفوف المسموح لك بها فقط.</>
      : <>Restricted view: <bdi data-no-i18n>{hidden}</bdi> of <bdi data-no-i18n>{total}</bdi> rows are hidden by your permissions, so totals cover only the rows you may see.</>}
  </p>;
}
