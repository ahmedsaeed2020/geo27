import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { startImportJob } from "@/lib/coreShared/jobs";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Shell, Loading } from "@/components/Shell";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { indexQuery, loadMeta, type DocTypeMeta } from "@/lib/catalog";
import { adapter } from "@/lib/adapter";
import {
  autoMap, download, headerFor, isMandatory, parseFile, runImport, tableSpecs, templateRows, validate,
  type Column, type ImportResult, type ImportType, type TableSpec,
} from "@/lib/dataImport";

export const Route = createFileRoute("/app/data-import/new")({
  validateSearch: (s: Record<string, unknown>): { doctype?: string } => (typeof s["doctype"] === "string" ? { doctype: s["doctype"] } : {}),
  head: () => ({ meta: [
    { title: "New Data Import — Digit Desk" },
    { name: "description", content: "Import records from CSV or Excel with template download, column mapping, preview and import log." },
    { property: "og:title", content: "New Data Import — Digit Desk" },
    { property: "og:description", content: "Import records from CSV or Excel with template download, column mapping, preview and import log." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: NewImport,
});

/** frappe/core/doctype/data_import/data_import.js + import_preview.js flow, run locally over the adapter. */
function NewImport() {
  const search = Route.useSearch();
  const nav = useNavigate();
  const { data: index } = useQuery(indexQuery);
  const [dt, setDt] = useState(search.doctype ?? "");
  const [type, setType] = useState<ImportType>("Insert New Records");
  const [meta, setMeta] = useState<DocTypeMeta>();
  const [specs, setSpecs] = useState<TableSpec[]>([]);
  const [tpl, setTpl] = useState(false);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [map, setMap] = useState<(Column | null)[]>([]);
  const [opts, setOpts] = useState({ submit: false, noEmail: true, mute: false });
  const [progress, setProgress] = useState<number | null>(null);

  const choices = useMemo(() => (index ?? []).filter((e) => !e.istable && !e.issingle).map((e) => e.name).sort(), [index]);
  useEffect(() => {
    if (!index || !dt) return;
    let live = true;
    void loadMeta(index, dt).then(async (m) => { if (!m || !live) return; adapter.ensureSeed(m); setMeta(m); setSpecs(await tableSpecs(index, m)); });
    return () => { live = false; };
  }, [index, dt]);

  if (!index) return <Shell><Loading what="DocTypes" /></Shell>;
  const header = rows?.[0] ?? [];
  const body = rows?.slice(1) ?? [];
  const checked = rows && specs.length ? validate(body, map, specs, type) : null;
  const issueByRow = new Map(checked?.issues.map((i) => [i.row, i.messages]));

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const r = await parseFile(f);
    setFileName(f.name); setRows(r); setMap(autoMap(r[0] ?? [], specs));
  };

  const start = () => {
    if (!checked || !meta) return;
    setProgress(0);
    const total = checked.docs.length; let i = 0;
    const tick = () => { i = Math.min(total, i + Math.max(1, Math.ceil(total / 10))); setProgress(Math.round((i / Math.max(total, 1)) * 100)); if (i < total) setTimeout(tick, 60); else finish(); };
    const finish = () => {
      const results: ImportResult[] = runImport(checked.docs, checked.issues, specs, type, opts.submit);
      const ok = results.filter((r) => r.ok).length;
      const status = ok === results.length ? "Success" : ok ? "Partial Success" : "Error";
      const imp = adapter.insertDoc("Data Import", {
        reference_doctype: meta.name, import_type: type, status, import_file: fileName || sheetUrl,
        submit_after_import: opts.submit ? 1 : 0, mute_emails: opts.mute ? 1 : 0,
        template_options: JSON.stringify({ header }), import_log: JSON.stringify(results),
      });
      results.forEach((r) => adapter.insertDoc("Data Import Log", {
        data_import: imp.name, row_indexes: JSON.stringify([r.row]), success: r.ok ? 1 : 0,
        docname: r.name ?? "", messages: JSON.stringify(r.messages),
      }));
      void nav({ to: "/app/data-import/$name", params: { name: imp.name } });
    };
    setTimeout(tick, 60);
  };

  // data_import.py start_import runs as a background job: the Data Import record opens at once and fills row by row
  const startInBackground = () => {
    if (!checked || !meta) return;
    const r = startImportJob({ doctype: meta.name, docs: checked.docs, issues: checked.issues, specs, type, submit: opts.submit, mute: opts.mute, fileName: fileName || sheetUrl, header });
    void nav({ to: "/app/data-import/$name", params: { name: r.dataImport } });
  };

  return (
    <Shell crumbs={[{ label: "", to: <Link to="/app/data-import" className="hover:underline">Data Import</Link> }, { label: "New Data Import" }]}>
      <ContextStrip icon={<img src="/icons/digit/ui/digit-ui-dashboard-dark.svg" alt="" />} eyebrow="DIGIT" title="New Data Import" sub="Upload a sheet, check it, then import it now or in the background."
        facts={[{ id: "state", label: "Status", value: "Not Saved", i18n: true }, { id: "rows", label: "Rows", value: checked ? checked.docs.length : 0 }]}
        actions={<>
          <button className="btn-ghost" data-import-background disabled={!checked || !checked.docs.length || progress !== null} onClick={startInBackground}>Start in background</button>
          <button className="btn-primary" data-band-primary disabled={!checked || !checked.docs.length || progress !== null} onClick={start}>Start Import</button>
        </>} />

      <section className="mt-4 grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <label className="text-sm">Document Type <span className="text-destructive">*</span>
          <select className="field-input mt-1" value={dt} onChange={(e) => { setDt(e.target.value); setRows(null); setMeta(undefined); }} aria-label="Document Type">
            <option value="">Select…</option>
            {choices.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-sm">Import Type <span className="text-destructive">*</span>
          <select className="field-input mt-1" value={type} onChange={(e) => setType(e.target.value as ImportType)} aria-label="Import Type">
            <option value="Insert New Records">Insert New Records</option>
            <option value="Update Existing Records">Update Existing Records</option>
          </select>
        </label>
        {meta && <>
          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
            <button className="btn-ghost" onClick={() => setTpl(true)}>Download Template</button>
            <label className="btn-ghost cursor-pointer">Attach
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Import File" />
            </label>
            {fileName && <span className="text-sm" data-no-i18n>{fileName}</span>}
          </div>
          <label className="text-sm md:col-span-2">Import from Google Sheets
            <input className="field-input mt-1" placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
            {sheetUrl && <span className="mt-1 block text-xs text-warning">Server-dependent: fetching Google Sheets requires a DIGIT server. Download the sheet as CSV and attach it instead.</span>}
          </label>
          <div className="md:col-span-2 flex flex-wrap gap-4 text-sm">
            {meta.is_submittable ? <label className="flex items-center gap-2"><input type="checkbox" checked={opts.submit} onChange={(e) => setOpts({ ...opts, submit: e.target.checked })} />Submit After Import</label> : null}
            <label className="flex items-center gap-2"><input type="checkbox" checked={opts.noEmail} onChange={(e) => setOpts({ ...opts, noEmail: e.target.checked })} />Don't Send Emails</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={opts.mute} onChange={(e) => setOpts({ ...opts, mute: e.target.checked })} />Mute Emails</label>
          </div>
        </>}
      </section>

      {progress !== null && (
        <div className="mt-4" role="progressbar" aria-valuenow={progress}>
          <p className="text-sm">Importing {meta?.name}… {progress}%</p>
          <div className="mt-1 h-2 rounded bg-muted"><div className="h-2 rounded bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      {rows && specs.length > 0 && (
        <>
          <section className="mt-4 rounded-lg border border-border bg-card p-4">
            <h2 className="font-semibold">Map Columns</h2>
            <p className="text-xs text-muted-foreground">Columns are matched by label automatically. Choose "Don't Import" to skip a column.</p>
            <table className="mt-2 w-full text-sm"><thead><tr className="text-start text-muted-foreground"><th className="text-start">Column in file</th><th className="text-start">Field</th></tr></thead>
              <tbody>{header.map((h, j) => (
                <tr key={j} className="border-t border-border">
                  <td className="py-1" data-no-i18n>{h}</td>
                  <td className="py-1">
                    <select className="field-input" aria-label={`Map ${h}`} value={map[j] ? `${map[j]!.table}::${map[j]!.fieldname}` : ""}
                      onChange={(e) => { const [table = "", fieldname = ""] = e.target.value.split("::"); const n = [...map]; n[j] = e.target.value ? { header: h, table, fieldname } : null; setMap(n); }}>
                      <option value="">Don't Import</option>
                      <option value={`${specs[0]!.key}::name`}>ID</option>
                      {specs.map((s) => <optgroup key={s.key} label={s.label}>{s.fields.map((f) => <option key={f.fieldname} value={`${s.key}::${f.fieldname}`}>{headerFor(s, f)}</option>)}</optgroup>)}
                    </select>
                  </td>
                </tr>))}
              </tbody></table>
          </section>

          <section className="mt-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold">Preview</h2>
              <span className="text-sm text-muted-foreground">{checked?.docs.length ?? 0} documents · {body.length} rows</span>
              {checked && checked.issues.length > 0 && <span className="chip bg-destructive/15 text-destructive">{checked.issues.length} rows with warnings</span>}
            </div>
            <div className="mt-2 max-h-[28rem] overflow-auto">
              <table className="w-full text-xs"><thead className="sticky top-0 bg-card"><tr><th className="px-1 text-start">#</th>{header.map((h, j) => <th key={j} className={`px-1 text-start ${map[j] ? "" : "text-muted-foreground line-through"}`} data-no-i18n>{h}</th>)}</tr></thead>
                <tbody>{body.map((r, i) => {
                  const iss = issueByRow.get(i + 2);
                  return (
                    <tr key={i} className={`border-t border-border ${iss ? "bg-destructive/5" : ""}`}>
                      <td className="px-1 text-muted-foreground">{i + 2}</td>
                      {header.map((_, j) => <td key={j} className="px-1" data-no-i18n>{r[j]}</td>)}
                      {iss && <td className="px-1 text-destructive">{iss.map((m, k) => <div key={k}>{m}</div>)}</td>}
                    </tr>);
                })}</tbody></table>
            </div>
          </section>
        </>
      )}

      {tpl && meta && <TemplateDialog specs={specs} doctype={meta.name} type={type} onClose={() => setTpl(false)} />}
    </Shell>
  );
}

/** Download Template dialog (data_import.js show_template_dialog / data_exporter.js field selector). */
export function TemplateDialog({ specs, doctype, type, onClose, title = "Download Template", exportMode = false, onlyNames }: {
  specs: TableSpec[]; doctype: string; type: ImportType; onClose: () => void; title?: string; exportMode?: boolean; onlyNames?: string[];
}) {
  const mand = (s: TableSpec) => s.fields.filter(isMandatory).map((f) => f.fieldname!);
  const [sel, setSel] = useState<Record<string, string[]>>(() => Object.fromEntries(specs.map((s, i) => [s.key, i === 0 ? s.fields.filter((f) => isMandatory(f) || f.in_list_view).map((f) => f.fieldname!) : mand(s)])));
  const [fileType, setFileType] = useState<"CSV" | "Excel">("CSV");
  const [mode, setMode] = useState<"blank" | "sample" | "all">(exportMode ? "all" : type === "Update Existing Records" ? "all" : "blank");
  const [n, setN] = useState(5);
  const [noHeader, setNoHeader] = useState(false);
  const locked = (s: TableSpec, fn: string) => !exportMode && mand(s).includes(fn);
  const toggle = (s: TableSpec, fn: string) => { const cur = sel[s.key] ?? []; setSel({ ...sel, [s.key]: cur.includes(fn) ? cur.filter((x) => x !== fn) : [...cur, fn] }); };
  const go = () => {
    const count = mode === "blank" ? 0 : mode === "sample" ? n : Number.MAX_SAFE_INTEGER;
    let r = templateRows(specs, sel, count, doctype);
    if (onlyNames) { let keep = false; r = [r[0] ?? [], ...r.slice(1).filter((row) => (keep = row[0] ? onlyNames.includes(row[0]) : keep))]; }
    if (noHeader) r = r.slice(1);
    download(r, doctype.replace(/\s+/g, "_"), fileType); onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-card p-5 shadow-lg">
        <div className="flex items-center"><h2 className="text-lg font-semibold">{title}</h2><button className="btn-ghost ms-auto" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm">
          <label>File Type<select className="field-input mt-1" value={fileType} onChange={(e) => setFileType(e.target.value as "CSV" | "Excel")}><option value="CSV">CSV</option><option value="Excel">Excel</option></select></label>
          <label>Export Type<select className="field-input mt-1" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="blank">Blank Template</option><option value="sample">5 Records</option><option value="all">All Records</option></select></label>
          {mode === "sample" && <label>Number of records<input type="number" min={1} className="field-input mt-1" value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value)))} /></label>}
          {exportMode && <label className="flex items-center gap-2 md:col-span-3"><input type="checkbox" checked={noHeader} onChange={(e) => setNoHeader(e.target.checked)} />Export without main header</label>}
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-ghost" onClick={() => setSel(Object.fromEntries(specs.map((s) => [s.key, s.fields.map((f) => f.fieldname!)])))}>Select All</button>
          <button className="btn-ghost" onClick={() => setSel(Object.fromEntries(specs.map((s) => [s.key, mand(s) ?? []])))}>Select Mandatory</button>
          <button className="btn-ghost" onClick={() => setSel(Object.fromEntries(specs.map((s) => [s.key, exportMode ? [] : mand(s)])))}>Unselect All</button>
        </div>
        {specs.map((s) => (
          <fieldset key={s.key} className="mt-3 rounded border border-border p-3">
            <legend className="px-1 text-sm font-medium">{s.label}{s.parentfield ? ` (${s.meta.name})` : ""}</legend>
            <div className="grid grid-cols-2 gap-1 text-sm md:grid-cols-3">
              {s.fields.map((f) => (
                <label key={f.fieldname} className="flex items-center gap-2">
                  <input type="checkbox" checked={sel[s.key]?.includes(f.fieldname!)} disabled={locked(s, f.fieldname!)} onChange={() => toggle(s, f.fieldname!)} />
                  <span>{f.label || f.fieldname}{isMandatory(f) && <span className="text-destructive"> *</span>}</span>
                </label>))}
            </div>
          </fieldset>))}
        <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={go}>{exportMode ? "Export" : "Download"}</button></div>
      </div>
    </div>
  );
}
