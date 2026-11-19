import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { adapter } from "@/lib/adapter";
import { formatValue } from "@/lib/format";
import { reportCellTarget } from "@/lib/reportLinks";
import { applyCellFilters, sortRows, totalRow, type WbColumn, type WbRow } from "@/lib/reportWorkbench";
import { t, tLabel, useLang } from "@/i18n";
import { ReportDocLink, ReportPreviewScope } from "./DocPreview";

const NUM = new Set(["Currency", "Float", "Int", "Percent"]);
const exists = (dt: string, name: string) => !!adapter.get(dt, name);
/** A Data `party` cell whose row carries its `party_type` (General Ledger, Customer / Supplier Ledger, Trial Balance for Party). */
const isPartyData = (c: WbColumn, r: WbRow) => c.fieldname === "party" && c.fieldtype === "Data" && typeof r["party_type"] === "string" && !!r["party_type"];
/** Values that name a DocType or a source option are shown translated (stored value unchanged). */
// Data columns such as voucher_type / against_voucher_type / reference_doctype also hold DocType names (Accounts Receivable,
// General Ledger), so they are shown translated too (owner 2026-11-13: no English on Arabic report screens).
const DOCTYPE_NAME_COL = /(^|_)(voucher_type|doctype|document_type|reference_type|ref_doctype)$/;
const TRANSLATED_VALUE_COLS = (c: WbColumn) => (c.fieldtype === "Link" && c.options === "DocType") || c.fieldname === "party_type" || c.fieldname === "voucher_subtype" || c.fieldtype === "Select"
  || (c.fieldtype !== "Dynamic Link" && c.fieldtype !== "Link" && DOCTYPE_NAME_COL.test(c.fieldname));

