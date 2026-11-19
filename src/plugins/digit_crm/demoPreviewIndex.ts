/**
 * Read-only sample-dataset preview index (pure functions; used by demoPreview.worker.ts and unit tests).
 *
 * The CRM enterprise demo corpus (~15k records) is generated in a background worker from the source generator and indexed
 * there; the page only ever receives one page of rows at a time. Nothing here writes records or browser storage.
 */
import type { Doc } from "@/lib/adapter";

export type PreviewTypeId = "leads" | "deals" | "organizations" | "contacts" | "tasks";
export interface PreviewColumn { key: string; en: string; ar: string; kind?: "money" | "date" | "status" | "code" }
export interface PreviewType { id: PreviewTypeId; doctype: string; en: string; ar: string; title: string; search: string[]; facet?: string; columns: PreviewColumn[] }

/** Registers shown in the preview (source DocTypes and fieldnames of the CRM generator). */
export const PREVIEW_TYPES: PreviewType[] = [
  { id: "leads", doctype: "CRM Lead", en: "Leads", ar: "العملاء المحتملون", title: "lead_name", search: ["name", "lead_name", "email", "organization_name", "lead_owner"], facet: "status",
    columns: [{ key: "name", en: "ID", ar: "المعرّف", kind: "code" }, { key: "lead_name", en: "Lead", ar: "العميل المحتمل" }, { key: "organization_name", en: "Organization", ar: "المنشأة" }, { key: "status", en: "Status", ar: "الحالة", kind: "status" }, { key: "source", en: "Source", ar: "المصدر" }, { key: "lead_owner", en: "Owner", ar: "المسؤول" }, { key: "creation", en: "Created", ar: "تاريخ الإنشاء", kind: "date" }] },
  { id: "deals", doctype: "CRM Deal", en: "Deals", ar: "الصفقات", title: "deal_name", search: ["name", "deal_name", "organization_name", "deal_owner"], facet: "status",
    columns: [{ key: "name", en: "ID", ar: "المعرّف", kind: "code" }, { key: "deal_name", en: "Deal", ar: "الصفقة" }, { key: "organization_name", en: "Organization", ar: "المنشأة" }, { key: "status", en: "Status", ar: "الحالة", kind: "status" }, { key: "deal_value", en: "Value", ar: "القيمة", kind: "money" }, { key: "expected_closure_date", en: "Expected close", ar: "الإغلاق المتوقع", kind: "date" }, { key: "deal_owner", en: "Owner", ar: "المسؤول" }] },
  { id: "organizations", doctype: "CRM Organization", en: "Organizations", ar: "المنشآت", title: "organization_name", search: ["name", "organization_name", "industry"], facet: "industry",
    columns: [{ key: "name", en: "ID", ar: "المعرّف", kind: "code" }, { key: "organization_name", en: "Organization", ar: "المنشأة" }, { key: "industry", en: "Industry", ar: "القطاع" }, { key: "no_of_employees", en: "Employees", ar: "عدد الموظفين" }, { key: "annual_revenue", en: "Annual revenue", ar: "الإيراد السنوي", kind: "money" }] },
  { id: "contacts", doctype: "Contact", en: "Contacts", ar: "جهات الاتصال", title: "full_name", search: ["name", "full_name", "email_id", "organization_name"],
    columns: [{ key: "name", en: "ID", ar: "المعرّف", kind: "code" }, { key: "full_name", en: "Name", ar: "الاسم" }, { key: "email_id", en: "Email", ar: "البريد الإلكتروني", kind: "code" }, { key: "organization_name", en: "Organization", ar: "المنشأة" }] },
  { id: "tasks", doctype: "CRM Task", en: "Tasks", ar: "المهام", title: "title", search: ["name", "title", "reference_docname", "assigned_to"], facet: "status",
    columns: [{ key: "name", en: "ID", ar: "المعرّف", kind: "code" }, { key: "title", en: "Task", ar: "المهمة" }, { key: "status", en: "Status", ar: "الحالة", kind: "status" }, { key: "priority", en: "Priority", ar: "الأولوية" }, { key: "reference_docname", en: "Linked record", ar: "السجل المرتبط", kind: "code" }, { key: "due_date", en: "Due", ar: "الاستحقاق", kind: "date" }] },
];
export const previewType = (id: string) => PREVIEW_TYPES.find((t) => t.id === id) ?? PREVIEW_TYPES[0]!;

/** Activity DocTypes linked to a lead/deal by reference (counts shown on a record). */
const ACTIVITY: [string, string, string][] = [["CRM Task", "reference_doctype", "reference_docname"], ["FCRM Note", "reference_doctype", "reference_docname"], ["Communication", "reference_doctype", "reference_name"], ["CRM Call Log", "reference_doctype", "reference_docname"]];

