/**
 * DIGIT shared Core visual query studio (Part B: CF-19). A user picks a record type, its fields and the fields of records it
 * links to (one hop), filters, grouping and totals; the result is a table and a chart. Every read goes through the shared
 * permission boundary (scope.ts / session.ts): only records the user may read are counted, and a linked record type the
 * user may not read gives no columns. A query is saved as a native Report Builder report (columns, filters, group by) with
 * the full studio query kept beside it, so it opens in the report screen and back in the studio.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta, LAYOUT_TYPES, TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";
import { currentUser, hasPerm, userRoles } from "@/lib/session";
import { canReadType, scopedGet, scopedList } from "@/lib/scope";
import { matchFilter, type Filter } from "@/lib/desk";

export type Bi = [string, string];
export type Agg = "count" | "sum" | "avg" | "min" | "max";
export interface StudioField { key: string; label: string; fieldtype: string; via?: string }
export interface StudioQuery { doctype: string; columns: string[]; filters: { field: string; op: string; value: string }[]; groupBy: string[]; aggregates: { fn: Agg; field?: string }[]; orderBy?: string; desc?: boolean; limit?: number }
export interface StudioResult { columns: StudioField[]; rows: Record<string, unknown>[]; total: number; error?: Bi }
const s = (v: unknown) => String(v ?? "");
const r2 = (x: number) => Math.round(x * 100) / 100;
const NUM = new Set(["Currency", "Float", "Int", "Percent"]);
const dataFields = (m: DocTypeMeta) => m.fields.filter((f) => f.fieldname && !LAYOUT_TYPES.has(f.fieldtype) && !TABLE_TYPES.has(f.fieldtype) && !["HTML", "Button", "Image", "Attach Image", "Signature", "Text Editor", "Code"].includes(f.fieldtype));

/** Fields of the record type plus, for each link the user may follow, the linked record's fields ("customer.customer_group"). */
export function studioFields(doctype: string, user = currentUser()): StudioField[] {
  const m = cachedMeta(doctype); if (!m) return [];
  const own: StudioField[] = [{ key: "name", label: "ID", fieldtype: "Link" }, ...(m.is_submittable ? [{ key: "docstatus", label: "Document Status", fieldtype: "Int" }] : []), ...dataFields(m).map((f) => ({ key: f.fieldname!, label: f.label ?? f.fieldname!, fieldtype: f.fieldtype }))];
  const joined: StudioField[] = [];
  for (const f of dataFields(m).filter((x) => x.fieldtype === "Link" && x.options)) {
    const t = cachedMeta(s(f.options)); if (!t || !canReadType(t.name, user)) continue;
    for (const g of dataFields(t).filter((x) => x.in_list_view || x.in_standard_filter || x.bold || ["Select", "Link"].includes(x.fieldtype)).slice(0, 12)) joined.push({ key: `${f.fieldname}.${g.fieldname}`, label: `${f.label ?? f.fieldname} › ${g.label ?? g.fieldname}`, fieldtype: g.fieldtype, via: t.name });
  }
  return [...own, ...joined];
}
function valueOf(d: Doc, key: string, m: DocTypeMeta, user: string): unknown {
  if (!key.includes(".")) return d[key];
  const [link, field] = key.split(".") as [string, string]; const f = m.fields.find((x) => x.fieldname === link); const target = s(f?.options);
  const t = target && s(d[link]) ? scopedGet(target, s(d[link]), user) : undefined; return t?.[field];
}
/** Run the query as the user. */
export function runStudio(q: StudioQuery, user = currentUser()): StudioResult {
  const m = cachedMeta(q.doctype); if (!m) return { columns: [], rows: [], total: 0, error: ["The record type is still loading — try again.", "نوع السجل ما زال يُحمَّل — حاول مجددًا."] };
  if (!hasPerm(m, "read", undefined, user)) return { columns: [], rows: [], total: 0, error: [`You may not read ${q.doctype}.`, `لا يحق لك قراءة ${q.doctype}.`] };
  const fields = new Map(studioFields(q.doctype, user).map((f) => [f.key, f]));
  const bad = [...q.columns, ...q.groupBy, ...q.filters.map((f) => f.field), ...q.aggregates.map((a) => a.field ?? "")].filter((k) => k && !fields.has(k));
  if (bad.length) return { columns: [], rows: [], total: 0, error: [`Unknown or restricted fields: ${bad.join(", ")}`, `حقول غير معروفة أو مقيدة: ${bad.join("، ")}`] };
  const docs = scopedList(q.doctype, user).filter((d) => q.filters.every((f) => (f.field.includes(".") ? matchFilter({ name: "", doctype: "", v: valueOf(d, f.field, m, user) } as Doc, ["v", f.op, f.value] as Filter) : matchFilter(d, [f.field, f.op, f.value] as Filter))));
  const limit = Math.min(500, Math.max(1, q.limit ?? 100));
  if (!q.groupBy.length) {
    const cols = (q.columns.length ? q.columns : ["name"]).map((k) => fields.get(k)!);
    let rows = docs.map((d) => Object.fromEntries(cols.map((c) => [c.key, valueOf(d, c.key, m, user) ?? null])));
    if (q.orderBy && fields.has(q.orderBy)) { const k = q.orderBy; const dir = q.desc === false ? 1 : -1; rows = rows.sort((a, b) => { const x = a[k], y = b[k]; return (typeof x === "number" && typeof y === "number" ? x - y : s(x).localeCompare(s(y))) * dir; }); }
    return { columns: cols, rows: rows.slice(0, limit), total: rows.length };
  }
  const aggs = q.aggregates.length ? q.aggregates : [{ fn: "count" as Agg }];
  const groups = new Map<string, Doc[]>(); for (const d of docs) { const k = JSON.stringify(q.groupBy.map((g) => s(valueOf(d, g, m, user)) || "—")); groups.set(k, [...(groups.get(k) ?? []), d]); }
  const aggCol = (a: { fn: Agg; field?: string }): StudioField => ({ key: a.fn === "count" ? "count" : `${a.fn}_${a.field}`, label: a.fn === "count" ? "Count" : `${a.fn[0]!.toUpperCase()}${a.fn.slice(1)} of ${fields.get(a.field ?? "")?.label ?? a.field}`, fieldtype: a.fn === "count" ? "Int" : fields.get(a.field ?? "")?.fieldtype ?? "Float" });
  const cols = [...q.groupBy.map((g) => fields.get(g)!), ...aggs.map(aggCol)];
  let rows = [...groups].map(([k, list]) => {
    const keys = JSON.parse(k) as string[]; const row: Record<string, unknown> = Object.fromEntries(q.groupBy.map((g, i) => [g, keys[i]]));
    for (const a of aggs) { const vals = a.fn === "count" ? [] : list.map((d) => Number(valueOf(d, a.field!, m, user)) || 0); const c = aggCol(a);
      row[c.key] = a.fn === "count" ? list.length : a.fn === "sum" ? r2(vals.reduce((x, y) => x + y, 0)) : a.fn === "avg" ? r2(vals.reduce((x, y) => x + y, 0) / Math.max(1, vals.length)) : a.fn === "min" ? Math.min(...vals) : Math.max(...vals); }
    return row;
  });
  const sortKey = q.orderBy && cols.some((c) => c.key === q.orderBy) ? q.orderBy : aggCol(aggs[0]!).key;
  rows = rows.sort((a, b) => { const x = a[sortKey], y = b[sortKey]; const d = typeof x === "number" && typeof y === "number" ? x - y : s(x).localeCompare(s(y)); return q.desc === false ? d : -d; });
  return { columns: cols, rows: rows.slice(0, limit), total: rows.length };
}
export const chartable = (r: StudioResult) => r.columns.length >= 2 && NUM.has(r.columns[r.columns.length - 1]!.fieldtype) || (r.columns.at(-1)?.key === "count");
/** Save as a native Report Builder report (Report Manager / System Manager), keeping the studio query to reopen it. */
export function saveStudio(q: StudioQuery, title: string, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  const roles = userRoles(user); if (user !== "Administrator" && !roles.some((r) => r === "System Manager" || r === "Report Manager")) return { ok: false, reason: ["Saving reports needs the Report Manager role.", "حفظ التقارير يحتاج دور مدير التقارير."] };
  const t = title.trim(); if (!t) return { ok: false, reason: ["Give the report a name.", "أعطِ التقرير اسمًا."] };
  if (adapter.get("Report", t)) return { ok: false, reason: [`A report named ${t} already exists.`, `يوجد تقرير باسم ${t}.`] };
  const r = runStudio(q, user); if (r.error) return { ok: false, reason: r.error };
  const agg = q.aggregates[0];
  const json = { columns: q.columns.filter((c) => !c.includes(".")).map((c) => [c, q.doctype]), filters: q.filters.filter((f) => !f.field.includes(".")).map((f) => [q.doctype, f.field, f.op, f.value]),
    group_by: q.groupBy[0] && !q.groupBy[0].includes(".") ? { group_by: q.groupBy[0], aggregate_function: agg?.fn ?? "count", aggregate_on: agg?.field ?? "" } : null, digit_query: q };
  adapter.insertDoc("Report", { name: t, report_name: t, ref_doctype: q.doctype, report_type: "Report Builder", is_standard: "No", module: cachedMeta(q.doctype)?.module ?? "", json: JSON.stringify(json), owner: user });
  return { ok: true, name: t };
}
export function studioQueryOf(report: string): StudioQuery | null { try { const j = JSON.parse(s(adapter.get("Report", report)?.["json"]) || "{}") as { digit_query?: StudioQuery }; return j.digit_query ?? null; } catch { return null; } }
