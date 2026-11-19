import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BandWatermark } from "@/components/enterprise/BandMark";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, MoreHorizontal, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DevOnly } from "@/components/DevOnly";
import { adapter } from "@/lib/adapter";
import { currentUser, hasPerm, useSessionUser, type PType } from "@/lib/session";
import { cachedMeta, reportsQuery } from "@/lib/catalog";
import { canReadType } from "@/lib/scope";
import { t as tr, useLang } from "@/i18n";
import { useEnterprise } from "@/plugins/enterprise";
import { download, exportMatrix, pdfFileName, relatedReports, reportMenuItems, saveCustomReport, sessionRoles, toCsv, toXlsx, type MenuId, type WbColumn, type WbRow } from "@/lib/reportWorkbench";
import { buildPrintHtml, openPrint, savePdf } from "@/lib/reportPrint";
import type { ReportSpec } from "@/lib/reportSpecs";
import { ReportDataTable, displayCell, shownRows, type TableState } from "./ReportDataTable";
import { ReportFilterBar } from "./ReportFilterBar";
import type { WbFilter } from "@/lib/reportSpecs";
import { AddColumnDialog, ExportDialog, PrintDialog, SaveReportDialog, SetChartDialog, type AddColumnChoice, type ChartChoice } from "./ReportDialogs";

export interface WorkbenchReport {
  name: string; title: string; base: string; module: string; app: string; refDoctype: string | null; reportType: string; isCustom: boolean;
  isStandard: boolean; source?: string | undefined; calculation?: string | undefined; savedColumns?: string[] | undefined;
}
export interface WorkbenchResult { columns: WbColumn[]; rows: WbRow[]; error?: string | undefined }

const colKey = (user: string, report: string) => `digit-virtual-core:report-columns:${user}:${report}`;
const readCols = (report: string): { removed: string[]; added: AddColumnChoice[] } => {
  if (typeof window === "undefined") return { removed: [], added: [] };
  try { const v = JSON.parse(localStorage.getItem(colKey(currentUser(), report)) ?? "{}") as { removed?: unknown; added?: unknown }; return { removed: Array.isArray(v.removed) ? v.removed.map(String) : [], added: Array.isArray(v.added) ? (v.added as AddColumnChoice[]) : [] }; } catch { return { removed: [], added: [] }; }
};
const scrub = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");
const CHART_COLORS = ["var(--color-primary)", "var(--color-chart-2, var(--color-accent))", "var(--color-chart-3, var(--color-warning))", "var(--color-chart-4, var(--color-success))", "var(--color-chart-5, var(--color-destructive))"];

/**
 * Report page shared by every report kind (query_report.js QueryReport): page head with Related Reports, Actions,
 * Refresh and the source menu, the filter area, messages (validation error, "Please set filters", server boundary),
 * optional chart, the datatable and its footer. `result === null` means the rows are produced only by the Frappe
 * server; the page still offers the source filters and the actions that do not need rows.
 */
