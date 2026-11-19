/**
 * Report workbench logic shared by every report screen (Script/Query reports with a local runner, Report Builder,
 * Custom Reports, server-only reports and plugin reports). Ports of frappe/public/js/frappe/views/reports/
 * query_report.js (get_menu_items, export_report, get_filters_html_for_print, save_report dialog),
 * report_utils.js (get_export_dialog), frappe/desk/query_report.py (save_report, export_query / build_xlsx_data) and
 * frappe-datatable filterRows (inline column filters).
 *
 * Everything here runs on the rows the screen already shows: Export and Print/PDF write the current filtered,
 * sorted, visible columns; nothing is sent to a Frappe server. Server-only items (Export in Background, Prepared
 * Report, Auto Email delivery) are marked SERVER_REQUIRED by the caller.
 */
import { adapter, type Doc } from "./adapter";
import { currentUser, userRoles } from "./session";
import { plainMoney } from "./format";

export interface WbColumn { fieldname: string; label: string; fieldtype: string; options?: string | undefined; width?: number | undefined; hidden?: number | undefined; /** display only: values above this limit (from a setting) are coloured */ alertAbove?: number | undefined }
export type WbRow = Record<string, unknown>;

// ---------------- menu (query_report.js get_menu_items) ----------------
export type MenuId = "refresh" | "edit" | "documentation" | "print" | "pdf" | "export" | "auto_email" | "add_column" | "user_permissions" | "save";
export interface MenuItem { id: MenuId; label: string; mobileOnly?: boolean }
export interface MenuCtx { roles: string[]; canPrint: boolean; canExport: boolean; documentationUrl?: string | null | undefined; hasLinkColumns: boolean }
/** frappe.user.is_report_manager */
export const isReportManager = (roles: string[]) => roles.some((r) => r === "Administrator" || r === "System Manager" || r === "Report Manager");
/** frappe.model.can_export: System Manager always, otherwise the export permission. */
export const canExportWith = (roles: string[], exportPerm: boolean) => roles.includes("System Manager") || roles.includes("Administrator") || exportPerm;

export function reportMenuItems(ctx: MenuCtx): MenuItem[] {
  const items: MenuItem[] = [{ id: "refresh", label: "Refresh", mobileOnly: true }];
  if (isReportManager(ctx.roles)) items.push({ id: "edit", label: "Edit" });
  if (ctx.documentationUrl) items.push({ id: "documentation", label: "Documentation" });
  if (ctx.canPrint) items.push({ id: "print", label: "Print" }, { id: "pdf", label: "PDF" });
  if (ctx.canExport) items.push({ id: "export", label: "Export" });
  items.push({ id: "auto_email", label: "Setup Auto Email" });
  if (ctx.hasLinkColumns) items.push({ id: "add_column", label: "Add Column" });
  if (ctx.roles.includes("System Manager") || ctx.roles.includes("Administrator")) items.push({ id: "user_permissions", label: "User Permissions" });
  if (isReportManager(ctx.roles)) items.push({ id: "save", label: "Save" });
  return items;
}
export const sessionRoles = () => userRoles(currentUser());

