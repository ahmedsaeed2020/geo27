import type { DocTypeMeta, DocField } from "@/lib/catalog";
import { LAYOUT_TYPES, TABLE_TYPES } from "@/lib/catalog";
import { adapter, type Doc } from "@/lib/adapter";
import { reportCellTarget } from "@/lib/reportLinks";
import { formatValue } from "@/lib/format";
import { ReportDocLink, ReportPreviewScope } from "./DocPreview";

const exists = (dt: string, name: string) => !!adapter.get(dt, name);

/**
 * Generic report preview listing (spec §7): rows are the adapter's ref_doctype records (not execute()). Link and
 * Dynamic Link cells use the shared linked-document preview (DocPreview.tsx) — read-only side panel / mobile sheet
 * when Settings › Reports › Split view is on, normal full-form navigation when off.
 */
export function SplitReport({ ref_, rows }: { ref_: DocTypeMeta; rows: Doc[] }) {
  const t0 = performance.now();
  const cols = ref_.fields.filter((f) => f.fieldname && !LAYOUT_TYPES.has(f.fieldtype) && !TABLE_TYPES.has(f.fieldtype) && (f.in_list_view || f.in_standard_filter || ["Link", "Dynamic Link", "Currency", "Date"].includes(f.fieldtype))).filter((f) => rows.some((d) => d[f.fieldname!] !== undefined && d[f.fieldname!] !== "" && d[f.fieldname!] !== 0)).slice(0, 10);
  const shown = rows.slice(0, 500);
  const doctypes = [...new Set(cols.flatMap((c) => (c.fieldtype === "Link" ? [c.options ?? ""] : c.fieldtype === "Dynamic Link" ? shown.map((d) => String(d[c.options ?? ""] ?? "")) : [])).filter(Boolean))];
  const ms = Math.max(1, Math.round(performance.now() - t0));
  const cell = (d: Doc, c: DocField) => {
    const raw = d[c.fieldname!];
    // Currency / Float / Date / Check cells use the shared System Settings formatting (format.ts), like list and form cells
    const v = raw === undefined || raw === null || raw === "" ? "" : ["Link", "Dynamic Link", "Data", "Select"].includes(c.fieldtype) ? String(raw) : formatValue(c.fieldtype, raw, { options: c.options, doc: d });
    const t = reportCellTarget({ fieldname: c.fieldname!, fieldtype: c.fieldtype, options: c.options }, d, exists);
    return t ? <ReportDocLink doctype={t.doctype} name={t.name}>{v}</ReportDocLink> : <span data-no-i18n={c.fieldtype === "Select" ? undefined : ""}>{v}</span>;
  };
  return (
    <div className="mt-4" data-split-report>
      <ReportPreviewScope doctypes={doctypes}>
        <div className="panel min-w-0 overflow-auto" style={{ maxHeight: "70vh" }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-start text-xs text-muted-foreground"><tr>{cols.map((c) => <th key={c.fieldname} className={`whitespace-nowrap px-3 py-2 ${["Currency", "Float", "Int", "Percent"].includes(c.fieldtype) ? "text-end" : "text-start"}`}>{c.label ?? c.fieldname}</th>)}</tr></thead>
            <tbody>{shown.map((d) => (
              <tr key={d.name} className="border-t border-border">
                {cols.map((c) => <td key={c.fieldname} className={`whitespace-nowrap px-3 py-1.5 ${["Currency", "Float", "Int", "Percent"].includes(c.fieldtype) ? "text-end tabular-nums" : ""}`}>{cell(d, c)}</td>)}
              </tr>))}</tbody>
          </table>
          <div className="flex border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span><span>Preview listing of records</span>: <span>{ref_.name}</span> · <span>the source report query is not run.</span></span>
            <span className="ms-auto" data-execution-time><span>Execution Time</span>: <span data-no-i18n>{ms} ms</span></span>
          </div>
        </div>
      </ReportPreviewScope>
    </div>
  );
}
