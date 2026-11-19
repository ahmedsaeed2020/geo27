/**
 * Data Import / Data Export engine — mirrors frappe/core/doctype/data_import (importer.py, exporter.py)
 * conventions client-side over the shared adapter. Template headers use field labels; child-table
 * columns are "Label (Table Label)"; continuation rows (empty main ID) belong to the previous parent.
 */
import * as XLSX from "xlsx";
import { adapter, type Doc } from "@/lib/adapter";
import { LAYOUT_TYPES, TABLE_TYPES, loadMeta, type DocField, type DocTypeMeta, type IndexEntry } from "@/lib/catalog";

export type ImportType = "Insert New Records" | "Update Existing Records";
export interface TableSpec { key: string; label: string; meta: DocTypeMeta; parentfield?: string | undefined; fields: DocField[] }
export interface Column { header: string; table: string; fieldname: string }
export interface RowIssue { row: number; messages: string[] }
export interface ImportResult { row: number; ok: boolean; name?: string; messages: string[]; raw: string[] }

const SKIP_TYPES = new Set([...LAYOUT_TYPES, "Read Only"]);
export const importableFields = (m: DocTypeMeta) =>
  m.fields.filter((f) => f.fieldname && !SKIP_TYPES.has(f.fieldtype) && !TABLE_TYPES.has(f.fieldtype));
export const isMandatory = (f: DocField) => !!f.reqd && !f.default;

/** Main table + every child Table field (main first), as in the Download Template dialog. */
export async function tableSpecs(index: IndexEntry[], meta: DocTypeMeta): Promise<TableSpec[]> {
  const out: TableSpec[] = [{ key: meta.name, label: meta.name, meta, fields: importableFields(meta) }];
  for (const f of meta.fields.filter((x) => x.fieldtype === "Table" && x.options)) {
    const cm = await loadMeta(index, f.options!);
    if (cm) out.push({ key: f.fieldname!, label: f.label || f.fieldname!, meta: cm, parentfield: f.fieldname, fields: importableFields(cm) });
  }
  return out;
}

export function headerFor(spec: TableSpec, f: DocField) {
  return spec.parentfield ? `${f.label || f.fieldname} (${spec.label})` : f.label || f.fieldname!;
}

