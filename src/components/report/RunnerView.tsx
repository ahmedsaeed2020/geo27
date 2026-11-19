import { currentUser, filterReportRows, useSessionUser } from "@/lib/session";
import { useEffect, useMemo, useState } from "react";
import { RUNNERS, runnerDefaults, type F, type RCol, type Row } from "@/lib/reportRunner";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { useSessionDefaultsVersion } from "@/lib/sessionDefaults";
import { reportCellTarget } from "@/lib/reportLinks";
import { ReportDocLink, ReportPreviewScope } from "./DocPreview";
import { DateInput } from "@/components/form/DateInput";
import { useLang } from "@/i18n";
import { SavedCriteria } from "./SavedCriteria";
import { defaultCriteria } from "@/lib/coreShared/reportCriteria";

const fmt = (v: unknown, t: string) => {
  if (v === undefined || v === null || v === "") return "";
  if (t === "Currency") return Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (t === "Float") return String(Math.round(Number(v) * 1000) / 1000);
  // visual round R3: one decimal for every rate
  if (t === "Percent") return `${Number(v).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return String(v);
};
const NUM = new Set(["Currency", "Float", "Int", "Percent"]);
const exists = (dt: string, name: string) => !!adapter.get(dt, name);

/**
 * Filters the user changed are kept per tab, user and report (return context after "Open in full page" + Back) and are
 * never replaced by re-resolved defaults; untouched filters follow the current Session Defaults (frappe.query_report
 * get_user_default filters).
 */
const touchedKey = (name: string) => `digit-virtual-core:report-filters:${currentUser()}:${name}`;
function readTouched(name: string): F {
  if (typeof window === "undefined") return {};
  try { const v = JSON.parse(sessionStorage.getItem(touchedKey(name)) ?? "{}"); return v && typeof v === "object" ? (v as F) : {}; } catch { return {}; }
}

/** Script Report rendered from a local port of the source execute() (src/lib/reportRunner.ts). */
export function RunnerView({ name }: { name: string }) {
  const ver = useStoreVersion();
  const rn = RUNNERS[name]!;
  const user = useSessionUser();
  const sdv = useSessionDefaultsVersion();
  const [touched, setTouched] = useState<F>({});
  // a user's "open with these" saved criteria fill the filters when nothing was changed in this tab (R1-b)
  useEffect(() => { const t = readTouched(name); setTouched(Object.keys(t).length ? t : defaultCriteria(name, user) ?? {}); }, [name, user]);
  const defs = useMemo(() => runnerDefaults(name), [name, user, sdv]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = useMemo(() => ({ ...defs, ...touched }), [defs, touched]);
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  // user permissions apply to report rows (frappe reportview/query_report permission match conditions)
  const res = useMemo(() => {
    const r = rn.run(f); const all = r.rows as Record<string, unknown>[]; const kept = filterReportRows(all);
    if (kept.length === all.length) return r;
    // restricted user: recompute the total row from permitted rows; ledger-wide checks are not shown
    const body = kept.filter((x) => !x["is_total"]);
    const rows = kept.map((x) => (x["is_total"] ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === "number" ? Math.round(body.reduce((a, b) => a + (typeof b[k] === "number" ? (b[k] as number) : 0), 0) * 100) / 100 : v])) : x));
    return { ...r, rows: rows as typeof r.rows, checks: undefined };
  }, [rn, f, ver, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const ms = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
  // SH-027 freshness: when these figures were computed from the records (recomputed on every filter or record change)
  const ar = useLang() === "ar";
  const generated = useMemo(() => new Date(), [res]); // eslint-disable-line react-hooks/exhaustive-deps
  const hhmm = generated.toLocaleTimeString(ar ? "ar-SA-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const set = (k: string, v: string) => {
    const next = { ...touched, [k]: v };
    setTouched(next);
    try { sessionStorage.setItem(touchedKey(name), JSON.stringify(next)); } catch { /* storage full / disabled */ }
  };
  const applyAll = (next: F) => { setTouched(next); try { sessionStorage.setItem(touchedKey(name), JSON.stringify(next)); } catch { /* storage full / disabled */ } };
  const linkCols = res.columns.filter((c) => c.fieldtype === "Link" || c.fieldtype === "Dynamic Link");
  // DocTypes whose permissions the link cells evaluate (Link options + Dynamic Link discriminator values)
  const doctypes = useMemo(() => [...new Set(linkCols.flatMap((c) => (c.fieldtype === "Link" ? [c.options ?? ""] : res.rows.map((r) => String(r[c.options ?? ""] ?? "")))).filter(Boolean))], [res]); // eslint-disable-line react-hooks/exhaustive-deps
  // display only (visual round R3 §3.8): department names without the company suffix, a blank department as «بدون قسم»,
  // inline data bars in rate and amount columns, colour only past a limit the report took from a setting
  const barMax = useMemo(() => Object.fromEntries(res.columns.filter((c) => c.fieldtype === "Percent" || c.fieldtype === "Currency").map((c) => [c.fieldname, Math.max(0, ...res.rows.filter((r) => !r.is_total && !r["is_group"]).map((r) => Math.abs(Number(r[c.fieldname]) || 0)))])), [res]);
  const cell = (r: Row, c: RCol) => {
    let text = fmt(r[c.fieldname], c.fieldtype);
    if (c.fieldtype === "Link" && c.options === "Department" && !r.is_total) text = text ? text.replace(/\s+-\s+[A-Z0-9]{2,6}$/, "") : ar ? "بدون قسم" : "No department";
    const t = c.fieldtype === "Link" || c.fieldtype === "Dynamic Link" ? reportCellTarget(c, r, exists) : null;
    const node = t ? <ReportDocLink doctype={t.doctype} name={t.name}>{text}</ReportDocLink> : text;
    const v = Number(r[c.fieldname]); const max = barMax[c.fieldname];
    if (max && !r.is_total && !r["is_group"] && r[c.fieldname] !== "" && r[c.fieldname] != null && Number.isFinite(v)) {
      const over = c.alertAbove !== undefined && v > c.alertAbove;
      return <span className="r3-bar" {...(over ? { "data-over": "", title: ar ? `فوق الحد ${c.alertAbove}%` : `Above the ${c.alertAbove}% limit` } : {})}><i style={{ width: `${Math.min(100, (Math.abs(v) / max) * 100)}%` }} /><span>{node}</span></span>;
    }
    return node;
  };
  return (
    <div data-report-runner={name}>
      <div className="mt-4 flex flex-wrap gap-3">
        {rn.filters.map((x) => (
          <div key={x.fieldname} className="w-44">
            <label className="mb-0.5 block text-[11px] text-muted-foreground">{x.label}</label>
            {x.fieldtype === "Select" && Array.isArray(x.options) ? (
              <select className="field-input" data-filter={x.fieldname} value={f[x.fieldname] ?? ""} onChange={(e) => set(x.fieldname, e.target.value)}>{x.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            ) : x.fieldtype === "Check" ? <input type="checkbox" data-filter={x.fieldname} checked={f[x.fieldname] === "1"} onChange={(e) => set(x.fieldname, e.target.checked ? "1" : "")} />
            : x.fieldtype === "Date" ? <DateInput className="field-input" data-filter={x.fieldname} data-touched={x.fieldname in touched ? "1" : undefined} value={f[x.fieldname] ?? ""} onChange={(e) => set(x.fieldname, e.target.value)} />
            : <input className="field-input" data-filter={x.fieldname} data-touched={x.fieldname in touched ? "1" : undefined} data-no-i18n type="text" value={f[x.fieldname] ?? ""} onChange={(e) => set(x.fieldname, e.target.value)} />}
          </div>
        ))}
      </div>
      <SavedCriteria report={name} filters={Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v ?? "")]))} onApply={(c) => applyAll(c as F)} />
      {res.summary && (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {res.summary.map((s) => <div key={s.label} className="panel p-3" data-summary={s.label}><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-lg font-semibold" data-no-i18n>{fmt(s.value, "Currency")}</p></div>)}
        </div>
      )}
      {res.checks && (
        <ul className="mt-3 space-y-1 text-xs">
          {res.checks.map((c) => <li key={c.label} data-check={c.ok ? "pass" : "fail"} className={c.ok ? "text-success" : "text-destructive"}>{c.ok ? "✓" : "✗"} <span>{c.label}</span> <span data-no-i18n>({c.detail})</span></li>)}
        </ul>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-report-freshness={generated.toISOString()}>
        <span className="chip bg-muted">{ar ? "محدّث الآن" : "Up to date"}</span>
        <span>{ar ? "احتُسب في" : "Computed at"} <bdi dir="ltr" data-no-i18n>{hhmm}</bdi> {ar ? "من السجلات المرحّلة" : "from the posted records"} · <bdi data-no-i18n>{res.rows.filter((r) => !r.is_total).length}</bdi> {ar ? "صفًا" : "rows"}</span>
      </p>
      <div className="mt-3">
        <ReportPreviewScope doctypes={doctypes}>
          <div className="panel overflow-x-auto">
            <table className="r3-table w-full text-sm" data-report-rows={res.rows.length}>
              <thead className="bg-muted text-xs text-muted-foreground"><tr>{res.columns.map((c) => <th key={c.fieldname} className={`px-3 py-2 ${NUM.has(c.fieldtype) ? "text-end" : "text-start"}`} style={{ minWidth: c.width }}>{c.label}</th>)}</tr></thead>
              <tbody>
                {res.rows.map((r: Row, i) => (
                  <tr key={i} className={`border-t border-border ${r.is_total ? "bg-muted/50 font-semibold" : r.bold ? "font-semibold" : ""}`} data-total-row={r.is_total ? "1" : undefined} {...(r.is_total ? { "data-total": "" } : {})} data-group-row={r["is_group"] ? "1" : undefined}>
                    {res.columns.map((c, ci) => (
                      <td key={c.fieldname} data-no-i18n={!r.is_total && !r.bold ? "" : undefined} data-col={c.fieldname} className={`px-3 py-1.5 ${NUM.has(c.fieldtype) ? "text-end tabular-nums" : ""}`} style={ci === 0 && r.indent ? { paddingInlineStart: `${12 + r.indent * 18}px` } : undefined}>{cell(r, c)}</td>
                    ))}
                  </tr>
                ))}
                {!res.rows.length && <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={res.columns.length}>Nothing to show</td></tr>}
              </tbody>
            </table>
          </div>
        </ReportPreviewScope>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground"><span>Local port of</span> <span data-no-i18n>{rn.src}</span> <span>over the synthetic records — not the DIGIT server.</span> <span>Execution Time</span>: <span data-no-i18n>{ms} ms</span></p>
    </div>
  );
}
