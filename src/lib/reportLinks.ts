/**
 * Report-row document links (frappe/public/js/frappe/views/reports/link_side_panel.js handle_link_cell_click):
 * only Link and Dynamic Link columns open a document; the target DocType is the column's `options` (Link) or the
 * row's discriminator value (Dynamic Link, e.g. General Ledger voucher_no → voucher_type). Totals, opening/closing
 * lines and group headers are never documents, and a value that names no existing record stays plain text.
 */
export interface LinkColumn { fieldname: string; fieldtype: string; options?: string | undefined }
export interface DocTarget { doctype: string; name: string }

export function isSummaryRow(row: Record<string, unknown>): boolean {
  return !!row["is_total"] || !!row["is_group"];
}

/** The document a report cell points to, or null when the cell is not an eligible link. */
export function reportCellTarget(col: LinkColumn, row: Record<string, unknown>, exists: (doctype: string, name: string) => boolean): DocTarget | null {
  if (isSummaryRow(row)) return null;
  const raw = row[col.fieldname];
  if (raw === undefined || raw === null || raw === "" || typeof raw === "object") return null;
  const doctype = col.fieldtype === "Link" ? col.options : col.fieldtype === "Dynamic Link" && col.options ? String(row[col.options] ?? "") : "";
  if (!doctype) return null;
  const name = String(raw);
  return exists(doctype, name) ? { doctype, name } : null;
}

/** Plain left click previews; modifier / middle clicks keep the browser's normal link behaviour (open in new tab …). */
export function isPlainClick(e: { button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
}