/** Build template rows: header + optional sample rows from adapter data. */
export function templateRows(specs: TableSpec[], selected: Record<string, string[]>, sample: number, doctype: string): string[][] {
  const cols: { spec: TableSpec; f: DocField | { fieldname: "name"; label: string; fieldtype: "Data" } }[] = [];
  cols.push({ spec: specs[0]!, f: { fieldname: "name", label: "ID", fieldtype: "Data" } });
  for (const s of specs) for (const fn of selected[s.key] ?? []) { const f = s.fields.find((x) => x.fieldname === fn); if (f) cols.push({ spec: s, f }); }
  const head = cols.map((c) => (c.f.fieldname === "name" ? "ID" : headerFor(c.spec, c.f as DocField)));
  const rows: string[][] = [head];
  for (const d of adapter.list(doctype).slice(0, sample)) {
    const childLists = specs.slice(1).map((s) => (Array.isArray(d[s.parentfield ?? ""]) ? (d[s.parentfield ?? ""] as Doc[]) : []));
    const n = Math.max(1, ...childLists.map((l) => l.length));
    for (let i = 0; i < n; i++) rows.push(cols.map((c) => {
      if (c.spec === specs[0]!) return i === 0 ? cell(d[c.f.fieldname ?? ""]) : "";
      const ch = childLists[specs.indexOf(c.spec) - 1]?.[i];
      return ch ? cell(ch[c.f.fieldname ?? ""]) : "";
    }));
  }
  return rows;
}
const cell = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function download(rows: string[][], base: string, type: "CSV" | "Excel") {
  let blob: Blob;
  if (type === "CSV") blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" });
  else {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
    blob = new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${base}.${type === "CSV" ? "csv" : "xlsx"}`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const toCSV = (rows: string[][]) =>
  "\ufeff" + rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n");

export async function parseFile(file: File): Promise<string[][]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
  const ws = wb.Sheets[wb.SheetNames[0] ?? ""]!;
  return (XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false }) as unknown[][])
    .map((r) => r.map((v) => String(v ?? "").trim()))
    .filter((r) => r.some(Boolean));
}

/** Auto-match file header → field by header text, label or fieldname (importer.py header matching). */
export function autoMap(headers: string[], specs: TableSpec[]): (Column | null)[] {
  return headers.map((h) => {
    const k = h.trim().toLowerCase();
    if (k === "id" || k === "name") return { header: h, table: specs[0]!.key, fieldname: "name" };
    for (const s of specs) for (const f of s.fields) {
      const cands = [headerFor(s, f), s.parentfield ? `${f.fieldname} (${s.label})` : f.fieldname!, ...(s.parentfield ? [] : [f.label ?? ""])];
      if (cands.some((c) => c && c.toLowerCase() === k)) return { header: h, table: s.key, fieldname: f.fieldname! };
    }
    return null;
  });
}

export interface Parsed { row: number; raw: string[]; doc: Record<string, unknown>; childRows: number[] }

/** Group file rows into documents (continuation rows have empty main columns). */
function group(data: string[][], map: (Column | null)[], specs: TableSpec[]): Parsed[] {
  const main = specs[0]!.key; const out: Parsed[] = [];
  data.forEach((r, i) => {
    const mainVals = map.map((c, j) => (c && c.table === main ? r[j] : "")).filter(Boolean);
    let cur = out[out.length - 1];
    if (mainVals.length || !cur) { cur = { row: i + 2, raw: r, doc: {}, childRows: [] }; out.push(cur); }
    else cur.childRows.push(i + 2);
    const children: Record<string, Record<string, unknown>> = {};
    map.forEach((c, j) => {
      if (!c || r[j] === "") return;
      if (c.table === main) cur.doc[c.fieldname] = r[j];
      else (children[c.table] ??= {})[c.fieldname] = r[j];
    });
    for (const [t, ch] of Object.entries(children)) ((cur.doc[t] ??= []) as Record<string, unknown>[]).push({ ...ch, parentfield: t, doctype: specs.find((s) => s.key === t)!.meta.name });
  });
  return out;
}

/** Name a new document gets on insert: explicit ID, autoname "field:x", or the controller autoname ported for tree masters. */
export function importName(meta: { name: string; autoname?: string | undefined }, v: Record<string, unknown>): string | undefined {
  if (v["name"]) return String(v["name"]);
  const an = meta.autoname ?? "";
  if (an.startsWith("field:")) { const x = v[an.slice(6)]; return x ? String(x) : undefined; }
  // erpnext/accounts/doctype/account/account.py autoname → get_autoname_with_number(account_number, account_name, company): "<number - >name - abbr"
  if (meta.name === "Account" && v["account_name"] && v["company"]) { const ab = adapter.get("Company", String(v["company"]))?.["abbr"]; if (ab) return `${v["account_number"] ? `${v["account_number"]} - ` : ""}${v["account_name"]} - ${ab}`; }
  return undefined;
}

function fieldIssues(spec: TableSpec, v: Record<string, unknown>, where: string, insert: boolean, pending?: Set<string>): string[] {
  const m: string[] = [];
  for (const f of spec.fields) {
    const val = v[f.fieldname!];
    const empty = val == null || val === "";
    if (empty) { if (insert && isMandatory(f)) m.push(`${where}Value missing for: ${f.label}`); continue; }
    const s = String(val);
    if (f.fieldtype === "Link" && f.options && !adapter.get(f.options, s) && !(f.options === spec.meta.name && pending?.has(s))) m.push(`${where}Could not find ${f.options}: ${s}`);
    if (f.fieldtype === "Select" && f.options) { const opts = f.options.split("\n"); if (!opts.includes(s)) m.push(`${where}${f.label} cannot be "${s}". It should be one of ${opts.filter(Boolean).map((o) => `"${o}"`).join(", ")}`); }
    if (["Int", "Float", "Currency", "Percent", "Check"].includes(f.fieldtype) && isNaN(Number(s.replace(/,/g, "")))) m.push(`${where}${f.label}: "${s}" is not a valid number`);
    if (["Date", "Datetime"].includes(f.fieldtype) && isNaN(Date.parse(s))) m.push(`${where}${f.label}: "${s}" is not a valid date (use YYYY-MM-DD)`);
  }
  return m;
}

function coerce(spec: TableSpec, v: Record<string, unknown>) {
  for (const f of spec.fields) {
    const x = v[f.fieldname!];
    if (x === "" || x == null) continue;
    if (["Int", "Check"].includes(f.fieldtype)) v[f.fieldname!] = parseInt(String(x).replace(/,/g, ""), 10);
    else if (["Float", "Currency", "Percent"].includes(f.fieldtype)) v[f.fieldname!] = Number(String(x).replace(/,/g, ""));
  }
  return v;
}

export function validate(data: string[][], map: (Column | null)[], specs: TableSpec[], type: ImportType): { docs: Parsed[]; issues: RowIssue[] } {
  const docs = group(data, map, specs); const issues: RowIssue[] = []; const dt = specs[0]!.meta.name; const seen = new Set<string>();
  const insert = type === "Insert New Records";
  // tree imports: parents created by earlier rows of the same file are valid link targets (imported parents first)
  const pending = new Set(docs.map((d) => importName(specs[0]!.meta, d.doc)).filter((x): x is string => !!x));
  for (const d of docs) {
    const m = fieldIssues(specs[0]!, d.doc, "", insert, pending);
    const id = d.doc["name"] ? String(d.doc["name"]) : "";
    if (insert && id && (adapter.get(dt, id) || seen.has(id))) m.push(`${dt} ${id} already exists (Duplicate name)`);
    if (!insert && !id) m.push("ID is required to update existing records");
    if (!insert && id && !adapter.get(dt, id)) m.push(`${dt} ${id} not found`);
    if (id) seen.add(id);
    for (const s of specs.slice(1)) ((d.doc[s.key] as Record<string, unknown>[] | undefined) ?? []).forEach((ch, i) => m.push(...fieldIssues(s, ch, `${s.label} row ${i + 1}: `, true)));
    if (m.length) issues.push({ row: d.row, messages: m });
  }
  return { docs, issues };
}

/** Run the import through the adapter; returns per-document results (import log). */
export function runImport(docs: Parsed[], issues: RowIssue[], specs: TableSpec[], type: ImportType, submit: boolean): ImportResult[] {
  const dt = specs[0]!.meta.name; const bad = new Map(issues.map((i) => [i.row, i.messages]));
  return docs.map((d) => {
    if (bad.has(d.row)) return { row: d.row, ok: false, messages: bad.get(d.row)!, raw: d.raw };
    const v = coerce(specs[0]!, { ...d.doc });
    for (const s of specs.slice(1)) if (Array.isArray(v[s.key])) v[s.key] = (v[s.key] as Record<string, unknown>[]).map((c, i) => ({ ...coerce(s, c), idx: i + 1 }));
    if (submit && specs[0]!.meta.is_submittable) v["docstatus"] = 1;
    if (type === "Update Existing Records") { const n = String(v["name"]); delete v["name"]; adapter.update(dt, n, v); return { row: d.row, ok: true, name: n, messages: ["Updated"], raw: d.raw }; }
    const nm = importName(specs[0]!.meta, v); if (nm) v["name"] = nm;
    const doc = adapter.insertDoc(dt, v);
    return { row: d.row, ok: true, name: doc.name, messages: [submit && specs[0]!.meta.is_submittable ? "Created and submitted" : "Created"], raw: d.raw };
  });
}

/** "Export Errored Rows": original header + rows + an Error column. */
export function erroredRows(header: string[], results: ImportResult[]): string[][] {
  return [[...header, "Error"], ...results.filter((r) => !r.ok).map((r) => [...r.raw, r.messages.join("; ")])];
}
