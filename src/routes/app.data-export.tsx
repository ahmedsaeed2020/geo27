import { createFileRoute, Link } from "@tanstack/react-router";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Shell, Loading } from "@/components/Shell";
import { indexQuery, loadMeta, type DocTypeMeta } from "@/lib/catalog";
import { adapter } from "@/lib/adapter";
import { matchFilter, type Filter } from "@/lib/desk";
import { importableFields, tableSpecs, type TableSpec } from "@/lib/dataImport";
import { TemplateDialog } from "./app.data-import.new";

export const Route = createFileRoute("/app/data-export")({
  validateSearch: (s: Record<string, unknown>): { doctype?: string; names?: string } => ({
    ...(typeof s["doctype"] === "string" ? { doctype: s["doctype"] } : {}),
    ...(typeof s["names"] === "string" ? { names: s["names"] } : {}),
  }),
  head: () => ({ meta: [
    { title: "Data Export — Digit Desk" },
    { name: "description", content: "Export records with chosen fields, child tables and filters to CSV or Excel." },
    { property: "og:title", content: "Data Export — Digit Desk" },
    { property: "og:description", content: "Export records with chosen fields, child tables and filters to CSV or Excel." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Export,
});

const OPS = ["=", "!=", "like", ">", "<", ">=", "<=", "is"];

/** frappe/core/page/data_export (data_exporter.js) over adapter data. */
function Export() {
  const search = Route.useSearch();
  const { data: index } = useQuery(indexQuery);
  const [dt, setDt] = useState(search.doctype ?? "");
  const [meta, setMeta] = useState<DocTypeMeta>();
  const [specs, setSpecs] = useState<TableSpec[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [nf, setNf] = useState<Filter>(["", "=", ""]);
  const [onlySel, setOnlySel] = useState(!!search.names);
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => (search.names ? search.names.split(",") : []), [search.names]);
  const choices = useMemo(() => (index ?? []).filter((e) => !e.istable && !e.issingle).map((e) => e.name).sort(), [index]);
  useEffect(() => {
    if (!index || !dt) return;
    void loadMeta(index, dt).then(async (m) => { if (!m) return; adapter.ensureSeed(m); setMeta(m); setSpecs(await tableSpecs(index, m)); });
  }, [index, dt]);
  if (!index) return <Shell><Loading what="DocTypes" /></Shell>;
  const matching = meta ? adapter.list(meta.name).filter((r) => filters.every((f) => matchFilter(r, f))).filter((r) => !onlySel || selected.includes(r.name)) : [];
  return (
    <Shell crumbs={[{ label: "", to: <Link to="/app/data-import" className="hover:underline">Data Import</Link> }, { label: "Data Export" }]}>
      <ContextStrip icon={<img src="/icons/digit/feat/digit-feat-documents-dark.svg" alt="" />} eyebrow="Data" title="Data Export"
        sub="Choose a document type, filters and columns, then download the records you may read." />
      <section className="mt-4 grid gap-4 rounded-lg border border-border bg-card p-4">
        <label className="text-sm">Select DocType <span className="text-destructive">*</span>
          <select className="field-input mt-1 max-w-md" value={dt} onChange={(e) => { setDt(e.target.value); setFilters([]); }} aria-label="Select DocType">
            <option value="">Select…</option>{choices.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {meta && <>
          <div className="text-sm">
            <p className="font-medium">Filters</p>
            {filters.map((f, i) => (
              <div key={i} className="mt-1 flex items-center gap-2"><span data-no-i18n>{f[0]}</span><span>{f[1]}</span><span data-no-i18n>{String(f[2])}</span>
                <button className="btn-ghost" onClick={() => setFilters(filters.filter((_, k) => k !== i))} aria-label="Remove filter">✕</button></div>))}
            <div className="mt-2 flex flex-wrap gap-2">
              <select className="field-input w-48" value={nf[0]} onChange={(e) => setNf([e.target.value, nf[1], nf[2]])} aria-label="Filter field">
                <option value="">Field…</option>{importableFields(meta).map((f) => <option key={f.fieldname} value={f.fieldname}>{f.label || f.fieldname}</option>)}
              </select>
              <select className="field-input w-28" value={nf[1]} onChange={(e) => setNf([nf[0], e.target.value as Filter[1], nf[2]])} aria-label="Operator">{OPS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              <input className="field-input w-48" value={String(nf[2])} onChange={(e) => setNf([nf[0], nf[1], e.target.value])} aria-label="Value" />
              <button className="btn-ghost" disabled={!nf[0]} onClick={() => { setFilters([...filters, nf]); setNf(["", "=", ""]); }}>+ Add Filter</button>
            </div>
          </div>
          {selected.length > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.target.checked)} />Export only selected records ({selected.length})</label>}
          <p className="text-sm">{matching.length} records will be exported.</p>
          <div><button className="btn-primary" onClick={() => setOpen(true)}>Export</button></div>
        </>}
      </section>
      {open && meta && <FilteredExport specs={specs} meta={meta} names={matching.map((r) => r.name)} onClose={() => setOpen(false)} />}
    </Shell>
  );
}

function FilteredExport({ specs, meta, names, onClose }: { specs: TableSpec[]; meta: DocTypeMeta; names: string[]; onClose: () => void }) {
  return <TemplateDialog specs={specs} doctype={meta.name} type="Insert New Records" onClose={onClose} title={`Export ${meta.name}`} exportMode onlyNames={names} />;
}
