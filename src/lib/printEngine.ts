/**
 * Print engine — renders every source Print Format (public/catalog/print_formats.json, from scripts/extract-print-formats.py)
 * over adapter records: Jinja formats through src/lib/jinja.ts, Print Format Builder formats from format_data,
 * plus Frappe's "Standard" meta-driven format and the Digit Arabic tax invoice. Display-only; nothing is written.
 */
import { queryOptions } from "@tanstack/react-query";
import { adapter } from "./adapter";
import { loadMeta, LAYOUT_TYPES, TABLE_TYPES, type IndexEntry, type DocTypeMeta, type DocField } from "./catalog";
import { formatValue, fmtCurrencyPlain as fmtCurrency, fmtDate, NUMERIC } from "./format";
import { renderJinjaTemplate, sanitizeHtml, evalJinjaExpr } from "./jinja";
import { arabicMoneyInWords } from "./arabicWords";
import { moneyInWords } from "./formCalc";
import { translateTo, type Lang } from "@/i18n";
import type { Doc } from "./adapter";
import { BRAND_HEADER, frameHtml, stateAr } from "./printFrame";
import { currentUser, levelAccess } from "./session";
import { scopedList } from "./scope";
import { cleanLabel, recordLabel } from "@/components/enterprise/kit/labels";

export type PrintFormatDef = { name: string; doc_type: string; app: string; source: string; print_format_type: string; html: string; css: string; format_data: string;
  raw_printing: number; disabled: number; standard?: string; print_format_builder?: number; print_format_builder_beta?: number; default_print_language?: string | null; align_labels_right?: number; show_section_headings?: number; absolute_value?: number };
const APP_FORMATS: PrintFormatDef[] = [];
/** Apps add their own print formats (e.g. the Construction bilingual Jinja formats) to the formats every print screen offers. */
export function registerPrintFormats(defs: PrintFormatDef[]): void { for (const d of defs) if (!APP_FORMATS.some((x) => x.name === d.name)) APP_FORMATS.push(d); }
export const printFormatsQuery = queryOptions({ queryKey: ["catalog-print-formats"], queryFn: () => fetch("/catalog/print_formats.json").then((r) => r.json() as Promise<PrintFormatDef[]>).then((r) => [...r, ...APP_FORMATS.filter((a) => !r.some((x) => x.name === a.name))]), staleTime: Infinity, enabled: typeof window !== "undefined" });

export const STANDARD = "Standard";
export const DIGIT_TAX_INVOICE = "Digit Arabic Tax Invoice";
const TAX_INVOICE_DOCTYPES = new Set(["Sales Invoice", "POS Invoice"]);