export function ReportWorkbench({ report, spec, filters, values, onChange, result, boundary, execMs, extras, onRefresh, addTotalRow, embedded }: {
  report: WorkbenchReport; spec?: ReportSpec | undefined; filters: WbFilter[]; values: Record<string, string>; onChange: (k: string, v: string) => void;
  result: WorkbenchResult | null; boundary?: ReactNode; execMs?: number | undefined; extras?: ReactNode; onRefresh: () => void; addTotalRow?: boolean | undefined;
  /** inside another page (e.g. Pro General Ledger): a card header replaces the page band, every native action stays */
  embedded?: boolean | undefined;
}) {
  const user = useSessionUser(); const lang = useLang(); const nav = useNavigate();
  // SH-027 freshness: when the rows on screen were computed from the records (a new result on every filter, refresh or record change)
  const generated = useMemo(() => new Date(), [result]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cols, setCols] = useState<{ removed: string[]; added: AddColumnChoice[] }>({ removed: [], added: [] });
  useEffect(() => { const saved = readCols(report.name); if (!saved.removed.length && report.savedColumns?.length && result) saved.removed = result.columns.map((c) => c.fieldname).filter((f) => !report.savedColumns!.includes(f)); setCols(saved); }, [report.name, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const persistCols = (next: typeof cols) => { setCols(next); try { localStorage.setItem(colKey(currentUser(), report.name), JSON.stringify(next)); } catch { /* storage disabled */ } };
  const [table, setTable] = useState<TableState>({ sort: null, cellFilters: {}, collapsed: new Set() });
  const [dialog, setDialog] = useState<null | "export" | "print" | "pdf" | "save" | "add_column" | "chart">(null);
  const [saveErr, setSaveErr] = useState<string>();
  const [chart, setChart] = useState<ChartChoice | null>(null);
  const roles = useMemo(() => sessionRoles(), [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: catalogReports } = useQuery(reportsQuery);

  // columns: source columns − removed, + Add Column fields (values read from the linked record)
  const columns: WbColumn[] = useMemo(() => {
    const base = (result?.columns ?? []).map((c) => (cols.removed.includes(c.fieldname) ? { ...c, hidden: 1 } : c));
    for (const a of cols.added) {
      const col: WbColumn = { fieldname: `${a.field}-${scrub(a.doctype)}`, label: a.label, fieldtype: a.fieldtype === "Link" ? "Data" : a.fieldtype, width: 120 };
      const at = a.insertAfter ? base.findIndex((c) => c.fieldname === a.insertAfter) : -1;
      if (!base.some((c) => c.fieldname === col.fieldname)) base.splice(at >= 0 ? at + 1 : base.length, 0, col);
    }
    return base;
  }, [result, cols]);
  const rows: WbRow[] = useMemo(() => {
    const src = result?.rows ?? [];
    if (!cols.added.length) return src;
    return src.map((r) => { const o: WbRow = { ...r }; for (const a of cols.added) { const linked = r[a.linkField] ? adapter.get(a.doctype, String(r[a.linkField])) : undefined; o[`${a.field}-${scrub(a.doctype)}`] = linked && canReadType(a.doctype) ? linked[a.field] : ""; } return o; });
  }, [result, cols.added]);

  const missing = filters.filter((f) => Number(f.reqd ?? 0) && f.applied && !values[f.fieldname]).map((f) => f.label ?? f.fieldname);
  const applied = Object.fromEntries(filters.filter((f) => values[f.fieldname]).map((f) => [f.label ?? f.fieldname, f.fieldtype === "Check" ? (values[f.fieldname] === "1" ? "Yes" : "No") : values[f.fieldname]!]));
  const refPerm = (ptype: "print" | "export") => { if (!report.refDoctype) return roles.includes("System Manager") || roles.includes("Administrator"); return canReadType(report.refDoctype) && (ptype === "print" ? hasType(report.refDoctype, "print") : hasType(report.refDoctype, "export")); };
  const menu = reportMenuItems({ roles, canPrint: refPerm("print"), canExport: roles.includes("System Manager") || roles.includes("Administrator") || refPerm("export"), documentationUrl: spec?.documentation_url, hasLinkColumns: columns.some((c) => c.fieldtype === "Link" && c.options && c.options !== "DocType") });
  const related = relatedReports(report.name, report.base);
  const visibleCols = columns.filter((c) => !c.hidden);
  const shown = () => shownRows(rows, columns, table);

  const act = async (id: MenuId) => {
    if (id === "refresh") { onRefresh(); return; }
    if (id === "edit") { ensureReportRecord(report, spec); void nav({ to: "/app/$app/$doctype/$name", params: { app: "frappe", doctype: "report", name: report.name } }); return; }
    if (id === "documentation" && spec?.documentation_url) { window.open(spec.documentation_url, "_blank", "noopener"); return; }
    if (id === "auto_email") { void nav({ to: "/app/$app/$doctype", params: { app: "frappe", doctype: "auto_email_report" }, search: { filters: JSON.stringify([["report", "=", report.name]]) } as never }); return; }
    if (id === "user_permissions") { void nav({ to: "/app/$app/$doctype", params: { app: "frappe", doctype: "user_permission" }, search: { filters: JSON.stringify([["allow", "=", "Report"], ["for_value", "=", report.name]]) } as never }); return; }
    if (id === "export" || id === "print" || id === "pdf" || id === "add_column") { if (!result || !rows.length) { toast.error("No data to export", { description: "You can try changing the filters of your report." }); return; } }
    setSaveErr(undefined); setDialog(id as typeof dialog);
  };
  const doExport = async (c: { format: "Excel" | "CSV"; delimiter: string; quoting: number; decimalSep: string; includeFilters: boolean; includeIndentation: boolean }) => {
    const data = shown();
    const m = exportMatrix(visibleCols, data, { includeFilters: c.includeFilters, appliedFilters: applied, includeIndentation: c.includeIndentation });
    if (c.format === "CSV") download(`${report.title}.csv`, toCsv(m, c.delimiter, c.quoting, c.decimalSep), "text/csv;charset=utf-8");
    else download(`${report.title}.xlsx`, (await toXlsx(m, report.title, visibleCols.map((x) => Number(x.width ?? 120)))) as BlobPart, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    logAccess(report.name, "Export", c.format);
    setDialog(null);
  };
  const doPrint = async (mode: "print" | "pdf", c: { letterHead: string; orientation: "Landscape" | "Portrait"; includeFilters: boolean; columns: string[] }) => {
    const pc = visibleCols.filter((x) => c.columns.includes(x.fieldname));
    const html = buildPrintHtml({ title: report.title, columns: pc.map((x) => ({ label: x.label, numeric: ["Currency", "Float", "Int", "Percent"].includes(x.fieldtype) })), rows: shown().map((r) => ({ cells: pc.map((x) => displayCell(r, x)), bold: !!(r["is_total"] || r["bold"]), indent: Number(r["indent"] ?? 0) })),
      filters: Object.entries(applied), includeFilters: c.includeFilters, orientation: c.orientation, letterHead: c.letterHead || undefined, dir: lang === "ar" ? "rtl" : "ltr", lang, printedOn: new Date().toLocaleString(lang === "ar" ? "ar" : "en") });
    setDialog(null);
    if (mode === "print") { if (!openPrint(html)) toast.error("Please enable pop-ups"); logAccess(report.name, "Print", "Print"); }
    else { const pages = await savePdf(html, pdfFileName(report.title, applied), c.orientation); (window as unknown as { __lastReportPdfPages?: number }).__lastReportPdfPages = pages; logAccess(report.name, "PDF", "PDF"); }
  };
  const doSave = (name: string) => {
    try {
      const res = saveCustomReport({ name: report.base, ref_doctype: report.refDoctype, module: report.module }, name, visibleCols.map((c) => c.fieldname), values, (init) => adapter.insertDoc("Report", init).name, (n) => !!catalogReports?.some((r) => r.name === n));
      toast.success(res.created ? `${res.name} saved successfully` : "Report updated successfully");
      setDialog(null);
      void nav({ to: "/report/$name", params: { name: res.name } });
    } catch (e) { setSaveErr(e instanceof Error ? e.message : String(e)); }
  };
  const ent = useEnterprise();
  const sourceActions = (spec?.onload_actions ?? []).filter((a) => a.kind !== "primary_action");
  const canChart = hasType("Dashboard Chart", "create"); const canCard = hasType("Number Card", "create");

  return (
    <div data-report-workbench={report.name} data-report-kind={result ? "local" : "server"}>
      {/* ONE STANDARD (owner 2026-11-12): in DIGIT the report header is the shared band with its actions, then the filter bar and the result in cards */}
      <div className={embedded ? "ek-card ek-card-pad flex flex-wrap items-center gap-2" : ent.on ? "ek-context ek-list-band" : "flex flex-wrap items-center gap-2"} data-tone={ent.on && !embedded ? "brand" : undefined} data-ek-context={ent.on && !embedded ? "" : undefined} data-report-band={embedded ? "embedded" : ent.on ? "" : undefined}>
        {embedded ? <div className="me-auto min-w-0"><p className="text-xs text-muted-foreground">{lang === "ar" ? "التقرير الأصلي" : "Native report"}</p><h2 className="text-base font-semibold" data-report-title>{report.title}</h2></div>
          : ent.on ? <div className="ek-context-main"><span className="ek-context-icon" aria-hidden><img src="/icons/digit/mod/digit-mod-reports-dark.svg" alt="" /></span>
          <div className="min-w-0"><p className="ek-eyebrow">{report.module ? tr(report.module) : lang === "ar" ? "التقارير" : "Reports"}</p><h1 className="ek-h1" data-report-title>{report.title}</h1></div></div>
          : <h1 className="me-auto text-xl font-semibold" data-report-title>{report.title}</h1>}
        {ent.on && !embedded && <BandWatermark />}
        <div className={ent.on && !embedded ? "ek-context-actions" : "contents"}>
        {related.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="btn-ghost" data-related-reports>Related Reports <ChevronsUpDown className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">{related.map((r) => <DropdownMenuItem key={r.name} onSelect={() => void nav({ to: "/report/$name", params: { name: r.name } })}><span data-no-i18n={r.name !== report.base ? "" : undefined}>{r.label}</span></DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" className="btn-ghost" data-report-actions>Actions <ChevronsUpDown className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canChart && <DropdownMenuItem disabled={!result || !rows.length} onSelect={() => setDialog("chart")} data-action="set-chart">Set Chart</DropdownMenuItem>}
            {canChart && <DropdownMenuItem disabled title="A report-based Dashboard Chart is computed by the DIGIT server" data-action="add-chart-to-dashboard">Add Chart to Dashboard</DropdownMenuItem>}
            {canCard && <DropdownMenuItem disabled title="A report-based Number Card is computed by the DIGIT server" data-action="create-card">Create Card</DropdownMenuItem>}
            {sourceActions.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel className="text-[11px] text-muted-foreground">{report.base}</DropdownMenuLabel></>}
            {sourceActions.map((a) => {
              const target = a.kind === "custom_menu_item" && a.label !== report.base ? a.label : null;
              return target ? <DropdownMenuItem key={a.label} data-action={`source:${a.label}`} onSelect={() => void nav({ to: "/report/$name", params: { name: target }, search: { filters: JSON.stringify(values) } as never })}>{a.label}</DropdownMenuItem>
                : <DropdownMenuItem key={a.label} disabled title="Runs the report's source JavaScript on the DIGIT desk" data-action={`source:${a.label}`}>{a.label}</DropdownMenuItem>;
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className="btn-ghost hidden px-2 sm:inline-flex" aria-label="Reload Report" title="Reload Report" data-report-refresh onClick={onRefresh}><RefreshCw className="h-4 w-4" /></button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" className="btn-ghost px-2" aria-label="Menu" data-report-menu><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.map((m) => <DropdownMenuItem key={m.id} className={m.mobileOnly ? "sm:hidden" : undefined} data-menu={m.id} onSelect={() => void act(m.id)}>{m.label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
      <DevOnly><p className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground" data-report-dev-meta><span className="chip bg-muted">{report.reportType}</span>{report.refDoctype && <span data-no-i18n>ref: {report.refDoctype}</span>}<span className="break-all font-mono" data-no-i18n>{report.source}</span>{report.calculation && <span data-no-i18n>{report.calculation}</span>}</p></DevOnly>

      <div className={ent.on ? "ek-card ek-filterbar mt-3" : undefined} data-list-filterbar={ent.on ? "" : undefined}><ReportFilterBar filters={filters} values={values} onChange={onChange} collapsible={spec?.collapsible_filters} separateChecks={spec?.separate_check_filters} /></div>
      {extras}

      <div className={ent.on ? "mt-3 ek-card ek-card-pad" : "mt-3"} data-report-result>
        {missing.length > 0 ? <Message tone="info" data="missing-filters"><span>Please set filters</span>: {missing.map((m, i) => <span key={m}>{i > 0 && (lang === "ar" ? "، " : ", ")}<span>{m}</span></span>)}</Message>
          : !result ? boundary
          : result.error ? <Message tone="error" data="report-error">{result.error}</Message>
          : <>
            {chart && <ReportChart chart={chart} columns={columns} rows={shown().filter((r) => !r["is_total"] && !r["is_blank"])} />}
            <ReportDataTable columns={columns} rows={rows} addTotalRow={addTotalRow} tree={spec?.tree} state={table} setState={setTable} onRemoveColumn={(f) => persistCols({ ...cols, removed: [...new Set([...cols.removed, f])], added: cols.added.filter((a) => `${a.field}-${scrub(a.doctype)}` !== f) })} />
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground" data-report-footer>
              {(spec?.tree || rows.some((r) => Number(r["indent"] ?? 0) > 0)) && <span className="flex gap-2"><button type="button" className="hover:underline" data-collapse-all onClick={() => setTable({ ...table, collapsed: new Set(rows.flatMap((r, i) => (Number(rows[i + 1]?.["indent"] ?? 0) > Number(r["indent"] ?? 0) ? [i] : []))) })}>Collapse All</button><button type="button" className="hover:underline" data-expand-all onClick={() => setTable({ ...table, collapsed: new Set() })}>Expand All</button></span>}
              {cols.removed.length > 0 && <button type="button" className="hover:underline" data-restore-columns onClick={() => persistCols({ ...cols, removed: [] })}>Show all columns</button>}
              <span>For comparison, use &gt;5, &lt;10 or =324. For ranges, use 5:10 (for values between 5 &amp; 10).</span>
              <span className="ms-auto" data-report-freshness={generated.toISOString()}>{lang === "ar" ? "احتُسب في" : "Computed at"} <bdi dir="ltr" data-no-i18n>{generated.toLocaleTimeString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</bdi> {lang === "ar" ? "من السجلات المرحّلة" : "from the posted records"}</span>
              <span data-execution-time>{`Execution Time: ${Math.max(0.001, (execMs ?? 0) / 1000).toFixed(3)} sec`}</span>
            </div>
          </>}
      </div>

      <ExportDialog open={dialog === "export"} onClose={() => setDialog(null)} report={report.title} columns={visibleCols} rows={dialog === "export" ? shown() : []} applied={applied} tree={!!spec?.tree || rows.some((r) => Number(r["indent"] ?? 0) > 0)} onDownload={doExport} />
      <PrintDialog open={dialog === "print" || dialog === "pdf"} mode={dialog === "pdf" ? "pdf" : "print"} onClose={() => setDialog(null)} columns={visibleCols} defaultLetterHead={spec?.letter_head} onGo={(c) => void doPrint(dialog === "pdf" ? "pdf" : "print", c)} />
      <SaveReportDialog open={dialog === "save"} onClose={() => setDialog(null)} defaultName={report.isStandard ? "" : report.name} onSave={doSave} error={saveErr} />
      <AddColumnDialog open={dialog === "add_column"} onClose={() => setDialog(null)} columns={columns} onAdd={(a) => { persistCols({ ...cols, added: [...cols.added.filter((x) => !(x.doctype === a.doctype && x.field === a.field)), a] }); setDialog(null); }} />
      <SetChartDialog open={dialog === "chart"} onClose={() => setDialog(null)} columns={visibleCols} current={chart} onSet={(c) => { setChart(c); setDialog(null); }} />
    </div>
  );
}

function Message({ tone, data, children }: { tone: "info" | "error"; data: string; children: ReactNode }) {
  return <div role={tone === "error" ? "alert" : "status"} data-report-message={data} className={`rounded-lg border p-6 text-center text-sm ${tone === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-border text-muted-foreground"}`}>{children}</div>;
}

function ReportChart({ chart, columns, rows }: { chart: ChartChoice; columns: WbColumn[]; rows: WbRow[] }) {
  const label = (f: string) => columns.find((c) => c.fieldname === f)?.label ?? f;
  const data = rows.slice(0, 50).map((r) => ({ x: String(r[chart.x] ?? ""), ...Object.fromEntries(chart.y.map((y) => [y, Number(r[y]) || 0])) }));
  return (
    <div className="panel mb-3 h-64 p-2" data-report-chart={chart.type}>
      <ResponsiveContainer width="100%" height="100%">
        {chart.type === "Pie" ? (
          <PieChart><Tooltip /><Legend /><Pie data={data} dataKey={chart.y[0]!} nameKey="x" outerRadius={90}>{data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie></PieChart>
        ) : chart.type === "Line" ? (
          <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="x" hide={data.length > 20} /><YAxis /><Tooltip /><Legend />{chart.y.map((y, i) => <Line key={y} dataKey={y} name={label(y)} stroke={CHART_COLORS[i % CHART_COLORS.length]} dot={false} />)}</LineChart>
        ) : (
          <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="x" hide={data.length > 20} /><YAxis /><Tooltip /><Legend />{chart.y.map((y, i) => <Bar key={y} dataKey={y} name={label(y)} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Permission of the session user on a DocType through the shared session rules (meta loaded by the scope layer). */
function hasType(dt: string, ptype: PType): boolean { const m = cachedMeta(dt); if (!m) return currentUser() === "Administrator"; return hasPerm(m, ptype); }

/** Edit opens the Report document; a standard report exists in the catalog, so its Report record is created on first open (is_standard Yes). */
function ensureReportRecord(r: WorkbenchReport, spec?: ReportSpec) {
  if (adapter.get("Report", r.name)) return;
  adapter.insertDoc("Report", { name: r.name, report_name: r.name, ref_doctype: r.refDoctype ?? "", report_type: r.reportType, is_standard: "Yes", module: r.module, add_total_row: spec?.add_total_row ?? 0, prepared_report: spec?.prepared_report ?? 0, documentation_url: spec?.documentation_url ?? "", default_print_format: spec?.default_print_format ?? "", disabled: 0, roles: (spec?.roles ?? []).map((role) => ({ role })) });
}
/** make_access_log (Access Log records: export / print / pdf of a report). */
function logAccess(report: string, method: string, fileType: string) {
  adapter.insertDoc("Access Log", { user: currentUser(), export_from: report, report_name: report, method, file_type: fileType, page: `/report/${report}`, timestamp: new Date().toISOString() });
}