interface TypeIndex { rows: Doc[]; hay: string[]; byName: Map<string, Doc> }
export interface PreviewIndex { types: Record<string, TypeIndex>; counts: Record<string, number>; activity: Map<string, Record<string, number>>; total: number }

/** Builds the index from the generated records of each DocType (`rowsOf` returns the fixture rows of a DocType). */
export function buildPreviewIndex(doctypes: string[], rowsOf: (doctype: string) => Doc[]): PreviewIndex {
  const counts: Record<string, number> = {};
  for (const dt of doctypes) { const n = rowsOf(dt).length; if (n) counts[dt] = n; }
  const orgName = new Map(rowsOf("CRM Organization").map((o) => [o.name, String(o["organization_name"] ?? o.name)]));
  const types: Record<string, TypeIndex> = {};
  for (const t of PREVIEW_TYPES) {
    const rows = rowsOf(t.doctype).map((d) => {
      const org = String(d["organization"] ?? d["company_name"] ?? "");
      return org && orgName.has(org) && !d["organization_name"] ? { ...d, organization_name: orgName.get(org) } : d;
    }).sort((a, b) => String(b["creation"] ?? "").localeCompare(String(a["creation"] ?? "")) || a.name.localeCompare(b.name));
    types[t.id] = { rows, hay: rows.map((r) => t.search.map((k) => String(r[k] ?? "")).join(" ").toLowerCase()), byName: new Map(rows.map((r) => [r.name, r])) };
  }
  const activity = new Map<string, Record<string, number>>();
  for (const [dt, refDt, refName] of ACTIVITY) for (const r of rowsOf(dt)) {
    const key = `${r[refDt]}::${r[refName]}`; const c = activity.get(key) ?? {}; c[dt] = (c[dt] ?? 0) + 1; activity.set(key, c);
  }
  return { types, counts, activity, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

export interface PreviewQuery { type: PreviewTypeId; q?: string; facet?: string; page?: number; pageSize?: number }
export interface PreviewPage { rows: Record<string, unknown>[]; total: number; page: number; pages: number; pageSize: number; facets: [string, number][] }

/** One page of a register: search over the type's search fields, optional facet value, newest first. */
export function queryPreview(index: PreviewIndex, query: PreviewQuery): PreviewPage {
  const t = previewType(query.type), ti = index.types[t.id];
  const pageSize = Math.min(Math.max(query.pageSize ?? 25, 5), 100);
  if (!ti) return { rows: [], total: 0, page: 1, pages: 1, pageSize, facets: [] };
  const q = (query.q ?? "").trim().toLowerCase();
  const searched = q ? ti.rows.filter((_, i) => ti.hay[i]!.includes(q)) : ti.rows;
  const facetCounts = new Map<string, number>();
  if (t.facet) for (const r of searched) { const v = String(r[t.facet] ?? ""); facetCounts.set(v, (facetCounts.get(v) ?? 0) + 1); }
  const matched = t.facet && query.facet ? searched.filter((r) => String(r[t.facet!] ?? "") === query.facet) : searched;
  const pages = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(Math.max(query.page ?? 1, 1), pages);
  const rows = matched.slice((page - 1) * pageSize, page * pageSize).map((r) => Object.fromEntries([["name", r.name], ...t.columns.map((c) => [c.key, r[c.key] ?? ""])]));
  return { rows, total: matched.length, page, pages, pageSize, facets: [...facetCounts.entries()].sort((a, b) => b[1] - a[1]) };
}

/** Framework bookkeeping columns not shown on a record. */
const FRAMEWORK = new Set(["name", "doctype", "docstatus", "idx", "parent", "parenttype", "parentfield"]);
export interface PreviewRecord { doctype: string; name: string; fields: [string, unknown][]; activity: Record<string, number> }
/** One record with its scalar fields (child tables summarised by row count) and its linked activity counts. */
export function previewRecord(index: PreviewIndex, type: PreviewTypeId, name: string): PreviewRecord | undefined {
  const t = previewType(type), d = index.types[t.id]?.byName.get(name);
  if (!d) return undefined;
  const fields = Object.entries(d).filter(([k, v]) => !k.startsWith("__") && !FRAMEWORK.has(k) && v !== "" && v != null).map(([k, v]) => [k, Array.isArray(v) ? `${v.length} ×` : v] as [string, unknown]);
  return { doctype: t.doctype, name, fields, activity: index.activity.get(`${t.doctype}::${name}`) ?? {} };
}