export function formatsFor(all: PrintFormatDef[], doctype: string): string[] {
  const own = all.filter((p) => p.doc_type === doctype && !p.disabled).map((p) => p.name);
  return [STANDARD, ...(TAX_INVOICE_DOCTYPES.has(doctype) ? [DIGIT_TAX_INVOICE] : []), ...own];
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
// frappe printview is_visible: print_hide decides, not hidden (a hidden fetched name such as Quotation customer_name still prints)
const vis = (f: DocField, d: Doc) => !f["print_hide"] && d[f.fieldname!] !== undefined && d[f.fieldname!] !== null && d[f.fieldname!] !== "" && !(NUMERIC.has(f.fieldtype) && !Number(d[f.fieldname!]) && !f.reqd);

export type PrintCtx = { meta: DocTypeMeta; doc: Doc; childMeta: Record<string, DocTypeMeta>; lang: Lang; letterHead?: Doc | null | undefined;
  /** inside the Enterprise print frame (printFrame.ts): the frame draws header, title band and footer, the renderer only the body */
  framed?: boolean | undefined };

function fv(ctx: PrintCtx, f: DocField | undefined, v: unknown, d: Doc) {
  if (!f) return esc(v);
  if (f.fieldtype === "Check") return v ? "✓" : "";
  if (f.fieldtype === "Text Editor" || f.fieldtype === "HTML Editor") return sanitizeHtml(String(v ?? ""));
  // Enterprise frame: linked masters print by their readable title (item name, party name), never a code or company suffix
  // a user (approved_by, reviewed_by …) prints by full name, never the login e-mail
  if (ctx.framed && typeof v === "string" && v.includes("@") && (f.fieldtype === "Data" || (f.fieldtype === "Link" && f.options === "User"))) { const u = adapter.get("User", v); const n = String(u?.["full_name"] ?? "").trim(); if (n) return esc(n); }
  // a Data / Dynamic Link cell that holds a master's code (task, project, party, employee) prints that master's title too
  if (ctx.framed && (f.fieldtype === "Data" || f.fieldtype === "Dynamic Link") && typeof v === "string" && /^[A-Z][A-Z0-9]+-[A-Z0-9-]+$/.test(v)) { const t = recordLabel(v, CODE_MASTERS); if (t !== v && t !== cleanLabel(v)) return esc(translateTo(t, ctx.lang)); }
  if (ctx.framed && f.fieldtype === "Link" && typeof v === "string" && v) { const t = translateTo(recordLabel(v, TITLED.has(String(f.options ?? "")) ? [String(f.options), ...MASTERS] : MASTERS), ctx.lang); return f.options === "Item" && t !== v ? `${esc(t)}<small class="pf-merged" dir="ltr">${esc(v)}</small>` : esc(t); }
  const s = formatValue(f.fieldtype, v, { options: f.options, doc: d });
  if (ctx.framed && f.fieldname === "workflow_state" && ctx.lang === "ar" && typeof v === "string") return esc(stateAr(v, d));
  return esc(f.fieldtype === "Select" ? translateTo(s, ctx.lang) : s);
}
const MASTERS = ["Customer", "Supplier", "Item", "Employee"];
/** master records a print names by their title (owner rule: names, not codes) — a project, crew or machine; documents keep their number */
const TITLED = new Set(["Project", "Task", "Digit Crew", "Digit Machinery", "Digit Subcontractor Profile", "Digit Client Contract"]);
const CODE_MASTERS = ["Task", "Project", "Customer", "Supplier", "Employee", "Digit Crew", "Digit Machinery"];
const L = (ctx: PrintCtx, s: string) => esc(translateTo(s, ctx.lang));
/** A print column heading: an item line's money "Rate" is the unit price ("سعر الوحدة"), never the percentage word the
 *  dictionary gives a tax rate; every other heading is the field's own label. */
export function colLabel(ctx: Pick<PrintCtx, "lang">, x: { fieldname?: string | undefined; label?: string | undefined; fieldtype?: string | undefined }): string {
  if (ctx.lang === "ar" && /^(rate|price_list_rate|base_rate|net_rate)$/.test(x.fieldname ?? "") && x.fieldtype === "Currency") return esc(x.fieldname === "price_list_rate" ? "سعر القائمة" : "سعر الوحدة");
  return esc(translateTo(x.label ?? x.fieldname ?? "", ctx.lang as Lang));
}

/** Grid columns of the Standard print: the list-view columns that print; a print-hidden Link column (Purchase Invoice Item
 * item_code) gives way to the printable field that fetches its name (item_name ← item_code.item_name), so a row never prints
 * without its item — frappe get_visible_columns prints every visible column with a value, this keeps only the named one. */
export function listColumns(cm: DocTypeMeta, rows: Doc[]): DocField[] {
  const out: DocField[] = [];
  for (const x of cm.fields) {
    if (!x.in_list_view || LAYOUT_TYPES.has(x.fieldtype)) continue;
    if (!x["print_hide"]) { out.push(x); continue; }
    if (x.fieldtype !== "Link") continue;
    const named = cm.fields.find((y) => !y["print_hide"] && !y.in_list_view && String(y["fetch_from"] ?? "").startsWith(`${x.fieldname}.`) && /_name$/.test(y.fieldname ?? "") && rows.some((r) => r[y.fieldname!]));
    if (named && !out.includes(named)) out.push(named);
  }
  return out;
}

function childTable(ctx: PrintCtx, f: DocField, d: Doc, cols?: { fieldname: string; print_width?: string }[]) {
  const rows = (d[f.fieldname!] as Doc[]) ?? []; if (!rows.length) return "";
  const cm = ctx.childMeta[f.options ?? ""]; if (!cm) return "";
  const byName = new Map(cm.fields.map((x) => [x.fieldname!, x]));
  let fields = cols?.length ? cols.map((c) => byName.get(c.fieldname)).filter(Boolean) as DocField[] : listColumns(cm, rows);
  if (!fields.length) fields = cm.fields.filter((x) => !LAYOUT_TYPES.has(x.fieldtype) && !x.hidden).slice(0, 5);
  return `<table class="pf-table"><thead><tr><th class="pf-sr">${L(ctx, "Sr")}</th>${fields.map((x) => `<th class="${NUMERIC.has(x.fieldtype) ? "pf-num" : ""}">${colLabel(ctx, x)}</th>`).join("")}</tr></thead><tbody>${rows.map((r, i) => `<tr><td class="pf-sr">${i + 1}</td>${fields.map((x) => `<td class="${NUMERIC.has(x.fieldtype) ? "pf-num" : ""}">${fv(ctx, x, r[x.fieldname!], r)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function header(ctx: PrintCtx, title: string) {
  if (ctx.framed) return "";
  const lh = ctx.letterHead ? `<div class="pf-letterhead">${sanitizeHtml(String(ctx.letterHead["content"] ?? ""))}</div>` : "";
  return `${lh}<div class="pf-heading"><h2>${L(ctx, title)}</h2><div class="pf-sub">${esc(ctx.doc.name)}</div></div>`;
}

/** Frappe "Standard" print: sections/columns from meta, child tables, hides empty and print_hide fields. */
export function renderStandard(ctx: PrintCtx): string {
  const { meta, doc } = ctx; const parts: string[] = [header(ctx, meta.name)];
  let section: { label?: string | undefined; cols: string[][] } = { cols: [[]] }; const sections: typeof section[] = [section];
  for (const f of meta.fields) {
    if (f.fieldtype === "Section Break" || f.fieldtype === "Tab Break") { section = { label: f.label, cols: [[]] }; sections.push(section); continue; }
    if (f.fieldtype === "Column Break") { section.cols.push([]); continue; }
    if (LAYOUT_TYPES.has(f.fieldtype)) continue;
    if (TABLE_TYPES.has(f.fieldtype)) { if (f["print_hide"]) continue; const t = childTable(ctx, f, doc); if (t) section.cols[section.cols.length - 1]!.push(`<div class="pf-field pf-wide"><div class="pf-label">${L(ctx, f.label ?? "")}</div>${t}</div>`); continue; }
    if (!vis(f, doc)) continue;
    section.cols[section.cols.length - 1]!.push(`<div class="pf-field"><div class="pf-label">${L(ctx, f.label ?? f.fieldname!)}</div><div class="pf-value">${fv(ctx, f, doc[f.fieldname!], doc)}</div></div>`);
  }
  for (const s of sections) {
    const cols = s.cols.filter((c) => c.length); if (!cols.length) continue;
    parts.push(`<section class="pf-section">${s.label ? `<h4>${L(ctx, s.label)}</h4>` : ""}<div class="pf-row" style="grid-template-columns:repeat(${cols.length},minmax(0,1fr))">${cols.map((c) => `<div>${c.join("")}</div>`).join("")}</div></section>`);
  }
  return parts.join("");
}

type FDItem = { fieldname?: string; fieldtype?: string; label?: string; options?: string; print_hide?: number; visible_columns?: { fieldname: string; print_width?: string }[] };
/** Print Format Builder (format_data JSON) rendering. */
export function renderBuilder(ctx: PrintCtx, pf: PrintFormatDef): string {
  let items: FDItem[] = []; try { items = JSON.parse(pf.format_data); } catch { return renderStandard(ctx); }
  const byName = new Map(ctx.meta.fields.map((f) => [f.fieldname!, f]));
  const out: string[] = []; let cols: string[][] | null = null; let label: string | undefined;
  const flush = () => { if (cols) { const c = cols.filter((x) => x.length); if (c.length) out.push(`<section class="pf-section">${label && pf.show_section_headings ? `<h4>${L(ctx, label)}</h4>` : ""}<div class="pf-row" style="grid-template-columns:repeat(${c.length},minmax(0,1fr))">${c.map((x) => `<div>${x.join("")}</div>`).join("")}</div></section>`); } cols = null; };
  const push = (h: string) => { if (!cols) cols = [[]]; cols[cols.length - 1]!.push(h); };
  if (ctx.letterHead && !ctx.framed) out.push(`<div class="pf-letterhead">${sanitizeHtml(String(ctx.letterHead["content"] ?? ""))}</div>`);
  for (const it of items) {
    if (it.print_hide) continue;
    if (it.fieldtype === "Section Break") { flush(); cols = [[]]; label = it.label; continue; }
    if (it.fieldtype === "Column Break") { if (!cols) cols = []; cols.push([]); continue; }
    if (it.fieldtype === "Custom HTML") { push(jinjaHtml(ctx, it.options ?? "")); continue; }
    const f = byName.get(it.fieldname ?? ""); if (!f) continue;
    if (TABLE_TYPES.has(f.fieldtype)) { const t = childTable(ctx, f, ctx.doc, it.visible_columns); if (t) push(t); continue; }
    if (!vis(f, ctx.doc)) continue;
    push(`<div class="pf-field${pf.align_labels_right ? " pf-right" : ""}"><div class="pf-label">${L(ctx, it.label ?? f.label ?? f.fieldname!)}</div><div class="pf-value">${fv(ctx, f, ctx.doc[f.fieldname!], ctx.doc)}</div></div>`);
  }
  flush();
  return out.join("");
}

type BetaCol = { label?: string; fieldname: string; fieldtype: string; options?: string; width?: number; merged_fields?: { fieldname: string; fieldtype: string }[]; column_condition?: string };
type BetaField = { label?: string; fieldname: string; fieldtype: string; options?: string; html?: string; show_label?: string; custom_style?: string; align?: string; label_justify?: string; label_color?: string; visible_if?: string;
  table_columns?: BetaCol[]; table_header_bg?: string; source?: string; repeater_columns?: { template: { t: string; v: string }[]; align?: string; width?: number; color?: string }[]; row_condition?: string };
type BetaPart = { label?: string; show_label?: string; columns?: { label?: string; width?: number; fields: BetaField[] }[]; margin?: { top?: number; right?: number; bottom?: number; left?: number } };
const safeStyle = (s?: string) => esc((s ?? "").replace(/url\s*\(|expression\s*\(|javascript:/gi, "").replace(/\n/g, " "));
/** Print Format Builder (beta) — header / sections / footer JSON of frappe v16 print designer. */
export function renderBeta(ctx: PrintCtx, pf: PrintFormatDef): string {
  let d: { header?: BetaPart; sections?: BetaPart[]; footer?: BetaPart }; try { d = JSON.parse(pf.format_data); } catch { return renderStandard(ctx); }
  const jc = jinjaCtx(ctx); const doc = jc["doc"] as Doc;
  const cond = (e: string | undefined, extra: Record<string, unknown> = {}) => { if (!e) return true; try { return !!evalJinjaExpr(e, { ...jc, ...extra }); } catch { return true; } };
  const childField = (dt: string | undefined, fn: string) => (dt ? ctx.childMeta[dt]?.fields.find((f) => f.fieldname === fn) : undefined);
  const cell = (dt: string | undefined, r: Doc, fn: string, ft: string) => { const f = childField(dt, fn) ?? ({ fieldname: fn, fieldtype: ft } as DocField); return fv(ctx, f, r[fn], r); };
  const field = (f: BetaField): string => {
    if (!cond(f.visible_if)) return "";
    const style = safeStyle(f.custom_style);
    if (f.fieldtype === "HTML") return `<div style="${style}">${jinjaHtml(ctx, f.html ?? "")}</div>`;
    if (f.fieldtype === "Divider") return `<hr class="pf-divider"/>`;
    if (f.fieldtype === "Table") {
      const rows = (doc[f.fieldname] as Doc[]) ?? []; if (!rows.length) return "";
      const cols = (f.table_columns ?? []).filter((c) => cond(c.column_condition));
      return `<table class="pf-table"><thead><tr>${cols.map((c) => `<th style="width:${c.width ?? ""}%;${f.table_header_bg ? `background:${safeStyle(f.table_header_bg)}` : ""}" class="${NUMERIC.has(c.fieldtype) ? "pf-num" : ""}">${colLabel(ctx, c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${NUMERIC.has(c.fieldtype) ? "pf-num" : ""}">${c.fieldname === "idx" ? esc(r["idx"]) : cell(f.options, r, c.fieldname, c.fieldtype)}${(c.merged_fields ?? []).map((m) => ` <span class="pf-merged">${cell(f.options, r, m.fieldname, m.fieldtype)}</span>`).join("")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    if (f.fieldtype === "Repeater") {
      const rows = ((doc[f.source ?? ""] as Doc[]) ?? []).filter((r) => cond(f.row_condition, { row: r }));
      const tdt = ctx.meta.fields.find((x) => x.fieldname === f.source)?.options;
      return rows.map((r) => `<div class="pf-repeat">${(f.repeater_columns ?? []).map((c) => `<div style="width:${c.width ?? 50}%;text-align:${c.align === "right" ? "end" : "start"};color:${safeStyle(c.color)}">${c.template.map((t) => (t.t === "f" ? cell(tdt, r, t.v, childField(tdt, t.v)?.fieldtype ?? "Data") : esc(t.v))).join("")}</div>`).join("")}</div>`).join("");
    }
    const df = ctx.meta.fields.find((x) => x.fieldname === f.fieldname) ?? ({ fieldname: f.fieldname, fieldtype: f.fieldtype, options: f.options } as DocField);
    const v = ctx.doc[f.fieldname]; if (v === undefined || v === null || v === "") return "";
    const val = fv(ctx, df, v, ctx.doc);
    if (f.show_label === "hide") return `<div class="pf-bfield" style="${style}">${val}</div>`;
    return `<div class="pf-bfield pf-bl" style="justify-content:${f.label_justify === "space-between" ? "space-between" : "flex-start"};${style}"><span class="pf-label" style="${f.label_color ? `color:${safeStyle(f.label_color)}` : ""}">${L(ctx, f.label ?? f.fieldname)}</span><span class="pf-value ${NUMERIC.has(df.fieldtype) ? "pf-num" : ""}">${val}</span></div>`;
  };
  const part = (p?: BetaPart) => { const cols = (p?.columns ?? []).filter((c) => c.fields.length); if (!cols.length) return "";
    return `<section class="pf-section" style="margin-top:${p?.margin?.top ?? 0}px">${p?.label && p.show_label !== "hide" ? `<h4>${L(ctx, p.label)}</h4>` : ""}<div class="pf-flex">${cols.map((c) => `<div style="flex:0 0 ${c.width ? c.width + "%" : "auto"};${c.width ? "" : "flex:1"}">${c.fields.map(field).join("")}</div>`).join("")}</div></section>`; };
  const lh = ctx.letterHead && !ctx.framed ? `<div class="pf-letterhead">${sanitizeHtml(String(ctx.letterHead["content"] ?? ""))}</div>` : "";
  return lh + part(d.header) + (d.sections ?? []).map(part).join("") + part(d.footer);
}

/**
 * frappe.get_list / get_all inside a print template, honouring filters, order_by and limit as Frappe does
 * (filters as a dict, [field, op, value] lists or a positional dict), so a template that lists the rows of
 * one document prints the same rows in the preview and on the server.
 */
const QUERY_KEYS = new Set(["filters", "fields", "order_by", "limit", "limit_page_length", "pluck"]);
/**
 * Row rules apps add to frappe.get_list in templates (e.g. DIGIT HR's team-only identity rule); they only remove rows
 * the shared permission check already allows. frappe.get_all stays unrestricted, as in Frappe.
 */
const LIST_SCOPES: ((dt: string, d: Doc, user: string) => boolean)[] = [];
export function registerPrintListScope(f: (dt: string, d: Doc, user: string) => boolean): void { if (!LIST_SCOPES.includes(f)) LIST_SCOPES.push(f); }
/** frappe.get_list source: rows the session user may read (permission query) narrowed by the registered app rules. */
export const readableRows = (dt: string): Doc[] => { const u = currentUser(); return scopedList(dt, u).filter((d) => LIST_SCOPES.every((f) => f(dt, d, u))); };
/** frappe apply_fieldlevel_read_permissions: fields at a permission level the reader cannot read print empty. */
export function readableFields(meta: DocTypeMeta, doc: Doc): Doc {
  const lv = levelAccess(meta); const out: Doc = { ...doc } as Doc;
  for (const f of meta.fields) if (f.fieldname && !lv.read.has(Number(f["permlevel"] ?? 0))) delete (out as Record<string, unknown>)[f.fieldname];
  return out;
}
export function listQuery(dt: string, args: unknown[], wrap: (d: Doc) => Doc, source: (dt: string) => Doc[] = (x) => adapter.list(x)): unknown[] {
  const objs = args.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
  const kw = objs.find((o) => Object.keys(o).some((k) => QUERY_KEYS.has(k))) ?? {};
  const f = kw["filters"] ?? objs.find((o) => o !== kw) ?? (Array.isArray(args[0]) ? args[0] : undefined);
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const cmp = (a: unknown, b: unknown) => { const x = Number(a), y = Number(b); return str(a) !== "" && str(b) !== "" && Number.isFinite(x) && Number.isFinite(y) ? x - y : str(a).localeCompare(str(b)); };
  const test = (d: Doc, k: string, op: string, v: unknown): boolean => {
    const x = d[k];
    switch (op.toLowerCase()) {
      case "!=": return str(x) !== str(v);
      case "in": return (Array.isArray(v) ? v : str(v).split(",")).map(str).includes(str(x));
      case "not in": return !(Array.isArray(v) ? v : str(v).split(",")).map(str).includes(str(x));
      case ">": return cmp(x, v) > 0; case "<": return cmp(x, v) < 0; case ">=": return cmp(x, v) >= 0; case "<=": return cmp(x, v) <= 0;
      case "is": return str(v) === "set" ? str(x) !== "" : str(x) === "";
      case "like": return str(x).toLowerCase().includes(str(v).replace(/%/g, "").toLowerCase());
      default: return str(x) === str(v);
    }
  };
  const conds: [string, string, unknown][] = !f ? [] : Array.isArray(f)
    ? (f as unknown[]).filter(Array.isArray).map((c) => { const r = c as unknown[]; return (r.length >= 4 ? [str(r[1]), str(r[2]), r[3]] : [str(r[0]), str(r[1]), r[2]]) as [string, string, unknown]; })
    : Object.entries(f as Record<string, unknown>).map(([k, v]) => (Array.isArray(v) ? [k, str(v[0]), v[1]] : [k, "=", v]) as [string, string, unknown]);
  let rows = source(dt).filter((d) => conds.every(([k, op, v]) => test(d, k, op, v)));
  const ob = typeof kw["order_by"] === "string" ? kw["order_by"].trim().split(/\s+/) : [];
  if (ob[0]) { const fld = ob[0].replace(/^`?tab[^`]*`?\./, ""); const desc = (ob[1] ?? "").toLowerCase() === "desc"; rows = [...rows].sort((a, b) => (desc ? -1 : 1) * cmp(a[fld], b[fld])); }
  const lim = Number(kw["limit"] ?? kw["limit_page_length"]); if (lim > 0) rows = rows.slice(0, lim);
  if (typeof kw["pluck"] === "string") { const k = kw["pluck"]; return rows.map((r) => r[k]); }
  return rows.map(wrap);
}

function jinjaCtx(ctx: PrintCtx): Record<string, unknown> {
  const { doc, meta } = ctx;
  const field = (d: Doc, fname: string) => { const m = d === doc ? meta : Object.values(ctx.childMeta).find((x) => x.name === d["doctype"]) ?? meta; return m.fields.find((f) => f.fieldname === fname); };
  const wrap = (d: Doc): Doc => {
    const w: Doc = { ...d } as Doc;
    for (const [k, v] of Object.entries(d)) if (Array.isArray(v)) (w as Record<string, unknown>)[k] = v.map((r) => (r && typeof r === "object" ? wrap(r as Doc) : r));
    Object.assign(w, {
      get_formatted: (f: string) => { const df = field(d, f); return df ? formatValue(df.fieldtype, d[f], { options: df.options, doc: d }) : String(d[f] ?? ""); },
      get: (f: string, dflt?: unknown) => (w as Record<string, unknown>)[f] ?? dflt,
      meta: { get_label: (f: string) => translateTo(field(d, f)?.label ?? f, ctx.lang), get_field: (f: string) => field(d, f), istable: false, name: meta.name },
    });
    return w;
  };
  const tr = (s: string) => translateTo(String(s ?? ""), ctx.lang);
  const utils = {
    fmt_money: (v: unknown, _p?: unknown, cur?: string) => fmtCurrency(Number(v) || 0, cur ?? String(doc["currency"] ?? "SAR")),
    formatdate: (v: unknown) => fmtDate(v), format_date: (v: unknown) => fmtDate(v), getdate: (v: unknown) => v, nowdate: () => new Date().toISOString().slice(0, 10), flt: (v: unknown, p = 2) => Number((Number(v) || 0).toFixed(p)), cint: (v: unknown) => Math.trunc(Number(v) || 0), cstr: (v: unknown) => String(v ?? ""),
    money_in_words: (v: unknown, cur?: string) => (ctx.lang === "ar" ? arabicMoneyInWords(Number(v) || 0) : moneyInWords(Number(v) || 0, cur ?? "SAR")),
    get_url: () => "", strip_html: (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, ""),
  };
  const frappe = {
    utils, _: tr, format: (v: unknown, df?: { fieldtype?: string; options?: string }) => formatValue(df?.fieldtype ?? "Data", v, { options: df?.options, doc }), format_value: (v: unknown, df?: { fieldtype?: string }) => formatValue(df?.fieldtype ?? "Data", v, { doc }),
    db: { get_value: (dt: string, name: unknown, f: string | string[]) => { const r = typeof name === "string" ? adapter.get(dt, name) : undefined; return Array.isArray(f) ? f.map((x) => r?.[x]) : r?.[f]; }, get_single_value: (dt: string, f: string) => adapter.get(dt, dt)?.[f] },
    get_doc: (dt: string, name: string) => { const r = adapter.get(dt, name); return r ? wrap(r) : {}; }, get_cached_doc: (dt: string, name: string) => { const r = adapter.get(dt, name); return r ? wrap(r) : {}; },
    get_list: (dt: string, ...a: unknown[]) => listQuery(dt, a, wrap, readableRows), get_all: (dt: string, ...a: unknown[]) => listQuery(dt, a, wrap), session: { user: "Administrator" }, form_dict: {}, lang: ctx.lang,
  };
  return { doc: wrap(doc), _: tr, frappe, letter_head: ctx.letterHead?.["content"] ?? "", no_letterhead: !ctx.letterHead, print_settings: {}, len: (v: { length?: number }) => v?.length ?? 0, range: (a: number, b?: number) => { const [s, e] = b === undefined ? [0, a] : [a, b]; return Array.from({ length: Math.max(0, e - s) }, (_, i) => s + i); }, abs: Math.abs, int: (v: unknown) => Math.trunc(Number(v) || 0), str: (v: unknown) => String(v ?? ""), flt: utils.flt, cint: utils.cint, money_in_words: utils.money_in_words, format_date: utils.formatdate };
}
function jinjaHtml(ctx: PrintCtx, tpl: string) { try { return renderJinjaTemplate(tpl, jinjaCtx(ctx)); } catch { return ""; } }

/**
 * VAT of one invoice line for the tax invoice (ZATCA asks for the line VAT): the line's own item tax rate (item_tax_rate,
 * account → rate) when set, else the invoice's percentage tax rows on the net total; when the invoice carries taxes with no
 * stated rate the line takes its share of the invoice VAT by amount. Display only — nothing is stored or posted.
 */
export function lineVat(doc: Doc, row: Doc): { rate: number; amount: number } {
  const amt = Number(row["amount"]) || 0; const r2 = (v: number) => Math.round(v * 100) / 100;
  let own: Record<string, unknown> | null = null;
  try { const raw = row["item_tax_rate"]; own = typeof raw === "string" && raw.trim() ? JSON.parse(raw) as Record<string, unknown> : raw && typeof raw === "object" ? raw as Record<string, unknown> : null; } catch { own = null; }
  if (own && Object.keys(own).length) { const rate = Object.values(own).reduce<number>((a, v) => a + (Number(v) || 0), 0); return { rate, amount: r2(amt * rate / 100) }; }
  const taxes = ((doc["taxes"] as Doc[]) ?? []).filter((t) => String(t["charge_type"] ?? "On Net Total") === "On Net Total" && Number(t["rate"]));
  if (taxes.length) { const rate = taxes.reduce((a, t) => a + (Number(t["rate"]) || 0), 0); return { rate, amount: r2(amt * rate / 100) }; }
  const total = Number(doc["total_taxes_and_charges"]) || 0; const net = Number(doc["net_total"] ?? doc["total"]) || 0;
  if (!total || !net) return { rate: 0, amount: 0 };
  return { rate: r2((total / net) * 100), amount: r2(total * (amt / net)) };
}

/**
 * Owner rule (names, not codes): a Jinja format that prints a master's code as a whole cell (project, customer,
 * supplier, contract, crew) shows the master's title instead. Display only — the template and the record are unchanged.
 */
export function relabelMasters(html: string, meta: DocTypeMeta, doc: Doc, lang: Lang): string {
  let out = html;
  for (const f of meta.fields) {
    const v = doc[f.fieldname ?? ""]; const dt = String(f.options ?? "");
    if (f.fieldtype !== "Link" || typeof v !== "string" || !v || !(TITLED.has(dt) || MASTERS.includes(dt))) continue;
    const t = translateTo(recordLabel(v, [dt]), lang); if (!t || t === v) continue;
    out = out.split(`>${esc(v)}<`).join(`>${esc(t)}<`);
  }
  const ws = String(doc["workflow_state"] ?? "");
  if (lang === "ar" && ws) { const t = translateTo(ws, "ar"); if (t && t !== ws) out = out.split(`>${esc(ws)}<`).join(`>${esc(t)}<`); }
  return out;
}

/** Digit Arabic tax invoice (simplified/standard VAT layout, bilingual headings, SAR amount in Arabic words). Not a ZATCA certification. */
export function renderTaxInvoice(ctx: PrintCtx): string {
  const { doc } = ctx; const company: Record<string, unknown> = adapter.get("Company", String(doc["company"] ?? "")) ?? {};
  const AR: Record<string, string> = { Seller: "البائع", "VAT Number": "الرقم الضريبي", Customer: "العميل", "Customer VAT Number": "الرقم الضريبي للعميل", "Invoice Date": "تاريخ الفاتورة", Item: "الصنف", Quantity: "الكمية", Rate: "سعر الوحدة", "Unit Price": "سعر الوحدة", "VAT %": "نسبة الضريبة", "VAT Amount": "مبلغ الضريبة", "Amount incl. VAT": "المبلغ شامل الضريبة", Amount: "المبلغ",
    "Total (Excluding VAT)": "الإجمالي غير شامل الضريبة", Discount: "الخصم", "Total VAT": "إجمالي ضريبة القيمة المضافة", "Total Amount Due": "إجمالي المبلغ المستحق", "In Words": "المبلغ كتابةً" };
  const B = (en: string) => `<span class="pf-bi">${esc(AR[en] ?? translateTo(en, "ar"))}<small>${esc(en)}</small></span>`;
  const items = (doc["items"] as Doc[]) ?? []; const cur = String(doc["currency"] ?? "SAR");
  const m = (v: unknown) => esc(fmtCurrency(Number(v) || 0, cur));
  const isReturn = !!doc["is_return"];
  // inside the frame the seller name, VAT number, title and number sit once in the frame header and title band
  const seller = ctx.framed ? "" : `<div><div class="pf-field"><div class="pf-label">${B("Seller")}</div><div class="pf-value">${esc(company["name"] ?? doc["company"])}</div></div>
        <div class="pf-field"><div class="pf-label">${B("VAT Number")}</div><div class="pf-value" dir="ltr">${esc(company["tax_id"] ?? "—")}</div></div></div>`;
  return `${ctx.letterHead && !ctx.framed ? `<div class="pf-letterhead">${sanitizeHtml(String(ctx.letterHead["content"] ?? ""))}</div>` : ""}
  ${ctx.framed ? "" : `<div class="pf-heading"><h2>${isReturn ? "إشعار دائن ضريبي — Tax Credit Note" : "فاتورة ضريبية — Tax Invoice"}</h2><div class="pf-sub">${esc(doc.name)}</div></div>`}
  <section class="pf-section"><div class="pf-row" style="grid-template-columns:${ctx.framed ? "1fr" : "1fr 1fr"}">
   ${seller}
   <div><div class="pf-field"><div class="pf-label">${B("Customer")}</div><div class="pf-value">${esc(doc["customer_name"] ?? doc["customer"])}</div></div>
        <div class="pf-field"><div class="pf-label">${B("Customer VAT Number")}</div><div class="pf-value" dir="ltr">${esc(adapter.get("Customer", String(doc["customer"] ?? ""))?.["tax_id"] ?? "—")}</div></div>
        <div class="pf-field"><div class="pf-label">${B("Invoice Date")}</div><div class="pf-value">${esc(fmtDate(doc["posting_date"]))}</div></div></div>
  </div></section>
  <table class="pf-table"><thead><tr><th class="pf-sr">#</th><th>${B("Item")}</th><th class="pf-num">${B("Quantity")}</th><th class="pf-num">${B("Unit Price")}</th><th class="pf-num">${B("Amount")}</th><th class="pf-num">${B("VAT %")}</th><th class="pf-num">${B("VAT Amount")}</th><th class="pf-num">${B("Amount incl. VAT")}</th></tr></thead>
  <tbody>${items.map((r, i) => { const v = lineVat(doc, r); return `<tr data-pf-line-vat="${v.amount}"><td class="pf-sr">${i + 1}</td><td><bdi dir="auto">${esc(r["item_name"] ?? r["item_code"])}</bdi></td><td class="pf-num">${esc(r["qty"])}</td><td class="pf-num">${m(r["rate"])}</td><td class="pf-num">${m(r["amount"])}</td><td class="pf-num" dir="ltr">${esc(`${v.rate}%`)}</td><td class="pf-num">${m(v.amount)}</td><td class="pf-num">${m((Number(r["amount"]) || 0) + v.amount)}</td></tr>`; }).join("")}</tbody></table>
  <table class="pf-totals"><tbody>
   <tr><td>${B("Total (Excluding VAT)")}</td><td class="pf-num">${m(doc["net_total"] ?? doc["total"])}</td></tr>
   ${Number(doc["discount_amount"]) ? `<tr><td>${B("Discount")}</td><td class="pf-num">${m(doc["discount_amount"])}</td></tr>` : ""}
   <tr><td>${B("Total VAT")}</td><td class="pf-num">${m(doc["total_taxes_and_charges"])}</td></tr>
   <tr class="pf-grand"><td>${B("Total Amount Due")}</td><td class="pf-num">${m(doc["rounded_total"] || doc["grand_total"])}</td></tr>
  </tbody></table>
  <div class="pf-words"><b>${B("In Words")}</b> ${esc(arabicMoneyInWords(Math.abs(Number(doc["rounded_total"] || doc["grand_total"]) || 0)))}</div>`;
}

/**
 * Render one document in a print format inside the Enterprise print frame. `letterHead`: BRAND_HEADER (default) = the
 * company branding header, a Letter Head name = that letter head as the header, "" / null = no header.
 */
export async function renderPrint(index: IndexEntry[], all: PrintFormatDef[], doctype: string, name: string, format: string, lang: Lang, letterHead: string | null = BRAND_HEADER) {
  const meta = await loadMeta(index, doctype); const stored = adapter.get(doctype, name);
  if (!meta || !stored) return { html: "", css: "", kind: "missing" as const };
  const doc = readableFields(meta, stored);
  const childMeta: Record<string, DocTypeMeta> = {};
  for (const f of meta.fields) if (TABLE_TYPES.has(f.fieldtype) && f.options && !childMeta[f.options]) { const m = await loadMeta(index, f.options); if (m) childMeta[f.options] = m; }
  const lh = letterHead && letterHead !== BRAND_HEADER ? adapter.get("Letter Head", letterHead) ?? null : null;
  const ctx: PrintCtx = { meta, doc, childMeta, lang, letterHead: lh, framed: true };
  const frame = (body: string, own: boolean) => frameHtml({ doctype, doc, lang, body, header: letterHead === BRAND_HEADER ? "brand" : lh, titleBand: !own, submittable: !!meta.is_submittable });
  if (format === STANDARD) return { html: frame(renderStandard(ctx), false), css: "", kind: "standard" as const };
  if (format === DIGIT_TAX_INVOICE) return { html: frame(renderTaxInvoice(ctx), false), css: "", kind: "digit" as const };
  const pf = all.find((p) => p.name === format && p.doc_type === doctype);
  if (!pf) return { html: frame(renderStandard(ctx), false), css: "", kind: "standard" as const };
  // frappe.get_list checks permissions against each listed DocType's definition: load them first (unknown = no rows)
  for (const m of (pf.html ?? "").matchAll(/frappe\.get_list\(\s*["']([^"']+)["']/g)) await loadMeta(index, m[1]!);
  if (pf.html && pf.print_format_type !== "JS") return { html: frame(relabelMasters(jinjaHtml(ctx, pf.html), meta, doc, lang), true), css: pf.css, kind: "jinja" as const };
  if (pf.format_data && pf.print_format_builder_beta) return { html: frame(renderBeta(ctx, pf), true), css: pf.css, kind: "builder-beta" as const };
  if (pf.format_data) return { html: frame(renderBuilder(ctx, pf), true), css: pf.css, kind: "builder" as const };
  return { html: frame(renderStandard(ctx), false), css: pf.css, kind: "standard" as const };
}
