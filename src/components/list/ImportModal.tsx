import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { indexQuery, loadMeta, slugOf, type DocTypeMeta } from "@/lib/catalog";
import { importName } from "@/lib/dataImport";
import { adapter } from "@/lib/adapter";
import {
  autoMap, importableFields, parseFile, runImport, tableSpecs, validate,
  type Column, type ImportResult, type ImportType, type TableSpec,
} from "@/lib/dataImport";
import { TemplateDialog } from "@/routes/app.data-import.new";

/**
 * Data Import modal stepper (spec §1): Config → Preview → Fix issues → Import, opened from the list "…" menu
 * without a route change. Reuses the existing import engine in src/lib/dataImport.ts; linked Address/Contact
 * columns (Link fields to Address/Contact) are imported in the same file and linked back to the new record.
 */
const STEPS = ["Config", "Preview", "Fix issues", "Import"] as const;
const LINKED = ["Address", "Contact"];

export function ImportModal({ meta, onClose }: { meta: DocTypeMeta; onClose: () => void }) {
  const { data: index } = useQuery(indexQuery);
  const [step, setStep] = useState(0);
  const [type, setType] = useState<ImportType>("Insert New Records");
  const [opts, setOpts] = useState({ noEmail: true, custom: false, delimiter: ";", detect: false, submit: false });
  const [specs, setSpecs] = useState<TableSpec[]>([]);
  const [tab, setTab] = useState<"file" | "sheet">("file");
  const [sheet, setSheet] = useState("");
  const [pending, setPending] = useState<File | null>(null);
  const [isPublic, setPublic] = useState(false);
  const [file, setFile] = useState<{ name: string; kind: string } | null>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<(Column | null)[]>([]);
  const [vmap, setVmap] = useState<Record<number, Record<string, string>>>({});
  const [skip, setSkip] = useState(true);
  const [tpl, setTpl] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [logTab, setLogTab] = useState<"all" | "ok" | "fail">("all");
  const [started] = useState(() => new Date().toISOString().slice(0, 19).replace("T", " "));
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!index) return;
    void tableSpecs(index, meta).then(async (s) => {
      const links: TableSpec[] = [];
      for (const dt of LINKED) {
        if (!meta.fields.some((f) => f.fieldtype === "Link" && f.options === dt)) continue;
        const m = await loadMeta(index, dt);
        if (m) links.push({ key: `__link_${dt}`, label: dt, meta: m, parentfield: `__link_${dt}`, fields: importableFields(m) });
      }
      setSpecs([...s, ...links]);
    });
  }, [index, meta]);

  // re-map when linked specs finish loading after the file was uploaded
  useEffect(() => { if (rows && specs.length) setMap(autoMap(rows[0] ?? [], specs)); }, [specs]); // eslint-disable-line
  const header = rows?.[0] ?? [];
  // value mapping applied before validation (file value → existing record / "Create new")
  const body = useMemo(() => (rows?.slice(1) ?? []).map((r) => r.map((v, j) => (vmap[j]?.[v] && vmap[j]![v] !== "__new" ? vmap[j]![v]! : v))), [rows, vmap]);
  const fieldOf = (c: Column | null) => (c ? specs.find((s) => s.key === c.table)?.fields.find((f) => f.fieldname === c.fieldname) : undefined);
  const unknownValues = map.map((c, j) => {
    const f = fieldOf(c);
    if (!f || !f.options || !["Link", "Select"].includes(f.fieldtype)) return null;
    const vals = [...new Set((rows?.slice(1) ?? []).map((r) => r[j] ?? "").filter(Boolean))];
    const bad = vals.filter((v) => (f.fieldtype === "Link" ? !adapter.get(f.options!, v) : !f.options!.split("\n").includes(v)));
    return bad.length ? { j, f, bad } : null;
  }).filter(Boolean) as { j: number; f: NonNullable<ReturnType<typeof fieldOf>>; bad: string[] }[];
  const createNew = (vals: { j: number; v: string }[]) => {
    for (const { j, v } of vals) { const f = fieldOf(map[j]!); if (f?.fieldtype === "Link" && f.options && !adapter.get(f.options, v)) adapter.insertDoc(f.options, { name: v, [`${slugOf(f.options)}_name`]: v }); }
  };
  const checked = rows && specs.length ? validate(body, map, specs, type) : null;
  const issues = checked?.issues ?? [];

  const onPick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast.error("File exceeds 25 MB"); return; }
    setPending(f);
  };
  const upload = async () => {
    if (!pending) return;
    let r: string[][];
    if (opts.custom && /\.csv$/i.test(pending.name)) r = (await pending.text()).split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(opts.delimiter).map((c) => c.replace(/^"|"$/g, "")));
    else r = await parseFile(pending);
    setRows(r); setMap(autoMap(r[0] ?? [], specs)); setVmap({});
    setFile({ name: pending.name, kind: /\.xlsx?$/i.test(pending.name) ? "Excel" : "CSV" }); setPending(null);
  };
  const edit = (row: number, j: number, v: string) => setRows((rs) => rs && rs.map((r, i) => (i === row - 1 ? r.map((c, k) => (k === j ? v : c)) : r)));

  const doImport = () => {
    if (!checked) return;
    createNew(Object.entries(vmap).flatMap(([j, m]) => Object.entries(m).filter(([, t]) => t === "__new").map(([v]) => ({ j: Number(j), v }))));
    const again = validate(body, map, specs, type);
    let docs = again.docs;
    if (meta.is_tree) {
      // parents before children (frappe NestedSet needs the parent to exist): topological order by the tree parent field
      const pf = treeParentField(meta);
      if (pf) {
        const key = (d: Record<string, unknown>) => String(d["name"] ?? d[treeTitleField(meta)] ?? "");
        const depth = (d: Record<string, unknown>, seen = new Set<string>()): number => { const p = String(d[pf] ?? ""); const par = docs.find((x) => key(x.doc) === p); if (!p || !par || seen.has(p)) return 0; seen.add(p); return 1 + depth(par.doc, seen); };
        docs = [...docs].sort((a, b) => depth(a.doc) - depth(b.doc));
      }
    }
    const res = runImport(docs, again.issues, specs, type, opts.submit);
    for (const r of res.filter((x) => x.ok && x.name)) {
      const d = adapter.get(meta.name, r.name!); if (!d) continue;
      const patch: Record<string, unknown> = {};
      for (const dt of LINKED) {
        const k = `__link_${dt}`; const rowsL = d[k] as Record<string, unknown>[] | undefined; if (!rowsL?.length) continue;
        const link = adapter.insertDoc(dt, { ...rowsL[0], links: [{ link_doctype: meta.name, link_name: d.name }] });
        const lf = meta.fields.find((f) => f.fieldtype === "Link" && f.options === dt); if (lf?.fieldname) patch[lf.fieldname] = link.name;
        patch[k] = undefined;
      }
      if (Object.keys(patch).length) adapter.update(meta.name, d.name, patch);
    }
    const ok = res.filter((x) => x.ok).length;
    adapter.insertDoc("Data Import", { reference_doctype: meta.name, import_type: type, status: ok === res.length ? "Success" : ok ? "Partial Success" : "Error", import_file: file?.name ?? sheet, import_log: JSON.stringify(res), mute_emails: opts.noEmail ? 1 : 0 });
    setResults(res); setStep(3);
  };

  const okN = results?.filter((r) => r.ok).length ?? 0;
  const failN = (results?.length ?? 0) - okN;
  const shown = (results ?? []).filter((r) => logTab === "all" || (logTab === "ok" ? r.ok : !r.ok));
  const dt = meta.name;
  const canNext = step === 0 ? !!rows : step === 1 ? true : step === 2 ? !!checked && checked.docs.length > 0 && (skip || !issues.length) : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-label={`Import ${dt}`} data-import-modal>
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg bg-card shadow-xl">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <h2 className="text-lg font-semibold"><span>Import</span> <span>{dt}</span></h2>
          <ol className="mx-auto flex items-center gap-2 text-xs" data-stepper>
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5" data-step={s} data-state={i < step ? "done" : i === step ? "current" : "todo"}>
                <span className={`h-2.5 w-2.5 rounded-full border border-primary ${i < step || (i === 3 && results) ? "bg-primary" : i === step ? "bg-primary/40" : ""}`} />
                <span className={i === step ? "font-semibold" : "text-muted-foreground"}>{s}</span>
                {i < 3 && <span className="text-muted-foreground">→</span>}
              </li>
            ))}
          </ol>
          <button type="button" className="btn-ghost" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {step === 0 && (
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 font-semibold">Import settings</h3>
                <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr]">
                  <label className="text-sm">Document Type <span className="text-destructive">*</span><input className="field-input mt-1" value={dt} readOnly aria-label="Document Type" /></label>
                  <label className="text-sm">Import Type <span className="text-destructive">*</span>
                    <select className="field-input mt-1" value={type} onChange={(e) => setType(e.target.value as ImportType)} aria-label="Import Type">
                      <option value="Insert New Records">Insert New Records</option><option value="Update Existing Records">Update Existing Records</option>
                    </select></label>
                  <div className="space-y-1.5 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={opts.noEmail} onChange={(e) => setOpts({ ...opts, noEmail: e.target.checked })} />Don't Send Emails</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={opts.custom} onChange={(e) => setOpts({ ...opts, custom: e.target.checked })} />Custom Delimiters</label>
                    {opts.custom && <input className="field-input w-24" aria-label="Delimiter" value={opts.delimiter} onChange={(e) => setOpts({ ...opts, delimiter: e.target.value || ";" })} />}
                    <label className="flex items-center gap-2"><input type="checkbox" checked={opts.detect} onChange={(e) => setOpts({ ...opts, detect: e.target.checked })} />Detect CSV type</label>
                    <p className="text-[11px] text-muted-foreground">Use if the default settings don't seem to detect your data correctly</p>
                    {meta.is_submittable ? <label className="flex items-center gap-2"><input type="checkbox" checked={opts.submit} onChange={(e) => setOpts({ ...opts, submit: e.target.checked })} />Submit After Import</label> : null}
                  </div>
                </div>
              </section>
              <section>
                <div className="mb-2 flex items-center"><h3 className="font-semibold">Upload file</h3><button type="button" className="ms-auto text-sm text-primary hover:underline" onClick={() => setTpl(true)}>Download Template</button></div>
                <div className="mb-2 flex gap-1 border-b border-border text-sm" role="tablist">
                  {(["file", "sheet"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`border-b-2 px-3 py-1.5 ${tab === t ? "border-primary" : "border-transparent text-muted-foreground"}`}>{t === "file" ? "File upload" : "Google Sheet"}</button>)}
                </div>
                {tab === "file" && !file && (
                  <button type="button" data-dropzone onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files[0]); }}
                    className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-border p-8 text-sm text-muted-foreground hover:bg-muted/50">
                    <span>Drag a CSV or Excel file here, or click to browse</span><span className="text-xs">.csv, .xlsx up to 25 MB</span>
                  </button>
                )}
                <input ref={input} type="file" accept=".csv,.xlsx,.xls" className="hidden" aria-label="Import File" onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
                {tab === "file" && file && (
                  <div className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm" data-file-card>
                    <span className="chip bg-accent" data-no-i18n>{file.kind}</span>
                    <span data-no-i18n className="font-medium">{file.name}</span>
                    <span className="text-muted-foreground"><span>{file.kind}</span> · <span data-no-i18n>{Math.max(0, (rows?.length ?? 1) - 1)}</span> <span>rows</span></span>
                    <button type="button" className="btn-ghost ms-auto" onClick={() => { setFile(null); setRows(null); setMap([]); }}>Clear</button>
                  </div>
                )}
                {tab === "sheet" && <div className="space-y-1"><input className="field-input" placeholder="https://docs.google.com/spreadsheets/d/…" value={sheet} onChange={(e) => setSheet(e.target.value)} aria-label="Google Sheet URL" /><p className="text-xs text-warning">Server-dependent: fetching Google Sheets requires a DIGIT server. Download the sheet as CSV and attach it instead.</p></div>}
              </section>
            </div>
          )}

          {step === 1 && rows && (
            <div>
              <p className="text-sm">Map each file column to a field. Save to apply changes.</p>
              <p className="mb-2 text-xs text-muted-foreground"><span>Showing all</span> <span data-no-i18n>{body.length}</span> <span>rows</span></p>
              <div className="max-h-[50vh] overflow-auto rounded border border-border" data-preview-grid>
                <table className="text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr data-header-row="mapping">
                      <th className="px-1" />
                      {header.map((h, j) => (
                        <th key={j} className="min-w-44 px-1 py-1">
                          <select className="field-input py-1 text-xs" aria-label={`Map ${h}`} value={map[j] ? `${map[j]!.table}::${map[j]!.fieldname}` : ""}
                            onChange={(e) => { const [table = "", fieldname = ""] = e.target.value.split("::"); const n = [...map]; n[j] = e.target.value ? { header: h, table, fieldname } : null; setMap(n); }}>
                            <option value="">Don't Import</option>
                            {specs[0] && <option value={`${specs[0].key}::name`}>ID</option>}
                            {specs.map((s) => <optgroup key={s.key} label={s.label}>{s.fields.map((f) => <option key={f.fieldname} value={`${s.key}::${f.fieldname}`}>{s.key === specs[0]!.key ? f.label ?? f.fieldname : `${f.label ?? f.fieldname} (${s.label})`}</option>)}</optgroup>)}
                          </select>
                        </th>
                      ))}
                    </tr>
                    <tr data-header-row="file" className="text-muted-foreground">
                      <th className="px-1 text-start">#</th>{header.map((h, j) => <th key={j} className="px-2 py-1 text-start font-medium" data-no-i18n>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>{body.map((r, i) => <tr key={i} className="border-t border-border"><td className="px-1 text-muted-foreground">{i + 1}</td>{header.map((_, j) => <td key={j} className="whitespace-nowrap px-2 py-0.5" data-no-i18n>{r[j]}</td>)}</tr>)}</tbody>
                </table>
              </div>
              {meta.is_tree ? <TreePreview meta={meta} header={header} body={body} map={map} onEdit={edit} /> : null}
              {unknownValues.length > 0 && (
                <section className="mt-4 rounded-lg border border-border p-3" data-map-values>
                  <h3 className="mb-2 font-semibold">Map values</h3>
                  {unknownValues.map(({ j, f, bad }) => (
                    <div key={j} className="mb-3">
                      <div className="mb-1 text-sm font-medium"><span>{f.label}</span> <span className="text-xs text-muted-foreground">({f.fieldtype === "Link" ? f.options : "Select"})</span></div>
                      {bad.map((v) => (
                        <div key={v} className="flex items-center gap-2 text-sm">
                          <span className="w-48 truncate" data-no-i18n>{v}</span><span>→</span>
                          <select className="field-input w-64 py-1" aria-label={`Map value ${v}`} value={vmap[j]?.[v] ?? ""} onChange={(e) => setVmap({ ...vmap, [j]: { ...vmap[j], [v]: e.target.value } })}>
                            <option value="">Select…</option>
                            {f.fieldtype === "Link" && <option value="__new">Create new</option>}
                            {(f.fieldtype === "Link" ? adapter.list(f.options!).map((d) => d.name) : f.options!.split("\n").filter(Boolean)).slice(0, 200).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}

          {step === 2 && checked && (
            <div>
              <div className="mb-4 grid grid-cols-3 gap-3" data-stats>
                {[["Rows checked", body.length], ["Columns matched", map.filter(Boolean).length], ["Rows skipped", skip ? issues.length : 0]].map(([l, n]) => (
                  <div key={String(l)} className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-semibold" data-no-i18n>{n}</div></div>
                ))}
              </div>
              {!issues.length ? (
                <div className="py-8 text-center" data-no-issues><p className="font-medium">No issues to fix</p><p className="text-sm text-muted-foreground">No warnings or mapping issues were found. You can continue to import.</p></div>
              ) : (
                <div data-issues>
                  <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />Skip invalid rows</label>
                  {issues.map((iss) => (
                    <div key={iss.row} className="mb-2 rounded border border-destructive/30 bg-destructive/5 p-2 text-sm" data-issue-row={iss.row}>
                      <div className="font-medium"><span>Row</span> <span data-no-i18n>{iss.row - 1}</span></div>
                      {iss.messages.map((m, k) => <div key={k} className="text-destructive" data-no-i18n>{m}</div>)}
                      <div className="mt-1 flex flex-wrap gap-2">
                        {header.map((h, j) => map[j] ? <label key={j} className="text-[11px]"><span data-no-i18n>{h}</span><input className="field-input w-36 py-0.5 text-xs" value={rows?.[iss.row - 1]?.[j] ?? ""} onChange={(e) => edit(iss.row - 1, j, e.target.value)} aria-label={`Edit ${h}`} /></label> : null)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 3 && results && (
            <div data-import-log>
              <h3 className="mb-2 font-semibold">Import Log</h3>
              <div className="mb-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                {[["Total rows", results.length], ["Inserted", okN], ["Skipped", issues.length && skip ? issues.length : 0], ["Failed", failN]].map(([l, n]) => <div key={String(l)} className="rounded border border-border p-2"><div className="text-xs text-muted-foreground">{l}</div><div className="text-xl font-semibold" data-no-i18n>{n}</div></div>)}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-x-6 text-xs text-muted-foreground md:grid-cols-4">
                <div><span>Started by</span>: <span data-no-i18n>Administrator</span></div><div><span>Started on</span>: <span data-no-i18n>{started}</span></div>
                <div><span>Last modified by</span>: <span data-no-i18n>Administrator</span></div><div><span>Last modified on</span>: <span data-no-i18n>{new Date().toISOString().slice(0, 19).replace("T", " ")}</span></div>
              </div>
              <div className="mb-2 flex gap-1 border-b border-border text-sm" role="tablist">
                {([["all", "All", results.length], ["ok", "Success", okN], ["fail", "Failed", failN]] as const).map(([k, l, n]) => <button key={k} type="button" role="tab" aria-selected={logTab === k} onClick={() => setLogTab(k)} className={`border-b-2 px-3 py-1.5 ${logTab === k ? "border-primary" : "border-transparent text-muted-foreground"}`}><span>{l}</span> <span data-no-i18n>{n}</span></button>)}
              </div>
              <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="text-start">Row</th><th className="text-start">Status</th><th className="text-start">Message</th></tr></thead>
                <tbody>{shown.map((r) => (
                  <tr key={r.row} className="border-t border-border">
                    <td data-no-i18n>{r.row - 1}</td>
                    <td><span className={`chip ${r.ok ? "bg-success/20" : "bg-destructive/15 text-destructive"}`}>{r.ok ? "Success" : "Failed"}</span></td>
                    <td>{r.ok ? <><span>Successfully imported</span> <Link to="/app/$app/$doctype/$name" params={{ app: meta.app, doctype: slugOf(dt), name: r.name! }} className="text-primary hover:underline" data-no-i18n>{r.name}</Link></> : <span className="text-destructive" data-no-i18n>{r.messages.join("; ")}</span>}</td>
                  </tr>))}</tbody></table>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          {step > 0 && step < 3 && <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
          <div className="ms-auto" />
          {step < 2 && <button type="button" className="btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Next</button>}
          {step === 2 && <button type="button" className="btn-primary" data-do-import disabled={!canNext} onClick={doImport}>Import</button>}
          {step === 3 && <button type="button" className="btn-primary" onClick={onClose}>Done</button>}
        </div>
      </div>

      {pending && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20" role="dialog" aria-label="Upload">
          <div className="w-96 rounded-lg bg-card p-4 shadow-xl" data-upload-dialog>
            <h3 className="mb-3 font-semibold">Upload</h3>
            <div className="flex items-center gap-2 rounded border border-border p-2 text-sm"><span className="chip bg-accent" data-no-i18n>{pending.name.split(".").pop()?.toUpperCase()}</span><span className="truncate" data-no-i18n>{pending.name}</span><button type="button" className="ms-auto" aria-label="Remove" onClick={() => setPending(null)}>×</button></div>
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />Set all public</label>
            <div className="mt-4 flex justify-end"><button type="button" className="btn-primary" onClick={() => void upload()}>Upload</button></div>
          </div>
        </div>
      )}
      {tpl && <TemplateDialog specs={specs.filter((s) => !s.key.startsWith("__link_"))} doctype={dt} type={type} onClose={() => setTpl(false)} />}
    </div>
  );
}

/** Tree DocTypes (is_tree): NestedSet parent field — frappe uses `parent_<snake doctype>` (nsm_parent_field). */
export function treeParentField(meta: DocTypeMeta): string | undefined {
  const own = `parent_${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  return meta.fields.find((f) => f.fieldname === own)?.fieldname ?? meta.fields.find((f) => f.fieldtype === "Link" && f.options === meta.name && f.fieldname?.startsWith("parent"))?.fieldname;
}
export function treeTitleField(meta: DocTypeMeta): string {
  const own = `${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_name`;
  return meta.fields.some((f) => f.fieldname === own) ? own : meta.title_field ?? "name";
}

/** Hierarchy preview for tree imports (Account, Item Group, …): rows nested under their parent, parent editable inline. */
function TreePreview({ meta, header, body, map, onEdit }: { meta: DocTypeMeta; header: string[]; body: string[][]; map: (Column | null)[]; onEdit: (row: number, j: number, v: string) => void }) {
  const pf = treeParentField(meta); const tf = treeTitleField(meta);
  const jParent = map.findIndex((c) => c?.fieldname === pf);
  const jKey = map.findIndex((c) => c?.fieldname === "name") >= 0 ? map.findIndex((c) => c?.fieldname === "name") : map.findIndex((c) => c?.fieldname === tf);
  if (!pf || jKey < 0) return <p className="mt-3 text-xs text-muted-foreground" data-tree-preview="unmapped"><span>Map the name and parent columns to see the tree</span></p>;
  const cols = (r: string[]) => Object.fromEntries(map.map((c, j) => [c?.fieldname ?? "", r[j]]).filter(([k]) => k));
  const raw = body.map((r, i) => ({ i, key: r[jKey] ?? "", full: importName(meta, cols(r)) ?? r[jKey] ?? "", parent: jParent >= 0 ? r[jParent] ?? "" : "" }));
  const alias = new Map(raw.map((x) => [x.full, x.key]));
  const nodes = raw.map((x) => ({ ...x, parent: alias.get(x.parent) ?? x.parent }));
  const keys = new Set(nodes.map((x) => x.key));
  const existing = (p: string) => !!adapter.get(meta.name, p) || adapter.list(meta.name).some((d) => d[tf] === p);
  const roots = nodes.filter((x) => !x.parent || !keys.has(x.parent));
  const parentOptions = [...new Set([...keys, ...adapter.list(meta.name).filter((d) => d["is_group"]).map((d) => d.name)])];
  const render = (x: (typeof nodes)[number], depth: number, seen: Set<string>): React.ReactNode => {
    if (seen.has(x.key)) return <li key={x.i} className="text-destructive" data-tree-cycle>{x.key}: <span>circular parent</span></li>;
    const kids = nodes.filter((y) => y.parent === x.key && y.i !== x.i);
    const orphan = !!x.parent && !keys.has(x.parent) && !existing(x.parent);
    return (
      <li key={x.i} data-tree-node={x.key} data-depth={depth}>
        <div className="flex items-center gap-2 py-0.5" style={{ paddingInlineStart: depth * 18 }}>
          <span>{kids.length ? "▾" : "•"}</span><span className="font-medium" data-no-i18n>{x.key}</span>
          {x.parent && !keys.has(x.parent) && <span className={`chip ${orphan ? "bg-destructive/15 text-destructive" : "bg-muted"}`} data-tree-parent-state={orphan ? "missing" : "existing"}>{orphan ? <><span>Parent not found</span>: <span data-no-i18n>{x.parent}</span></> : <><span>under existing</span> <span data-no-i18n>{x.parent}</span></>}</span>}
          {jParent >= 0 && <select className="field-input ms-auto w-48 py-0.5 text-xs" aria-label={`Parent of ${x.key}`} data-tree-parent={x.key} value={x.parent} onChange={(e) => onEdit(x.i + 2, jParent, raw.find((y) => y.key === e.target.value)?.full ?? e.target.value)}>
            <option value="">(root)</option>{parentOptions.filter((o) => o !== x.key).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>}
        </div>
        {kids.length > 0 && <ul>{kids.map((k) => render(k, depth + 1, new Set([...seen, x.key])))}</ul>}
      </li>
    );
  };
  return (
    <section className="mt-4 rounded-lg border border-border p-3" data-tree-preview={nodes.length}>
      <h3 className="mb-2 font-semibold"><span>Tree preview</span> <span className="text-xs text-muted-foreground" data-no-i18n>({header[jParent] ?? pf})</span></h3>
      <ul className="max-h-72 overflow-auto text-sm">{roots.map((r) => render(r, 0, new Set()))}</ul>
    </section>
  );
}