// ---------------- inline column filters (frappe-datatable filterRows) ----------------
export type CellFilter = { op: "contains" | "=" | "!=" | ">" | "<" | ">=" | "<=" | "range"; a: string; b?: string };
export function parseCellFilter(raw: string): CellFilter | null {
  const s = raw.trim(); if (!s) return null;
  const m = s.match(/^(>=|<=|!=|>|<|=)\s*(.*)$/);
  if (m) return { op: m[1] as CellFilter["op"], a: m[2]!.trim() };
  const r = s.match(/^([^:]+):([^:]+)$/);
  if (r) return { op: "range", a: r[1]!.trim(), b: r[2]!.trim() };
  return { op: "contains", a: s };
}
const NUMERIC = new Set(["Currency", "Float", "Int", "Percent"]);
const num = (v: unknown) => Number(String(v ?? "").replace(/,/g, ""));
export function cellMatches(value: unknown, fieldtype: string, f: CellFilter, shown?: string): boolean {
  const isNum = NUMERIC.has(fieldtype);
  const cmp = (x: string) => (isNum ? num(value) - num(x) : String(value ?? "").localeCompare(x));
  switch (f.op) {
    case "contains": return (shown ?? String(value ?? "")).toLowerCase().includes(f.a.toLowerCase());
    case "=": return isNum ? num(value) === num(f.a) : String(value ?? "").toLowerCase() === f.a.toLowerCase();
    case "!=": return isNum ? num(value) !== num(f.a) : String(value ?? "").toLowerCase() !== f.a.toLowerCase();
    case ">": return cmp(f.a) > 0;
    case "<": return cmp(f.a) < 0;
    case ">=": return cmp(f.a) >= 0;
    case "<=": return cmp(f.a) <= 0;
    case "range": return cmp(f.a) >= 0 && cmp(f.b ?? f.a) <= 0;
  }
}
/** Rows matching every column filter; the add_total_row footer is recomputed by the caller. */
export function applyCellFilters(rows: WbRow[], cols: WbColumn[], filters: Record<string, string>, shown?: (r: WbRow, c: WbColumn) => string): WbRow[] {
  const active = cols.flatMap((c) => { const p = parseCellFilter(filters[c.fieldname] ?? ""); return p ? [[c, p] as const] : []; });
  if (!active.length) return rows;
  return rows.filter((r) => active.every(([c, p]) => cellMatches(r[c.fieldname], c.fieldtype, p, shown?.(r, c))));
}
/** Datatable column sort: stable, numeric for number columns, empty values last. */
export function sortRows(rows: WbRow[], col: WbColumn | undefined, dir: "asc" | "desc" | null): WbRow[] {
  if (!col || !dir) return rows;
  const isNum = NUMERIC.has(col.fieldtype); const k = dir === "asc" ? 1 : -1;
  return rows.map((r, i) => [r, i] as const).sort(([a, ia], [b, ib]) => {
    const va = a[col.fieldname], vb = b[col.fieldname];
    const ea = va === undefined || va === null || va === "", eb = vb === undefined || vb === null || vb === "";
    if (ea || eb) return ea === eb ? ia - ib : ea ? 1 : -1;
    const c = isNum ? num(va) - num(vb) : String(va).localeCompare(String(vb), undefined, { numeric: true });
    return c ? c * k : ia - ib;
  }).map(([r]) => r);
}
/** add_total_row: sum of numeric columns over the shown rows (frappe datatable getTotalRow). */
export function totalRow(rows: WbRow[], cols: WbColumn[]): WbRow {
  const out: WbRow = { is_total: true, bold: true, __footer: true };
  cols.forEach((c, i) => { if (NUMERIC.has(c.fieldtype) && c.fieldtype !== "Percent") out[c.fieldname] = Math.round(rows.reduce((s, r) => s + (Number(r[c.fieldname]) || 0), 0) * 100) / 100; else if (i === 0) out[c.fieldname] = "Total"; });
  return out;
}

