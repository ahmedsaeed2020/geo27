import { useQuery } from "@tanstack/react-query";
import { formatValue } from "@/lib/format";
import { hasMasterName, masterName } from "@/lib/coreShared/masterName";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { indexQuery, loadMeta, LAYOUT_TYPES, type DocField, type DocTypeMeta } from "@/lib/catalog";
import { adapter, type Doc } from "@/lib/adapter";
import { newChildRow } from "@/lib/documentApi";
import { parseFile, toCSV } from "@/lib/dataImport";
import { SerialBatchPicker, needsSerialBatch } from "./SerialBatchPicker";
import { useExperienceSlots } from "@/plugins/experienceSlots";
import { childLinkOptions, linkFiltersQuery } from "@/lib/engines";
import { useSessionUser } from "@/lib/session";
import { canReadType } from "@/lib/scope";
import { DevOnly } from "@/components/DevOnly";
import { LinkCombo, linkTitle } from "./LinkCombo";

/**
 * Child table grid (frappe/public/js/frappe/form/grid.js + spec §5): resizable columns, Configure Columns dialog
 * (width / sticky / order / add-remove / reset), row multi-select with Delete / Edit / Duplicate N rows, Bulk Edit,
 * and footer Add row / Add multiple / Download / Upload. Column config is per child DocType in localStorage.
 * New rows come only from documentApi.newChildRow (frappe.model.add_child: child defaults, never invented values);
 * an empty table stays empty, except the one blank row create_mandatory_children adds to a new document's
 * mandatory table.
 */
interface ColCfg { fieldname: string; width: number; sticky: boolean }
const KEY = (dt: string) => `digit-virtual-core:grid:${dt}`;
const NUM = /Int|Float|Currency|Percent/;