export function displayCell(r: WbRow, c: WbColumn): string {
  const v = r[c.fieldname];
  if (v === undefined || v === null || v === "") return "";
  // visual round R3: every rate in a report reads with one decimal
  if (c.fieldtype === "Percent") return `${Number(v).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (NUM.has(c.fieldtype)) return formatValue(c.fieldtype, v);
  if (c.fieldtype === "Date") return formatValue("Date", v);
  return String(v);
}
/** Department names carry the company abbreviation ("Finance - DDT"); the screen shows the name only (the link keeps the record). */
const unitText = (s: string) => s.replace(/\s+-\s+[A-Z0-9]{2,6}$/, "");

export interface TableState { sort: { field: string; dir: "asc" | "desc" } | null; cellFilters: Record<string, string>; collapsed: Set<number> }

/**
 * Report datatable (frappe-datatable as used by query_report.js): header dropdown (Sort Ascending / Sort Descending /
 * Reset sorting / Remove column), inline filter row (>5, <10, =324, 5:10, text), tree rows with expand/collapse,
 * optional add_total_row footer and Link / Dynamic Link previews. Returns the shown rows through `onShown`
 * so Export / Print write exactly what is on screen.
 */
/** Accessible names for header controls; the header inputs carry data-no-i18n, so Arabic is composed here. */
const ariaOf = (kind: string, label: string) => (t(kind) === kind ? `${kind} ${label}` : `${t(kind)}: ${tLabel(label)}`);

export function ReportDataTable({ columns, rows, addTotalRow, tree, onRemoveColumn, state, setState, empty }: {
  columns: WbColumn[]; rows: WbRow[]; addTotalRow?: boolean | undefined; tree?: boolean | undefined;
  onRemoveColumn: (fieldname: string) => void; state: TableState; setState: (s: TableState) => void; empty?: ReactNode;
}) {
  const lang = useLang();
  const shownCols = columns.filter((c) => !c.hidden);
  const hasTree = tree || rows.some((r) => Number(r["indent"] ?? 0) > 0);
  const parents = useMemo(() => new Set(rows.flatMap((r, i) => (Number(rows[i + 1]?.["indent"] ?? 0) > Number(r["indent"] ?? 0) ? [i] : []))), [rows]);
  const visible = useMemo(() => {
    if (!hasTree || !state.collapsed.size) return rows.map((r, i) => [r, i] as const);
    const out: (readonly [WbRow, number])[] = []; let hideBelow: number | null = null;
    rows.forEach((r, i) => { const ind = Number(r["indent"] ?? 0); if (hideBelow !== null && ind > hideBelow) return; hideBelow = state.collapsed.has(i) ? ind : null; out.push([r, i] as const); });
    return out;
  }, [rows, hasTree, state.collapsed]);
  const filtered = useMemo(() => {
    const keep = new Set(applyCellFilters(visible.map(([r]) => r), shownCols, state.cellFilters, displayCell));
    return visible.filter(([r]) => keep.has(r));
  }, [visible, shownCols, state.cellFilters]);
  const sorted = useMemo(() => {
    const col = shownCols.find((c) => c.fieldname === state.sort?.field);
    if (!col || !state.sort) return filtered;
    const order = sortRows(filtered.map(([r]) => r), col, state.sort.dir);
    const idx = new Map(filtered.map(([r, i]) => [r, i] as const));
    return order.map((r) => [r, idx.get(r)!] as const);
  }, [filtered, shownCols, state.sort]);
  const footer = addTotalRow && sorted.length ? totalRow(sorted.map(([r]) => r), shownCols) : null;
  const doctypes = useMemo(() => [...new Set(shownCols.flatMap((c) => (c.fieldtype === "Link" && c.options ? [c.options] : c.fieldtype === "Dynamic Link" && c.options ? rows.map((r) => String(r[c.options!] ?? "")) : c.fieldname === "party" ? rows.map((r) => String(r["party_type"] ?? "")) : [])).filter(Boolean))], [shownCols, rows]);
  const setSort = (field: string, dir: "asc" | "desc" | null) => setState({ ...state, sort: dir ? { field, dir } : null });
  const toggle = (i: number) => { const c = new Set(state.collapsed); if (c.has(i)) c.delete(i); else c.add(i); setState({ ...state, collapsed: c }); };
  // display only (visual round R3 §3.8): bare department names, a blank department as «بدون قسم», inline data bars in rate /
  // amount columns and colour only past a limit the report took from a setting
  const barMax = useMemo(() => Object.fromEntries(shownCols.filter((c) => c.fieldtype === "Percent" || c.fieldtype === "Currency").map((c) => [c.fieldname, Math.max(0, ...rows.filter((r) => !r["is_total"] && !r["is_group"]).map((r) => Math.abs(Number(r[c.fieldname]) || 0)))])), [shownCols, rows]);
  const bar = (r: WbRow, c: WbColumn, node: ReactNode) => {
    const v = Number(r[c.fieldname]); const max = barMax[c.fieldname];
    if (!max || r["is_total"] || r["is_group"] || r[c.fieldname] === "" || r[c.fieldname] == null || !Number.isFinite(v)) return node;
    const over = c.alertAbove !== undefined && v > c.alertAbove;
    return <span className="r3-bar" {...(over ? { "data-over": "", title: lang === "ar" ? `فوق الحد ${c.alertAbove}%` : `Above the ${c.alertAbove}% limit` } : {})}><i style={{ width: `${Math.min(100, (Math.abs(v) / max) * 100)}%` }} /><span>{node}</span></span>;
  };
  const cell = (r: WbRow, c: WbColumn): ReactNode => (c.fieldtype === "Percent" || c.fieldtype === "Currency" ? bar(r, c, cellBody(r, c)) : cellBody(r, c));
  const cellBody = (r: WbRow, c: WbColumn) => {
    const dept = c.fieldtype === "Link" && c.options === "Department" && !r["is_total"] && !r["is_group"];
    const raw = displayCell(r, c);
    if (!raw) return dept && !r["is_blank"] ? <span data-dept-blank>{lang === "ar" ? "بدون قسم" : "No department"}</span> : "";
    const text = dept ? unitText(raw) : raw;
    // the native General Ledger / ledgers keep `party` as Data beside `party_type`; it still names a party record, so it
    // opens like a Dynamic Link (owner GL-03) — the column type and the stored value stay as in the source
    const linkCol = c.fieldtype === "Link" || c.fieldtype === "Dynamic Link" ? c : isPartyData(c, r) ? { ...c, fieldtype: "Dynamic Link", options: "party_type" } : null;
    const target = linkCol ? reportCellTarget(linkCol, r, exists) : null;
    if (target) return <ReportDocLink doctype={target.doctype} name={target.name} titled>{text}</ReportDocLink>;
    if (TRANSLATED_VALUE_COLS(c)) return <span data-value={text}>{lang === "ar" ? t(text) : text}</span>;
    // a group total reads "Total — <group>": the word is translated, the group (a record name) is shown as recorded
    if ((r["is_total"] || r["bold"]) && text.startsWith("Total — ")) return <span><span data-no-i18n>{lang === "ar" ? "الإجمالي — " : "Total — "}</span><bdi data-no-i18n>{text.slice(8)}</bdi></span>;
    return <span data-no-i18n={r["is_total"] || r["bold"] ? undefined : ""}>{text}</span>;
  };
  return (
    <ReportPreviewScope doctypes={doctypes}>
      <div className="panel min-w-0 overflow-auto" style={{ maxHeight: "70vh" }} data-report-table>
        <table className="w-full text-sm" data-report-rows={sorted.length}>
          <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-2 py-2 text-end font-normal" aria-label={t("Row number")} />
              {shownCols.map((c) => (
                <th key={c.fieldname} data-col-head={c.fieldname} className={`whitespace-nowrap px-3 py-2 font-medium ${NUM.has(c.fieldtype) ? "text-end" : "text-start"}`} style={{ minWidth: Math.min(Number(c.width ?? 120), 420) }}>
                  <span className="inline-flex items-center gap-1">
                    <span>{c.label}</span>
                    {state.sort?.field === c.fieldname && <span aria-hidden>{state.sort.dir === "asc" ? "↑" : "↓"}</span>}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button type="button" className="rounded p-0.5 hover:bg-card" aria-label={ariaOf("Column menu", c.label)} data-col-menu={c.fieldname}><MoreVertical className="h-3 w-3" /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onSelect={() => setSort(c.fieldname, "asc")}>Sort Ascending</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setSort(c.fieldname, "desc")}>Sort Descending</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setSort(c.fieldname, null)}>Reset sorting</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onRemoveColumn(c.fieldname)}>Remove column</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                </th>
              ))}
            </tr>
            <tr className="bg-card">
              <th />
              {shownCols.map((c) => (
                <th key={c.fieldname} className="px-1 py-1 font-normal">
                  <input className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs" data-cell-filter={c.fieldname} aria-label={ariaOf("Filter", c.label)} value={state.cellFilters[c.fieldname] ?? ""} onChange={(e) => setState({ ...state, cellFilters: { ...state.cellFilters, [c.fieldname]: e.target.value } })} data-no-i18n />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(([r, i], k) => (
              <tr key={i} className={`border-t border-border ${r["is_total"] ? "bg-muted/50 font-semibold" : r["bold"] ? "font-semibold" : ""}`} data-total-row={r["is_total"] ? "1" : undefined} data-group-row={r["is_group"] ? "1" : undefined} data-blank-row={r["is_blank"] ? "1" : undefined}>
                <td className="px-2 py-1.5 text-end text-[11px] text-muted-foreground tabular-nums" data-no-i18n>{k + 1}</td>
                {shownCols.map((c, ci) => (
                  <td key={c.fieldname} data-col={c.fieldname} className={`whitespace-nowrap px-3 py-1.5 ${NUM.has(c.fieldtype) ? "text-end tabular-nums" : ""}`} style={ci === 0 && hasTree ? { paddingInlineStart: `${12 + Number(r["indent"] ?? 0) * 18}px` } : undefined}>
                    {ci === 0 && hasTree && parents.has(i) && <button type="button" className="me-1 inline-flex align-middle" aria-label={t(state.collapsed.has(i) ? "Expand" : "Collapse")} data-tree-toggle onClick={() => toggle(i)}>{state.collapsed.has(i) ? <ChevronRight className="h-3 w-3 rtl:rotate-180" /> : <ChevronDown className="h-3 w-3" />}</button>}
                    {cell(r, c)}
                  </td>
                ))}
              </tr>
            ))}
            {!sorted.length && <tr><td className="px-3 py-10 text-center text-muted-foreground" colSpan={shownCols.length + 1} data-nothing-to-show>{empty ?? "Nothing to show"}</td></tr>}
          </tbody>
          {footer && (
            <tfoot className="sticky bottom-0 border-t border-border bg-muted font-semibold">
              <tr data-footer-total><td />{shownCols.map((c) => <td key={c.fieldname} className={`px-3 py-1.5 ${NUM.has(c.fieldtype) ? "text-end tabular-nums" : ""}`}>{displayCell(footer, c)}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    </ReportPreviewScope>
  );
}

/** Rows exactly as the datatable shows them (tree collapse, inline filters, sort) — Export and Print use this. */
export function shownRows(rows: WbRow[], columns: WbColumn[], state: TableState): WbRow[] {
  const shownCols = columns.filter((c) => !c.hidden);
  let out: WbRow[] = rows;
  if (state.collapsed.size) { const keep: WbRow[] = []; let hideBelow: number | null = null; rows.forEach((r, i) => { const ind = Number(r["indent"] ?? 0); if (hideBelow !== null && ind > hideBelow) return; hideBelow = state.collapsed.has(i) ? ind : null; keep.push(r); }); out = keep; }
  out = applyCellFilters(out, shownCols, state.cellFilters, displayCell);
  const col = shownCols.find((c) => c.fieldname === state.sort?.field);
  return col && state.sort ? sortRows(out, col, state.sort.dir) : out;
}