// ---------------- export (export_query / build_xlsx_data) ----------------
export interface ExportOpts { includeFilters?: boolean; appliedFilters?: Record<string, string>; includeIndentation?: boolean; includeHidden?: boolean }
/** Applied filter rows, a blank row, the header (labels, hidden columns dropped) and the shown rows. */
export function exportMatrix(cols: WbColumn[], rows: WbRow[], o: ExportOpts = {}): (string | number | null)[][] {
  const out: (string | number | null)[][] = [];
  if (o.includeFilters && o.appliedFilters && Object.keys(o.appliedFilters).length) {
    for (const [k, v] of Object.entries(o.appliedFilters)) if (v) out.push([k, v]);
    out.push([]);
  }
  const shown = cols.filter((c) => !c.hidden || o.includeHidden);
  out.push(shown.map((c) => c.label));
  for (const r of rows) {
    if (r["is_blank"]) { out.push(shown.map(() => null)); continue; }
    out.push(shown.map((c, i) => {
      const v = r[c.fieldname];
      if (v === undefined || v === null || v === "") return i === 0 && o.includeIndentation && Number(r["indent"]) ? "    ".repeat(Number(r["indent"])) : null;
      if (NUMERIC.has(c.fieldtype) && typeof v !== "object") { const x = Number(v); return Number.isFinite(x) ? x : String(v); }
      const s = String(v);
      return i === 0 && o.includeIndentation && Number(r["indent"]) ? "    ".repeat(Number(r["indent"])) + s : s;
    }));
  }
  return out;
}
/** Python csv writer quoting: 0 Minimal, 1 All, 2 Non-numeric (default), 3 None. */
export function toCsv(matrix: (string | number | null)[][], delimiter = ",", quoting = 2, decimalSep = "."): string {
  const d = delimiter || ",";
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return quoting === 1 || quoting === 2 ? '""' : "";
    if (typeof v === "number") { const s = quoting !== 2 && decimalSep !== "." ? String(v).replace(".", decimalSep) : String(v); return quoting === 1 ? `"${s}"` : s; }
    v = plainMoney(v);
    const needs = v.includes(d) || v.includes('"') || v.includes("\n") || v.includes("\r");
    if (quoting === 3) return v.replace(/(["\\])/g, "\\$1");
    if (quoting === 1 || quoting === 2 || needs) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return matrix.map((r) => r.map(cell).join(d)).join("\r\n") + "\r\n";
}
export async function toXlsx(matrix: (string | number | null)[][], sheet: string, widths: number[]): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(matrix.map((r) => r.map((v) => (v === null ? "" : v))));
  ws["!cols"] = widths.map((w) => ({ wch: Math.max(8, Math.round(w / 7)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}
export function download(name: string, data: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** query_report.js get_pdf_filename */
export function pdfFileName(report: string, applied: Record<string, string>): string {
  const vals: string[] = []; let len = 0;
  for (const v of Object.values(applied)) { if (!v) continue; len += v.length; if (len > 200) break; vals.push(v); }
  return vals.length ? `${report}_${vals.join("_")}.pdf` : `${report}.pdf`;
}

// ---------------- Custom Reports (query_report.py save_report) ----------------
export interface CustomReportJson { columns: string[]; filters: Record<string, string> }
export function customReportJson(d: Doc | undefined): CustomReportJson | null {
  if (!d || d["report_type"] !== "Custom Report") return null;
  try { const j = JSON.parse(String(d["json"] ?? "{}")) as { columns?: unknown; filters?: unknown }; return { columns: Array.isArray(j.columns) ? j.columns.map((c) => (typeof c === "string" ? c : String((c as { fieldname?: string }).fieldname ?? ""))).filter(Boolean) : [], filters: j.filters && typeof j.filters === "object" ? Object.fromEntries(Object.entries(j.filters as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? JSON.stringify(v) : String(v ?? "")])) : {} }; } catch { return { columns: [], filters: {} }; }
}
/**
 * save_report(reference_report, report_name, columns, filters): updates the Custom Report of that name (is_standard
 * No) or inserts a new one with the base report's ref_doctype. Returns [name, created]. `insert` is the adapter-backed
 * creation path (documentApi with the Report meta), so the record is a normal Report document every view reads.
 */
/** Standard Report names live in the frozen catalog (not in the adapter); `reserved` reports them so a Custom Report can never take a standard name (Report insert → DuplicateEntryError). */
export function saveCustomReport(base: { name: string; ref_doctype?: string | null; module?: string }, reportName: string, columns: string[], filters: Record<string, string>, insert: (init: Record<string, unknown>) => string, reserved: (name: string) => boolean = () => false): { name: string; created: boolean } {
  const rn = reportName.trim();
  if (!rn) throw new Error("Report Name is mandatory");
  const json = JSON.stringify({ columns, filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "" && v !== undefined).map(([k, v]) => [k, v.startsWith("[") ? safeJson(v) : v])) });
  const existing = adapter.list("Report").find((r) => r["report_name"] === rn && r["is_standard"] === "No" && r["report_type"] === "Custom Report");
  if (existing) { adapter.update("Report", existing.name, { json }); return { name: existing.name, created: false }; }
  if (adapter.get("Report", rn) || reserved(rn)) throw new Error(`Report ${rn} already exists`);
  const name = insert({ name: rn, report_name: rn, json, ref_doctype: base.ref_doctype ?? "", is_standard: "No", report_type: "Custom Report", reference_report: base.name, module: base.module ?? "", disabled: 0 });
  return { name, created: true };
}
const safeJson = (s: string): unknown => { try { return JSON.parse(s); } catch { return s; } };
/** set_related_reports_dropdown: enabled Custom Reports saved from the same base (+ the base when viewing a variant). */
export function relatedReports(current: string, base: string): { name: string; label: string }[] {
  const sib = adapter.list("Report").filter((r) => r["reference_report"] === base && r["report_type"] === "Custom Report" && !Number(r["disabled"] ?? 0) && r.name !== current)
    .map((r) => ({ name: r.name, label: String(r["report_name"] ?? r.name) })).sort((a, b) => a.label.localeCompare(b.label));
  return base !== current ? [{ name: base, label: base }, ...sib] : sib;
}
