import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { enabledPlugins, usePluginsVersion, logEvent } from "@/plugins/runtime";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { canReadType, scopedList, useScopeMetas } from "@/lib/scope";
import { filterReportRows } from "@/lib/session";
import { formatValue, NUMERIC } from "@/lib/format";
import { useHydrated } from "@/components/hrms/HrShell";
import { reportCellTarget } from "@/lib/reportLinks";
import { ReportDocLink, ReportPreviewScope } from "@/components/report/DocPreview";

type Search = { customer?: string | undefined };
export const Route = createFileRoute("/plugins/$name/report/$report")({
  validateSearch: (s: Record<string, unknown>): Search => (typeof s["customer"] === "string" ? { customer: s["customer"] } : {}),
  head: ({ params }) => ({ meta: [
    { title: `${params.report} — Report` },
    { name: "description", content: `${params.report} report from the ${params.name.replace(/_/g, " ")} app.` },
    { property: "og:title", content: `${params.report} — Report` },
    { property: "og:description", content: "Plugin report computed from local records." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PluginReportPage,
});

function PluginReportPage() {
  const { name, report } = Route.useParams(); const search = Route.useSearch();
  usePluginsVersion(); useStoreVersion();
  const hydrated = useHydrated();
  const p = enabledPlugins().find((x) => x.name === name); const r = p?.reports?.find((x) => x.name === report);
  const [filters, setFilters] = useState<Record<string, unknown>>(() => ({ ...(search.customer ? { customer: search.customer } : {}) }));
  useScopeMetas(hydrated && r ? [r.ref_doctype, ...(r.filters ?? []).filter((f) => f.fieldtype === "Link" && f.options).map((f) => f.options!)] : []);
  if (!hydrated) return <Shell><p className="text-muted-foreground">Loading…</p></Shell>;
  if (!p || !r) return <Shell><p className="text-muted-foreground">Report not found or app not enabled.</p></Shell>;
  if (!canReadType(r.ref_doctype)) return <Shell><div className="panel p-6" data-not-permitted><h2 className="font-semibold">Not Permitted</h2><p className="mt-1 text-sm text-muted-foreground"><span>Insufficient Permission for</span> <span data-no-i18n>{r.ref_doctype}</span></p></div></Shell>;
  // report rows pass the same scope as lists/cards: default rows are scoped; custom run() output drops rows outside User Permissions
  const rows = r.run ? filterReportRows(r.run(filters)) : scopedList(r.ref_doctype);
  logEvent({ kind: "plugin", doctype: r.ref_doctype, name: r.name, event: "report run", detail: `${rows.length} rows` });
  return (
    <Shell crumbs={[{ label: "", to: <Link to="/plugins/$name" params={{ name }} className="hover:underline">{p.workspaces?.[0]?.label ?? p.title}</Link> }, { label: r.name }]}>
      <h1 className="text-xl font-semibold">{r.name}</h1>
      <div className="mt-3 flex flex-wrap gap-3">
        {(r.filters ?? []).map((f) => (
          <label key={f.fieldname} className="text-xs"><span className="mb-1 block text-muted-foreground">{f.label}</span>
            <input className="field-input" data-no-i18n list={`f-${f.fieldname}`} value={String(filters[f.fieldname] ?? "")} onChange={(e) => setFilters({ ...filters, [f.fieldname]: e.target.value || undefined })} />
            {f.fieldtype === "Link" && f.options && <datalist id={`f-${f.fieldname}`}>{scopedList(f.options).slice(0, 200).map((d) => <option key={d.name} value={d.name} />)}</datalist>}
          </label>
        ))}
      </div>
      <div className="mt-3">
        <ReportPreviewScope doctypes={[...new Set(r.columns.flatMap((c) => (c.fieldtype === "Link" && c.options ? [c.options] : c.fieldtype === "Dynamic Link" && c.options ? rows.map((x) => String(x[c.options!] ?? "")) : [])).filter(Boolean))]}>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm" data-report-table>
              <thead className="bg-muted/50"><tr>{r.columns.map((c) => <th key={c.fieldname} className={`px-3 py-2 text-start font-medium ${NUMERIC.has(c.fieldtype) ? "text-end" : ""}`}>{c.label}</th>)}</tr></thead>
              <tbody>{rows.map((row, i) => <tr key={i} className="border-t">{r.columns.map((c) => { const t = reportCellTarget(c, row, (dt, n) => !!adapter.get(dt, n)); return <td key={c.fieldname} data-no-i18n className={`px-3 py-1.5 ${NUMERIC.has(c.fieldtype) ? "text-end tabular-nums" : ""}`}>{t ? <ReportDocLink doctype={t.doctype} name={t.name} /> : formatValue(c.fieldtype, row[c.fieldname])}</td>; })}</tr>)}</tbody>
              <tfoot className="border-t bg-muted/30 font-medium"><tr>{r.columns.map((c, i) => <td key={c.fieldname} data-no-i18n className={`px-3 py-1.5 ${NUMERIC.has(c.fieldtype) ? "text-end tabular-nums" : ""}`}>{i === 0 ? <span data-i18n>Total</span> : NUMERIC.has(c.fieldtype) ? formatValue(c.fieldtype, rows.reduce((s, x) => s + (Number(x[c.fieldname]) || 0), 0)) : ""}</td>)}</tr></tfoot>
            </table>
          </div>
        </ReportPreviewScope>
      </div>
      <p className="mt-2 text-xs text-muted-foreground"><bdi data-no-i18n>{rows.length}</bdi> <span>rows</span></p>
    </Shell>
  );
}
