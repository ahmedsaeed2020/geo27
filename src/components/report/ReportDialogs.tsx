import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adapter } from "@/lib/adapter";
import { indexQuery, loadMeta, LAYOUT_TYPES, TABLE_TYPES, type DocField } from "@/lib/catalog";
import { exportMatrix, toCsv, type WbColumn, type WbRow } from "@/lib/reportWorkbench";

const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string | undefined }) => (
  <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}</label>
);

export interface ExportChoice { format: "Excel" | "CSV"; delimiter: string; quoting: number; decimalSep: string; includeFilters: boolean; includeIndentation: boolean }
/** report_utils.get_export_dialog + query_report.js export_report extra fields. */
export function ExportDialog({ open, onClose, report, columns, rows, applied, tree, onDownload }: { open: boolean; onClose: () => void; report: string; columns: WbColumn[]; rows: WbRow[]; applied: Record<string, string>; tree: boolean; onDownload: (c: ExportChoice) => void }) {
  const [c, setC] = useState<ExportChoice>({ format: "Excel", delimiter: ",", quoting: 2, decimalSep: ".", includeFilters: false, includeIndentation: false });
  const preview = useMemo(() => (c.format === "CSV" ? toCsv(exportMatrix(columns, rows.slice(0, 3)), c.delimiter, c.quoting, c.decimalSep) : ""), [c, columns, rows]);
  const hasFilters = Object.values(applied).some(Boolean);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-export-dialog>
        <DialogHeader><DialogTitle><span>Export Report</span>: <span data-no-i18n>{report}</span></DialogTitle><DialogDescription>Exports the rows shown on screen (current filters, sorting and visible columns).</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="File Format"><select className="field-input" data-export-format value={c.format} onChange={(e) => setC({ ...c, format: e.target.value as ExportChoice["format"] })}><option value="Excel">Excel</option><option value="CSV">CSV</option></select></Field>
          <label className="flex items-center gap-2 text-sm opacity-60" title="Background export runs as a DIGIT background job and emails the file"><input type="checkbox" disabled /> <span>Export in Background</span> <span className="text-[11px] text-muted-foreground">(DIGIT server)</span></label>
          {c.format === "CSV" && (
            <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
              <Field label="CSV Delimiter"><input className="field-input" data-no-i18n maxLength={1} value={c.delimiter} onChange={(e) => setC({ ...c, delimiter: e.target.value })} /></Field>
              <Field label="CSV Quoting"><select className="field-input" value={c.quoting} onChange={(e) => setC({ ...c, quoting: Number(e.target.value) })}><option value={0}>Minimal</option><option value={1}>All</option><option value={2}>Non-numeric</option><option value={3}>None</option></select></Field>
              {c.quoting !== 2 && <Field label="CSV Decimal Separator"><input className="field-input" data-no-i18n maxLength={1} value={c.decimalSep} onChange={(e) => setC({ ...c, decimalSep: e.target.value })} /></Field>}
              <div className="sm:col-span-3"><Field label="CSV Preview"><pre className="max-h-28 overflow-auto rounded bg-muted p-2 text-[11px]" data-csv-preview>{preview}</pre></Field></div>
            </div>
          )}
          {tree && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.includeIndentation} onChange={(e) => setC({ ...c, includeIndentation: e.target.checked })} /> <span>Include indentation</span></label>}
          {hasFilters && <label className="flex items-center gap-2 text-sm"><input type="checkbox" data-export-include-filters checked={c.includeFilters} onChange={(e) => setC({ ...c, includeFilters: e.target.checked })} /> <span>Include filters</span></label>}
        </div>
        <DialogFooter><button type="button" className="btn-primary" data-export-download onClick={() => onDownload(c)}>Download</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface PrintChoice { letterHead: string; orientation: "Landscape" | "Portrait"; includeFilters: boolean; columns: string[] }