/** Columns that add up in a totals row: quantities and amounts, never rates, prices, percentages or factors. */
const SUMMABLE = (fd: { fieldtype: string; fieldname?: string | undefined }) => ["Currency", "Float", "Int"].includes(fd.fieldtype) && !/(rate|price|percent|discount|factor|margin|idx|conversion|_per_|days|hours)|^(base_)?total$|balance/.test(fd.fieldname ?? "");
export function ChildTable({ f, rows, ro, parent, onChange, onSeed }: { f: DocField; rows: Doc[] | null; ro: boolean; parent: Doc; onChange: (r: Doc[]) => void; onSeed: (r: Doc[]) => void }) {
  const idx = useQuery(indexQuery);
  const gridKeyDown = useExperienceSlots()?.slots.gridKeyDown; // active app experience keyboard navigation (e.g. DIGIT Pro ↑/↓/Enter)
  const [cm, setCm] = useState<DocTypeMeta | null>(null);
  const [cfg, setCfg] = useState<ColCfg[] | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [dlg, setDlg] = useState<null | "cols" | "bulk">(null);
  const upRef = useRef<HTMLInputElement>(null);
  const [sbRow, setSbRow] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null); // "<row>:<fieldname>" of the Link cell being edited
  const lfs = useQuery(linkFiltersQuery); const user = useSessionUser();
  useEffect(() => { if (idx.data && f.options) loadMeta(idx.data, f.options).then((m) => m && setCm(m)); }, [idx.data, f.options]);
  // create_mandatory_children for a new document whose child meta was not loaded when the draft was created
  useEffect(() => { if (cm && rows === null && parent["__islocal"] && !ro && Number(f.reqd ?? 0) && f.fieldname) onSeed([newChildRow(cm, parent, f.fieldname, 1)]); }, [cm, rows]); // eslint-disable-line
  useEffect(() => { if (cm) { try { setCfg(JSON.parse(localStorage.getItem(KEY(cm.name)) ?? "null")); } catch { setCfg(null); } } }, [cm]);
  if (!cm) return <DevOnly><div data-dev-only className="text-xs text-muted-foreground">{f.options} (child DocType not in supplied archives)</div></DevOnly>;
  const data = cm.fields.filter((x) => x.fieldname && !LAYOUT_TYPES.has(x.fieldtype));
  let defs = data.filter((x) => x.in_list_view);
  if (!defs.length) defs = data.slice(0, 4);
  const defaultCfg: ColCfg[] = defs.map((d) => ({ fieldname: d.fieldname!, width: Number(d["columns"] ?? 2) * 60 || 120, sticky: false }));
  const columns = (cfg ?? defaultCfg).filter((c) => data.some((d) => d.fieldname === c.fieldname));
  const fieldOf = (fn: string) => data.find((d) => d.fieldname === fn)!;
  const saveCfg = (c: ColCfg[] | null) => { setCfg(c); if (c) localStorage.setItem(KEY(cm.name), JSON.stringify(c)); else localStorage.removeItem(KEY(cm.name)); };
  const list = rows ?? [];
  const reindex = (r: Doc[]) => r.map((x, i) => ({ ...x, idx: i + 1 }));
  const blank = (i: number) => newChildRow(cm, parent, f.fieldname ?? "", i);
  const upd = (i: number, k: string, val: unknown) => onChange(list.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  const resize = (fn: string, e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX, cur = columns.find((c) => c.fieldname === fn)!.width;
    let latest = columns;
    const mv = (ev: MouseEvent) => { latest = columns.map((c) => (c.fieldname === fn ? { ...c, width: Math.max(50, cur + (document.dir === "rtl" ? x0 - ev.clientX : ev.clientX - x0)) } : c)); setCfg(latest); };
    const up = () => { saveCfg(latest); window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  let stickyOffset = ro ? 32 : 64;
  const n = sel.size;
  const download = () => {
    const csv = toCSV([columns.map((c) => fieldOf(c.fieldname).label ?? c.fieldname), ...list.map((r) => columns.map((c) => String(r[c.fieldname] ?? "")))]);
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${cm.name.replace(/\s+/g, "_")}.csv`; a.click();
  };
  const upload = async (file?: File) => {
    if (!file) return;
    const r = await parseFile(file); const head = r[0] ?? [];
    const fns = head.map((h) => data.find((d) => (d.label ?? d.fieldname) === h || d.fieldname === h)?.fieldname);
    const added = r.slice(1).map((row, i) => { const d: Doc = blank(list.length + i + 1); fns.forEach((fn, j) => { if (fn) d[fn] = NUM.test(fieldOf(fn).fieldtype) ? Number(row[j]) : row[j]; }); return d; });
    onChange(reindex([...list, ...added])); toast("Saved");
  };

  return (
    <div className="rounded-md border border-border" data-child-grid={cm.name}
      onKeyDown={(e) => { gridKeyDown?.(e); if ((e.metaKey || e.ctrlKey) && e.key === "a" && !(e.target as HTMLElement).matches("input[type=text],input[type=number],textarea")) { e.preventDefault(); setSel(new Set(list.map((_, i) => i))); } }} tabIndex={-1}>
      <div className="overflow-x-auto">
        <table className="text-sm" style={{ tableLayout: "fixed", minWidth: "100%" }}>
          <thead className="bg-muted text-start text-xs text-muted-foreground">
            <tr>
              {!ro && <th className="sticky start-0 z-10 w-8 bg-muted px-2 py-1"><input type="checkbox" aria-label="Select all rows" checked={list.length > 0 && n === list.length} onChange={(e) => setSel(e.target.checked ? new Set(list.map((_, i) => i)) : new Set())} /></th>}
              <th className={`sticky ${ro ? "start-0" : "start-8"} z-10 w-8 bg-muted px-2 py-1`}>#</th>
              {columns.map((c) => {
                const st = c.sticky ? { position: "sticky" as const, insetInlineStart: stickyOffset, zIndex: 5 } : {};
                if (c.sticky) stickyOffset += c.width;
                return (
                  <th key={c.fieldname} data-grid-col={c.fieldname} style={{ width: c.width, ...st }} className="relative bg-muted px-2 py-1 text-start">
                    <span className="block truncate">{fieldOf(c.fieldname).label ?? c.fieldname}</span>
                    <span role="separator" aria-label="Resize column" data-grid-resize={c.fieldname} onMouseDown={(e) => resize(c.fieldname, e)} className="absolute end-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40" />
                  </th>
                );
              })}
              <th className="w-10 px-1">{!ro && <button type="button" aria-label="Configure Columns" title="Configure Columns" data-grid-gear onClick={() => setDlg("cols")}>⚙</button>}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => {
              let off = ro ? 32 : 64;
              return (
                <tr key={i} className={`border-t border-border ${sel.has(i) ? "bg-primary/5" : ""}`}>
                  {!ro && <td className="sticky start-0 bg-card px-2"><input type="checkbox" aria-label={`Select row ${i + 1}`} checked={sel.has(i)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(i); else s.delete(i); setSel(s); }} /></td>}
                  <td className={`sticky ${ro ? "start-0" : "start-8"} bg-card px-2 text-muted-foreground`} data-no-i18n>{i + 1}</td>
                  {columns.map((c) => {
                    const fd = fieldOf(c.fieldname);
                    const st = c.sticky ? { position: "sticky" as const, insetInlineStart: off } : {};
                    if (c.sticky) off += c.width;
                    return (
                      <td key={c.fieldname} style={st} className="bg-card px-1 py-0.5">
                        {ro
                          ? <div data-cell-ro={c.fieldname} data-no-i18n={fd.fieldtype === "Select" ? undefined : true} dir={NUM.test(fd.fieldtype) ? undefined : "auto"} title={String(r[c.fieldname] ?? "")} className={`bidi-iso px-1 py-1 ${NUM.test(fd.fieldtype) ? "text-end tabular-nums" : "break-words"}`}>{fd.fieldtype === "Check" ? (r[c.fieldname] ? "✓" : "") : fd.fieldtype === "Link" && hasMasterName(fd.options) ? masterName(fd.options, r[c.fieldname], r, c.fieldname) : formatValue(fd.fieldtype, r[c.fieldname], { options: fd.options, doc: r })}</div>
                          : fd.fieldtype === "Check"
                          ? <input type="checkbox" disabled={ro} checked={!!r[c.fieldname]} onChange={(e) => upd(i, c.fieldname, e.target.checked ? 1 : 0)} aria-label={fd.label} />
                          : fd.fieldtype === "Select"
                          ? <select className="field-input py-1" data-cell={c.fieldname} aria-label={fd.label} value={String(r[c.fieldname] ?? "")} onChange={(e) => upd(i, c.fieldname, e.target.value)}>{(fd.options ?? "").split("\n").map((o) => <option key={o} value={o}>{o}</option>)}</select>
                          : fd.fieldtype === "Link" || fd.fieldtype === "Dynamic Link"
                          ? (() => { const on = focus === `${i}:${c.fieldname}`;
                              const o = on ? childLinkOptions(lfs.data?.[String(parent["doctype"] ?? "")], String(parent["doctype"] ?? ""), f.fieldname ?? "", fd, r, parent) : null;
                              const names = o && o.doctype && canReadType(o.doctype, user) ? o.names.slice(0, 200) : [];
                              // owner note 6 LINK-01: the shared under-field list (code + readable name); options load only for the focused cell
                              return <LinkCombo className="field-input bidi-iso py-1" value={String(r[c.fieldname] ?? "")} onChange={(x) => upd(i, c.fieldname, x)} ariaLabel={fd.label} title={String(r[c.fieldname] ?? "")}
                                onFocus={() => setFocus(`${i}:${c.fieldname}`)} options={names.map((d) => ({ value: d.name, title: linkTitle(d) }))}
                                attrs={{ "data-cell": c.fieldname, "data-cell-link": fd.fieldtype === "Dynamic Link" ? String(r[fd.options ?? ""] ?? "") : fd.options, ...(on ? { "data-cell-options": names.length } : {}) }} />; })()
                          : <input dir="auto" className={`field-input bidi-iso py-1 ${NUM.test(fd.fieldtype) ? "text-end" : ""}`} data-cell={c.fieldname} title={String(r[c.fieldname] ?? "")} type={NUM.test(fd.fieldtype) ? "number" : "text"} value={String(r[c.fieldname] ?? "")} onChange={(e) => upd(i, c.fieldname, NUM.test(fd.fieldtype) ? Number(e.target.value) : e.target.value)} aria-label={fd.label} />}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap">{!ro && needsSerialBatch(r) && <button type="button" className="px-1 text-xs text-primary" data-sb-open title="Add Serial / Batch No" aria-label="Add Serial / Batch No" onClick={() => setSbRow(i)}>#</button>}{!ro && <button type="button" className="px-2 text-destructive" aria-label="Delete row" onClick={() => onChange(reindex(list.filter((_, j) => j !== i)))}>×</button>}</td>
                </tr>
              );
            })}
          </tbody>
          {(() => {
            // owner notes A-05: the child table ends with a totals row (quantities and amounts; rates, prices and percentages are not summed)
            const sums = columns.filter((c) => SUMMABLE(fieldOf(c.fieldname)));
            if (list.length < 2 || !sums.length) return null;
            return <tfoot data-grid-total><tr className="border-t-2 border-border font-semibold">
              {!ro && <td className="sticky start-0 bg-muted" />}
              <td className={`sticky ${ro ? "start-0" : "start-8"} bg-muted px-2 py-1 text-xs`}><span>Total</span></td>
              {columns.map((c) => { const fd = fieldOf(c.fieldname); return <td key={c.fieldname} className="bg-muted px-2 py-1 text-end tabular-nums" data-grid-total-col={SUMMABLE(fd) ? c.fieldname : undefined} data-no-i18n>
                {SUMMABLE(fd) ? formatValue(fd.fieldtype, list.reduce((a, r) => a + (Number(r[c.fieldname]) || 0), 0), { options: fd.options, doc: list[0] }) : ""}</td>; })}
              <td className="bg-muted" />
            </tr></tfoot>;
          })()}
        </table>
      </div>
      {!ro && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-1.5 text-xs" data-grid-footer>
          {n > 0 ? <>
            <button type="button" className="btn-ghost py-0.5 text-destructive" data-grid-action="delete" onClick={() => { onChange(reindex(list.filter((_, j) => !sel.has(j)))); setSel(new Set()); }}><span>Delete</span> <span data-no-i18n>{n}</span> <span>rows</span></button>
            <button type="button" className="btn-ghost py-0.5" data-grid-action="edit" onClick={() => setDlg("bulk")}><span>Edit</span> <span data-no-i18n>{n}</span> <span>rows</span></button>
            <button type="button" className="btn-ghost py-0.5" data-grid-action="duplicate" onClick={() => { onChange(reindex([...list, ...list.filter((_, j) => sel.has(j)).map((r, j) => ({ ...r, name: blank(list.length + j + 1).name }))])); setSel(new Set()); }}><span>Duplicate</span> <span data-no-i18n>{n}</span> <span>rows</span></button>
          </> : <>
            <button type="button" className="btn-ghost py-0.5" data-grid-add onClick={() => onChange(reindex([...list, blank(list.length + 1)]))}>Add row</button>
            <button type="button" className="btn-ghost py-0.5" onClick={() => { const k = Number(prompt("Number of rows", "5") ?? 0); if (k > 0) onChange(reindex([...list, ...Array.from({ length: Math.min(k, 100) }, (_, j) => blank(list.length + j + 1))])); }}>Add multiple</button>
          </>}
          <span className="ms-auto" />
          <button type="button" className="btn-ghost py-0.5" onClick={download}>Download</button>
          <button type="button" className="btn-ghost py-0.5" onClick={() => upRef.current?.click()}>Upload</button>
          <input ref={upRef} type="file" accept=".csv,.xlsx" className="hidden" aria-label="Upload rows" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      )}
      {sbRow !== null && list[sbRow] && <SerialBatchPicker row={list[sbRow]!} onClose={() => setSbRow(null)} onApply={(p: Record<string, unknown>) => { onChange(list.map((r, j) => (j === sbRow ? { ...r, ...p } : r))); setSbRow(null); }} />}
      {dlg === "cols" && <ConfigureColumns data={data} columns={columns} onClose={() => setDlg(null)} onUpdate={(c) => { saveCfg(c); setDlg(null); toast("Saved"); }} onReset={() => { saveCfg(null); setDlg(null); }} />}
      {dlg === "bulk" && <BulkEdit fields={columns.map((c) => fieldOf(c.fieldname)).filter((x) => !x.read_only)} n={n} onClose={() => setDlg(null)} onApply={(fn, v) => { onChange(list.map((r, j) => (sel.has(j) ? { ...r, [fn]: v } : r))); setDlg(null); setSel(new Set()); toast("Saved"); }} />}
    </div>
  );
}

function ConfigureColumns({ data, columns, onClose, onUpdate, onReset }: { data: DocField[]; columns: ColCfg[]; onClose: () => void; onUpdate: (c: ColCfg[]) => void; onReset: () => void }) {
  const [c, setC] = useState(columns);
  const [picker, setPicker] = useState(false);
  const drag = useRef<number | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-label="Configure Columns" data-configure-cols>
      <div className="w-full max-w-lg rounded-lg bg-card p-4 shadow-xl">
        <div className="mb-3 flex items-center"><h3 className="font-semibold">Configure Columns</h3><button type="button" className="btn-ghost ms-auto" aria-label="Close" onClick={onClose}>✕</button></div>
        <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="w-6" /><th className="text-start">Fieldname</th><th className="text-start">Column Width</th><th>Sticky</th><th /></tr></thead>
          <tbody>{c.map((x, i) => (
            <tr key={x.fieldname} draggable onDragStart={() => (drag.current = i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { const from = drag.current; if (from === null) return; const n = [...c]; const [m] = n.splice(from, 1); n.splice(i, 0, m!); setC(n); }} className="border-t border-border" data-cfg-row={x.fieldname}>
              <td className="cursor-move text-muted-foreground">⋮⋮</td>
              <td>{data.find((d) => d.fieldname === x.fieldname)?.label ?? x.fieldname}</td>
              <td><input type="number" className="field-input w-24 py-0.5" aria-label="Column Width" value={x.width} onChange={(e) => setC(c.map((y, j) => (j === i ? { ...y, width: Number(e.target.value) } : y)))} /></td>
              <td className="text-center"><input type="checkbox" aria-label="Sticky" checked={x.sticky} onChange={(e) => setC(c.map((y, j) => (j === i ? { ...y, sticky: e.target.checked } : y)))} /></td>
              <td><button type="button" className="text-destructive" aria-label="Remove" onClick={() => setC(c.filter((_, j) => j !== i))}>×</button></td>
            </tr>))}</tbody></table>
        <button type="button" className="mt-2 text-sm text-primary" onClick={() => setPicker(!picker)}>Add / Remove Columns</button>
        {picker && <div className="mt-2 grid max-h-40 grid-cols-2 gap-1 overflow-auto rounded border border-border p-2 text-xs">{data.map((d) => <label key={d.fieldname} className="flex items-center gap-1"><input type="checkbox" checked={c.some((x) => x.fieldname === d.fieldname)} onChange={(e) => setC(e.target.checked ? [...c, { fieldname: d.fieldname!, width: 120, sticky: false }] : c.filter((x) => x.fieldname !== d.fieldname))} />{d.label ?? d.fieldname}</label>)}</div>}
        <div className="mt-4 flex gap-2"><button type="button" className="btn-ghost" onClick={onReset}>Reset to default</button><button type="button" className="btn-primary ms-auto" onClick={() => onUpdate(c)}>Update</button></div>
      </div>
    </div>
  );
}

function BulkEdit({ fields, n, onClose, onApply }: { fields: DocField[]; n: number; onClose: () => void; onApply: (fn: string, v: unknown) => void }) {
  const [fn, setFn] = useState(fields[0]?.fieldname ?? "");
  const [v, setV] = useState("");
  const fd = fields.find((x) => x.fieldname === fn);
  const opts = fd?.fieldtype === "Link" && fd.options ? adapter.list(fd.options).slice(0, 200) : [];
  // actual qty hints for Warehouse links (Bin.actual_qty), as in the source grid's warehouse query
  const qty = (w: string) => adapter.list("Bin").filter((b) => b["warehouse"] === w).reduce((s, b) => s + Number(b["actual_qty"] ?? 0), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-label="Bulk Edit" data-bulk-edit>
      <div className="w-full max-w-md space-y-3 rounded-lg bg-card p-4 shadow-xl">
        <div className="flex items-center"><h3 className="font-semibold">Bulk Edit</h3><button type="button" className="btn-ghost ms-auto" aria-label="Close" onClick={onClose}>✕</button></div>
        <label className="block text-sm">Field <span className="text-destructive">*</span>
          <select className="field-input mt-1" aria-label="Field" value={fn} onChange={(e) => { setFn(e.target.value); setV(""); }}>{fields.map((x) => <option key={x.fieldname} value={x.fieldname}>{x.label ?? x.fieldname}</option>)}</select></label>
        <label className="block text-sm">Value
          {fd?.fieldtype === "Select" ? <select className="field-input mt-1" aria-label="Value" value={v} onChange={(e) => setV(e.target.value)}>{(fd.options ?? "").split("\n").map((o) => <option key={o} value={o}>{o}</option>)}</select>
          : fd?.fieldtype === "Link" ? <><input list="bulk-opts" className="field-input mt-1" aria-label="Value" value={v} onChange={(e) => setV(e.target.value)} /><datalist id="bulk-opts">{opts.map((o) => <option key={o.name} value={o.name}>{fd.options === "Warehouse" ? `${qty(o.name)}` : ""}</option>)}</datalist>
              {fd.options === "Warehouse" && v && <span className="mt-1 block text-[11px] text-muted-foreground"><span>Actual Qty</span>: <span data-no-i18n>{qty(v)}</span></span>}</>
          : <input className="field-input mt-1" aria-label="Value" type={NUM.test(fd?.fieldtype ?? "") ? "number" : fd?.fieldtype === "Date" ? "date" : "text"} value={v} onChange={(e) => setV(e.target.value)} />}
        </label>
        <div className="flex justify-end"><button type="button" className="btn-primary" disabled={!fn} onClick={() => onApply(fn, NUM.test(fd?.fieldtype ?? "") ? Number(v) : v)}><span>Update</span> <span data-no-i18n>{n}</span> <span>rows</span></button></div>
      </div>
    </div>
  );
}