/** frappe.ui.get_print_settings (Print Settings / PDF Settings) as used by print_report / pdf_report. */
export function PrintDialog({ open, mode, onClose, columns, defaultLetterHead, onGo }: { open: boolean; mode: "print" | "pdf"; onClose: () => void; columns: WbColumn[]; defaultLetterHead?: string | null | undefined; onGo: (c: PrintChoice) => void }) {
  const heads = adapter.list("Letter Head").filter((h) => !Number(h["disabled"] ?? 0));
  const def = defaultLetterHead || heads.find((h) => Number(h["is_default"] ?? 0))?.name || "";
  const shown = columns.filter((c) => !c.hidden);
  const [c, setC] = useState<PrintChoice>({ letterHead: def, orientation: shown.length > 10 ? "Landscape" : "Portrait", includeFilters: true, columns: shown.map((x) => x.fieldname) });
  useEffect(() => { if (open) setC((x) => ({ ...x, columns: shown.map((s) => s.fieldname) })); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-print-dialog={mode}>
        <DialogHeader><DialogTitle>{mode === "pdf" ? "PDF Settings" : "Print Settings"}</DialogTitle><DialogDescription>{mode === "pdf" ? "The PDF is generated in this browser from the rows on screen." : "Opens the browser print dialog for the rows on screen."}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="Letter Head"><select className="field-input" value={c.letterHead} onChange={(e) => setC({ ...c, letterHead: e.target.value })}><option value="">No Letterhead</option>{heads.map((h) => <option key={h.name} value={h.name} data-no-i18n>{h.name}</option>)}</select></Field>
          <Field label="Orientation" hint={c.orientation === "Portrait" && shown.length > 10 ? "Report with more than 10 columns looks better in Landscape mode." : undefined}><select className="field-input" data-print-orientation value={c.orientation} onChange={(e) => setC({ ...c, orientation: e.target.value as PrintChoice["orientation"] })}><option value="Landscape">Landscape</option><option value="Portrait">Portrait</option></select></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.includeFilters} onChange={(e) => setC({ ...c, includeFilters: e.target.checked })} /> <span>Include filters</span></label>
          <fieldset className="max-h-40 overflow-auto rounded-md border border-border p-2"><legend className="px-1 text-xs text-muted-foreground">Pick Columns</legend>
            <div className="grid gap-1 sm:grid-cols-2">{shown.map((x) => <label key={x.fieldname} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={c.columns.includes(x.fieldname)} onChange={(e) => setC({ ...c, columns: e.target.checked ? [...c.columns, x.fieldname] : c.columns.filter((f) => f !== x.fieldname) })} /> <span>{x.label}</span></label>)}</div>
          </fieldset>
        </div>
        <DialogFooter><button type="button" className="btn-primary" data-print-go={mode} disabled={!c.columns.length} onClick={() => onGo(c)}>{mode === "pdf" ? "PDF" : "Print"}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** query_report.js Save → "Save Report" dialog (Report Name, default = current name for a non-standard report). */
export function SaveReportDialog({ open, onClose, defaultName, onSave, error }: { open: boolean; onClose: () => void; defaultName: string; onSave: (name: string) => void; error?: string | undefined }) {
  const [name, setName] = useState(defaultName);
  useEffect(() => { if (open) setName(defaultName); }, [open, defaultName]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-save-report-dialog>
        <DialogHeader><DialogTitle>Save Report</DialogTitle><DialogDescription>Saves the current filters and visible columns as a Custom Report.</DialogDescription></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSave(name); }} className="space-y-2">
          <Field label="Report Name"><input className="field-input" data-no-i18n data-save-report-name required value={name} onChange={(e) => setName(e.target.value)} /></Field>
          {error && <p className="text-sm text-destructive" role="alert" data-save-error>{error}</p>}
          <DialogFooter><button type="submit" className="btn-primary" data-save-report-submit disabled={!name.trim()}>Save</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface AddColumnChoice { doctype: string; linkField: string; field: string; label: string; fieldtype: string; insertAfter: string }
/** query_report.js Add Column: From Document Type (Link columns), Field (value fields of that DocType), Insert After. */
export function AddColumnDialog({ open, onClose, columns, onAdd }: { open: boolean; onClose: () => void; columns: WbColumn[]; onAdd: (c: AddColumnChoice) => void }) {
  const idx = useQuery(indexQuery);
  const links = columns.filter((c) => c.fieldtype === "Link" && c.options && c.options !== "DocType");
  const [src, setSrc] = useState(""); const [field, setField] = useState(""); const [after, setAfter] = useState("");
  const [fields, setFields] = useState<DocField[]>([]);
  const chosen = links.find((l) => `${l.options}|${l.fieldname}` === src);
  useEffect(() => {
    setFields([]); setField("");
    if (!chosen?.options || !idx.data) return;
    loadMeta(idx.data, chosen.options).then((m) => setFields((m?.fields ?? []).filter((f) => f.fieldname && !LAYOUT_TYPES.has(f.fieldtype) && !TABLE_TYPES.has(f.fieldtype) && f.fieldtype !== "Code").sort((a, b) => String(a.label ?? "").localeCompare(String(b.label ?? "")))));
  }, [src, idx.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = fields.find((x) => x.fieldname === field);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-add-column-dialog>
        <DialogHeader><DialogTitle>Add Column</DialogTitle><DialogDescription>Adds a field of a linked document as a column; values are read from the linked records.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="From Document Type"><select className="field-input" data-add-col-doctype value={src} onChange={(e) => setSrc(e.target.value)}><option value="" />{links.map((l) => <option key={l.fieldname} value={`${l.options}|${l.fieldname}`}>{`${l.options} (${l.label})`}</option>)}</select></Field>
          <Field label="Field"><select className="field-input" data-add-col-field value={field} disabled={!fields.length} onChange={(e) => setField(e.target.value)}><option value="" />{fields.map((x) => <option key={x.fieldname} value={x.fieldname}>{x.label ?? x.fieldname}</option>)}</select></Field>
          <Field label="Insert After"><select className="field-input" value={after} onChange={(e) => setAfter(e.target.value)}><option value="" />{columns.filter((c) => !c.hidden).map((c) => <option key={c.fieldname} value={c.fieldname}>{c.label}</option>)}</select></Field>
        </div>
        <DialogFooter><button type="button" className="btn-primary" data-add-col-submit disabled={!chosen || !f} onClick={() => chosen && f && onAdd({ doctype: chosen.options!, linkField: chosen.fieldname, field: f.fieldname!, label: String(f.label ?? f.fieldname), fieldtype: f.fieldtype, insertAfter: after })}>Submit</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ChartChoice { type: "Bar" | "Line" | "Pie"; x: string; y: string[] }
/** query_report.js Set Chart (open_create_chart_dialog): chart type, label field and value fields from the columns. */
export function SetChartDialog({ open, onClose, columns, current, onSet }: { open: boolean; onClose: () => void; columns: WbColumn[]; current: ChartChoice | null; onSet: (c: ChartChoice | null) => void }) {
  const NUMS = columns.filter((c) => !c.hidden && ["Currency", "Float", "Int", "Percent"].includes(c.fieldtype));
  const LABELS = columns.filter((c) => !c.hidden && !["Currency", "Float", "Int", "Percent"].includes(c.fieldtype));
  const [c, setC] = useState<ChartChoice>(current ?? { type: "Bar", x: LABELS[0]?.fieldname ?? "", y: NUMS.slice(0, 1).map((n) => n.fieldname) });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-set-chart-dialog>
        <DialogHeader><DialogTitle>Create Chart</DialogTitle><DialogDescription>Charts the rows on screen.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="Chart Type"><select className="field-input" value={c.type} onChange={(e) => setC({ ...c, type: e.target.value as ChartChoice["type"] })}><option value="Bar">Bar</option><option value="Line">Line</option><option value="Pie">Pie</option></select></Field>
          <Field label="X Field"><select className="field-input" value={c.x} onChange={(e) => setC({ ...c, x: e.target.value })}>{LABELS.map((l) => <option key={l.fieldname} value={l.fieldname}>{l.label}</option>)}</select></Field>
          <fieldset className="rounded-md border border-border p-2"><legend className="px-1 text-xs text-muted-foreground">Y Field</legend>
            {NUMS.map((n) => <label key={n.fieldname} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={c.y.includes(n.fieldname)} onChange={(e) => setC({ ...c, y: e.target.checked ? [...c.y, n.fieldname] : c.y.filter((x) => x !== n.fieldname) })} /> <span>{n.label}</span></label>)}
          </fieldset>
        </div>
        <DialogFooter>
          {current && <button type="button" className="btn-ghost" onClick={() => onSet(null)}>Remove Chart</button>}
          <button type="button" className="btn-primary" data-set-chart-submit disabled={!c.x || !c.y.length} onClick={() => onSet(c)}>Create</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
